import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Немедленно завершает активный розыгрыш и выбирает победителя(ей).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("ID сообщения розыгрыша, который нужно завершить.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Команда розыгрыша использована вне сервера',
                ErrorTypes.VALIDATION,
                'Эту команду можно использовать только на сервере.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'У пользователя нет разрешения ManageGuild',
                ErrorTypes.PERMISSION,
                "Вам необходимо разрешение «Управление сервером», чтобы завершить розыгрыш.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Начато завершение розыгрыша пользователем ${interaction.user.tag} на сервере ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Неверный формат ID сообщения',
                ErrorTypes.VALIDATION,
                'Укажите корректный ID сообщения.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Розыгрыш не найден: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Розыгрыш с таким ID сообщения не найден в базе данных.",
                { messageId, guildId: interaction.guildId }
            );
        }

        const endResult = await endGiveawayService(
            interaction.client,
            giveaway,
            interaction.guildId,
            interaction.user.id
        );

        const updatedGiveaway = endResult.giveaway;
        const winners = endResult.winners;

        const channel = await interaction.client.channels.fetch(
            updatedGiveaway.channelId,
        ).catch(err => {
            logger.warn(`Не удалось получить канал ${updatedGiveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            throw new TitanBotError(
                `Канал не найден: ${updatedGiveaway.channelId}`,
                ErrorTypes.VALIDATION,
                "Не удалось найти канал, в котором проходил розыгрыш. Состояние розыгрыша обновлено.",
                { channelId: updatedGiveaway.channelId, messageId }
            );
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Не удалось получить сообщение ${messageId}:`, err.message);
                return null;
            });

        if (!message) {
            throw new TitanBotError(
                `Сообщение не найдено: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Не удалось найти сообщение розыгрыша. Состояние розыгрыша обновлено.",
                { messageId, channelId: updatedGiveaway.channelId }
            );
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🎉 **РОЗЫГРЫШ ЗАВЕРШЁН** 🎉",
            embeds: [newEmbed],
            components: [newRow],
        });

        if (winners.length > 0) {
            const winnerMentions = winners
                .map((id) => `<@${id}>`)
                .join(",");

            const winnerPingMsg = await channel.send({
                content: `🎉 ПОЗДРАВЛЯЕМ ${winnerMentions}! Вы выиграли в розыгрыше **${updatedGiveaway.prize}**! Свяжитесь с организатором <@${updatedGiveaway.hostId}>, чтобы получить свой приз.`,
            });

            updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
            await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

            logger.info(`Розыгрыш завершён с ${winners.length} победителем(ями): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Розыгрыш завершён с ${winners.length} победителем(ями)`,
                        channelId: channel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Приз',
                                value: updatedGiveaway.prize || 'Таинственный приз!',
                                inline: true
                            },
                            {
                                name: 'Победители',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Участники',
                                value: endResult.participantCount.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Ошибка при записи события о победителе розыгрыша:', logError);
            }
        } else {
            await channel.send({
                content: `Розыгрыш с призом **${updatedGiveaway.prize}** завершён без действительных участников.`,
            });

            logger.info(`Розыгрыш завершён без победителей: ${messageId}`);
        }

        logger.info(`Розыгрыш успешно завершён пользователем ${interaction.user.tag}: ${messageId}`);

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Розыгрыш завершён ✅",
                    `Розыгрыш с призом **${updatedGiveaway.prize}** успешно завершён в ${channel}. Выбрано победителей: **${winners.length}** из **${endResult.participantCount}** участников.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
