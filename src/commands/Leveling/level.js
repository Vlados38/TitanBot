import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import {
    getLevelingConfig,
    saveLevelingConfig,
} from '../../services/leveling/leveling.js';

import { botHasPermission } from '../../utils/permissionGuard.js';
import {
    TitanBotError,
    ErrorTypes,
    replyUserError,
} from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Управление системой уровней')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)

        // /level setup
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Настроить и включить систему уровней')

                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Канал для уведомлений о повышении уровня')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )

                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('Минимальный XP за сообщение')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false)
                )

                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('Максимальный XP за сообщение')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false)
                )

                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription('Сообщение повышения уровня ({user} и {level})')
                        .setMaxLength(500)
                        .setRequired(false)
                )

                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Задержка начисления XP в секундах')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false)
                )
        )

        // /level dashboard
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Открыть панель управления уровнями')
        ),

    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });

        if (!deferred) return;

        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'Для использования этой команды вам необходимо право **Управление сервером**.',
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // ==========================================
        // /level dashboard
        // ==========================================

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(
                interaction,
                config,
                client
            );
        }

        // ==========================================
        // /level setup
        // ==========================================

        if (subcommand === 'setup') {
            const channel =
                interaction.options.getChannel('channel');

            const xpMin =
                interaction.options.getInteger('xp_min') ?? 15;

            const xpMax =
                interaction.options.getInteger('xp_max') ?? 25;

            const message =
                interaction.options.getString('message') ??
                '{user} достиг нового уровня: {level}!';

            const xpCooldown =
                interaction.options.getInteger('xp_cooldown') ?? 60;

            // Проверяем диапазон XP
            if (xpMin > xpMax) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message:
                        `Минимальное количество XP (**${xpMin}**) ` +
                        `не может быть больше максимального (**${xpMax}**).`,
                });
            }

            // Проверяем права бота в канале
            if (
                !botHasPermission(channel, [
                    'SendMessages',
                    'EmbedLinks',
                ])
            ) {
                throw new TitanBotError(
                    'Bot missing permissions in the specified channel',
                    ErrorTypes.PERMISSION,
                    `Мне необходимы права **Отправка сообщений** и ` +
                    `**Встраивание ссылок** в канале ${channel}, ` +
                    `чтобы отправлять уведомления о повышении уровня.`,
                );
            }

            // Получаем существующую конфигурацию
            const existingConfig =
                await getLevelingConfig(
                    client,
                    interaction.guildId
                );

            // Если система уже настроена
            if (existingConfig.configured) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        `Система уровней уже настроена на этом сервере ` +
                        `(уведомления отправляются в <#${existingConfig.levelUpChannel}>).\n\n` +
                        `Используйте \`/level dashboard\`, чтобы изменить настройки.`,
                });
            }

            // Новая конфигурация
            const newConfig = {
                ...existingConfig,

                configured: true,
                enabled: true,

                levelUpChannel: channel.id,

                xpRange: {
                    min: xpMin,
                    max: xpMax,
                },

                xpCooldown,

                levelUpMessage: message,

                announceLevelUp: true,
            };

            // Сохраняем
            await saveLevelingConfig(
                client,
                interaction.guildId,
                newConfig
            );

            logger.info(
                `Leveling system set up in guild ${interaction.guildId}`,
                {
                    channelId: channel.id,
                    xpMin,
                    xpMax,
                    xpCooldown,
                    userId: interaction.user.id,
                }
            );

            // Ответ
            return await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        createEmbed({
                            title: 'Система уровней настроена',

                            description:
                                `Система уровней теперь **включена** и готова к работе.\n\n` +

                                `**Канал уведомлений:** ${channel}\n` +
                                `**XP за сообщение:** ${xpMin} – ${xpMax}\n` +
                                `**Задержка XP:** ${xpCooldown} сек.\n` +
                                `**Сообщение:** \`${message}\`\n\n` +

                                `Используйте \`/level dashboard\`, ` +
                                `чтобы изменить настройки.`,

                            color: 'success',
                        }),
                    ],
                }
            );
        }
    },
};
