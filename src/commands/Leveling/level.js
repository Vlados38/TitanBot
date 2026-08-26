import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Управление системой уровней')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Настроить систему уровней — также включит её')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Канал для уведомлений о повышении уровня')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('Минимальное количество XP за сообщение (по умолчанию: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('Максимальное количество XP за сообщение (по умолчанию: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Сообщение при повышении уровня. Используйте {user} и {level} (по умолчанию используется готовый текст)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Задержка между начислениями XP пользователю в секундах (по умолчанию: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Открыть интерактивную панель настройки системы уровней'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });

        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для использования этой команды вам необходимо право **Управление сервером**.',
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;

            const message =
                interaction.options.getString('message') ??
                '{user} достиг нового уровня: {level}!';

            const xpCooldown =
                interaction.options.getInteger('xp_cooldown') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: `Минимальное количество XP (**${xpMin}**) не может быть больше максимального (**${xpMax}**).`,
                });
            }

            if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                throw new TitanBotError(
                    'Bot missing permissions in the specified channel',
                    ErrorTypes.PERMISSION,
                    `Мне необходимы права **Отправка сообщений** и **Встраивание ссылок** в канале ${channel}, чтобы отправлять уведомления о повышении уровня.`,
                );
            }

            const existingConfig = await getLevelingConfig(
                client,
                interaction.guildId
            );

            if (existingConfig.configured) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        `Система уровней уже настроена на этом сервере (уведомления о повышении уровня отправляются в <#${existingConfig.levelUpChannel}>).\n\n` +
                        `Используйте \`/level dashboard\`, чтобы изменить настройки.`,
                });
            }

            const newConfig = {
                ...existingConfig,
                configured: true,
                enabled: true,
                levelUpChannel: channel.id,
                xpRange: {
                    min: xpMin,
                    max: xpMax,
                },
                xpCooldown: xpCooldown,
                levelUpMessage: message,
                announceLevelUp: true,
            };

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

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Система уровней настроена',
                        description:
                            `Система уровней теперь **включена** и готова к работе.\n\n` +
                            `**Канал уведомлений:** ${channel}\n` +
                            `**XP за сообщение:** ${xpMin} – ${xpMax}\n` +
                            `**Задержка XP:** ${xpCooldown} сек.\n` +
                            `**Сообщение при повышении уровня:** \`${message}\`\n\n` +
                            `Используйте \`/level dashboard\`, чтобы в любое время изменить эти настройки.`,
                        color: 'success',
                    }),
                ],
            });
        }
    },
};
