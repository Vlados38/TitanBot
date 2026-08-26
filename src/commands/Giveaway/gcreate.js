import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import {
    parseDuration,
    validatePrize,
    validateWinnerCount,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import { botConfig } from '../../config/bot.js';

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Создать новый розыгрыш в указанном канале.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "Продолжительность розыгрыша (например, 1h, 30m, 5d).",
                )
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Количество победителей.")
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Приз, который будет разыгран.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Канал для публикации розыгрыша (по умолчанию текущий канал).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Откладываем ответ заранее: отправка сообщения розыгрыша и запись в БД могут занять больше 3 секунд
        await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });

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
                'У пользователя нет права ManageGuild',
                ErrorTypes.PERMISSION,
                "Для запуска розыгрыша вам необходимо право 'Управление сервером'.",
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                }
            );
        }

        logger.info(
            `Создание розыгрыша начато пользователем ${interaction.user.tag} на сервере ${interaction.guildId}`
        );

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");
        const targetChannel =
            interaction.options.getChannel("channel") || interaction.channel;

        const durationMs = parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prizeName = validatePrize(prize);

        if (!targetChannel.isTextBased()) {
            throw new TitanBotError(
                'Целевой канал не является текстовым',
                ErrorTypes.VALIDATION,
                'Выбранный канал должен быть текстовым каналом.',
                {
                    channelId: targetChannel.id,
                    channelType: targetChannel.type
                }
            );
        }

        const endTime = Date.now() + durationMs;

        const initialGiveawayData = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            createdAt: new Date().toISOString()
        };

        const embed = createGiveawayEmbed(initialGiveawayData, "active");
        const row = createGiveawayButtons(false);

        const giveawayMessage = await targetChannel.send({
            content: "🎉 **НОВЫЙ РОЗЫГРЫШ** 🎉",
            embeds: [embed],
            components: [row],
        });

        initialGiveawayData.messageId = giveawayMessage.id;

        const saved = await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!saved) {
            logger.warn(
                `Не удалось сохранить розыгрыш в базу данных: ${giveawayMessage.id}`
            );
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `Создан розыгрыш: ${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Приз',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: 'Победители',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Продолжительность',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: 'Канал',
                            value: targetChannel.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug(
                'Ошибка при записи события создания розыгрыша:',
                logError
            );
        }

        logger.info(
            `Розыгрыш успешно создан: ${giveawayMessage.id} в ${targetChannel.name}`
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Розыгрыш запущен! 🎉`,
                    `Новый розыгрыш приза **${prizeName}** был запущен в ${targetChannel} и завершится через **${durationString}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
