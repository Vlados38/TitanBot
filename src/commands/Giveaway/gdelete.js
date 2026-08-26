import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "Удаляет сообщение розыгрыша и удаляет его из базы данных.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("ID сообщения розыгрыша, который нужно удалить.")
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
                "Вам необходимо разрешение «Управление сервером», чтобы удалить розыгрыш.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Начато удаление розыгрыша пользователем ${interaction.user.tag} на сервере ${interaction.guildId}`);

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
                "Розыгрыш с таким ID сообщения не найден.",
                { messageId, guildId: interaction.guildId }
            );
        }

        let deletedMessage = false;
        let channelName = "Неизвестный канал";

        const tryDeleteFromChannel = async (channel) => {
            if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                return false;
            }

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return false;
            }

            await message.delete();
            channelName = channel.name || 'неизвестный-канал';
            deletedMessage = true;
            return true;
        };

        try {
            const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
            if (await tryDeleteFromChannel(channel)) {
                logger.debug(`Сообщение розыгрыша ${messageId} удалено из канала ${channelName}`);
            }

            if (!deletedMessage && interaction.guild) {
                const textChannels = interaction.guild.channels.cache.filter(
                    ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                );

                for (const [, guildChannel] of textChannels) {
                    const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);
                    if (foundAndDeleted) {
                        logger.debug(`Сообщение розыгрыша ${messageId} удалено через резервный поиск в #${channelName}`);
                        break;
                    }
                }
            }
        } catch (error) {
            logger.warn(`Не удалось удалить сообщение розыгрыша: ${error.message}`);
        }

        const removedFromDatabase = await deleteGiveaway(
            interaction.client,
            interaction.guildId,
            messageId,
        );

        if (!removedFromDatabase) {
            throw new TitanBotError(
                `Не удалось удалить розыгрыш из базы данных: ${messageId}`,
                ErrorTypes.UNKNOWN,
                'Не удалось удалить розыгрыш из базы данных. Попробуйте ещё раз.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const giveawaysAfterDelete = await getGuildGiveaways(interaction.client, interaction.guildId);
        const stillExistsInDatabase = giveawaysAfterDelete.some(g => g.messageId === messageId);

        if (stillExistsInDatabase) {
            throw new TitanBotError(
                `Розыгрыш всё ещё существует после удаления: ${messageId}`,
                ErrorTypes.UNKNOWN,
                'Удаление не сохранилось в базе данных. Попробуйте ещё раз.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const statusMsg = deletedMessage
            ? `и сообщение было удалено из #${channelName}`
            : `но сообщение уже было удалено или канал недоступен.`;

        const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
        const hasWinners = winnerIds.length > 0;
        const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

        const winnerStatusMsg = hasWinners
            ? `Для этого розыгрыша уже был выбран ${winnerIds.length} победитель(ей).`
            : wasEnded
                ? 'Этот розыгрыш был завершён без действительных победителей.'
                : 'До удаления победитель не был выбран.';

        logger.info(`Розыгрыш удалён: ${messageId} в ${channelName}`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                data: {
                    description: `Розыгрыш удалён: ${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Приз',
                            value: giveaway.prize || 'Неизвестно',
                            inline: true
                        },
                        {
                            name: 'Участники',
                            value: (giveaway.participants?.length || 0).toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Ошибка при записи удаления розыгрыша:', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Розыгрыш удалён",
                    `Розыгрыш с призом **${giveaway.prize}** успешно удалён ${statusMsg}. ${winnerStatusMsg}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
