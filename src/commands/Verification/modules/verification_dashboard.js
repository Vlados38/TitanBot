import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import {
    getVerificationPanelStatus,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

async function updateLivePanel(guild, cfg) {
    if (!cfg.channelId || !cfg.messageId) return;
    try {
        const channel = guild.channels.cache.get(cfg.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;

        const verifyEmbed = new EmbedBuilder()
            .setTitle('Верификация сервера')
            .setDescription(cfg.message || botConfig.verification.defaultMessage)
            .setColor(getColor('success'));

        const verifyButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_user')
                .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
        );

        await msg.edit({ embeds: [verifyEmbed], components: [verifyButton] });
    } catch (error) {
        logger.warn('Не удалось обновить панель верификации:', error.message);
    }
}

function buildDashboardEmbed(cfg, guild, verifiedUserCount = 0, conflictSummary = '', panelStatus = null) {
    const channel = cfg.channelId ? `<#${cfg.channelId}>` : '`Не настроено`';
    const role = cfg.roleId ? `<@&${cfg.roleId}>` : '`Не настроено`';
    const rawMsg = cfg.message || botConfig.verification.defaultMessage;
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const buttonText = cfg.buttonText || botConfig.verification.defaultButtonText;
    const panelStatusValue = cfg.channelId ? formatPanelStatusField(panelStatus) : '`Не настроено`';

    const embed = new EmbedBuilder()
        .setTitle('✅ Панель управления верификацией')
        .setDescription(`Управление настройками верификации для **${guild.name}**.\nВыберите параметр ниже, чтобы изменить его.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Статус панели', value: panelStatusValue, inline: false },
            { name: 'Канал верификации', value: channel, inline: true },
            { name: 'Роль верифицированного', value: role, inline: true },
            { name: 'Статус системы', value: cfg.enabled !== false ? 'Включена' : 'Отключена', inline: true },
            { name: 'Текст кнопки', value: `\`${buttonText}\``, inline: true },
            { name: 'Верифицированные пользователи', value: `${verifiedUserCount} пользователей`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Сообщение верификации', value: msgPreview, inline: false },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Конфликты настроек', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Панель закроется после 10 минут бездействия' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`verif_cfg_${guildId}`)
        .setPlaceholder('Выберите настройку для изменения...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить канал верификации')
                .setDescription('Установить канал, где будет опубликована панель верификации')
                .setValue('channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить роль верификации')
                .setDescription('Установить роль, выдаваемую после прохождения верификации')
                .setValue('role')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить сообщение верификации')
                .setDescription('Изменить сообщение, отображаемое на панели верификации')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить текст кнопки')
                .setDescription('Изменить текст на кнопке верификации')
                .setValue('button_text')
                .setEmoji('🔘'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false, panelStatus = null) {
    const systemOn = cfg.enabled !== false;
    const showRepost =
        systemOn && panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`verif_cfg_repost_${guildId}`)
                .setLabel('Восстановить панель')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`verif_cfg_toggle_${guildId}`)
            .setLabel('Верификация')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('🔒')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

async function repostVerificationPanel(guild, cfg) {
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel) {
        throw new TitanBotError(
            'Канал панели отсутствует',
            ErrorTypes.CONFIGURATION,
            'Настроенный канал верификации больше не существует. Укажите новый канал через панель управления.',
        );
    }

    const verifyEmbed = new EmbedBuilder()
        .setTitle('Верификация сервера')
        .setDescription(cfg.message || botConfig.verification.defaultMessage)
        .setColor(getColor('success'));

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_user')
            .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
    );

    return channel.send({ embeds: [verifyEmbed], components: [verifyButton] });
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let verifiedUserCount = 0;
        let conflictSummary = '';
        let panelStatus = null;

        if (cfg.channelId && cfg.enabled !== false) {
            panelStatus = await getVerificationPanelStatus(client, rootInteraction.guild, cfg);
            if (panelStatus.recoveredId) {
                cfg.messageId = panelStatus.recoveredId;
                const latestConfig = await getGuildConfig(client, guildId);
                latestConfig.verification = cfg;
                await setGuildConfig(client, guildId, latestConfig);
            }
        }
        
        try {
            const verifiedRole = rootInteraction.guild.roles.cache.get(cfg.roleId);
            if (verifiedRole) {
                verifiedUserCount = verifiedRole.members.size;
            }
            
            const guildConfig = await getGuildConfig(client, guildId);
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
            
            const conflicts = [
                autoVerifyEnabled ? 'Автоматическая верификация включена' : null,
                autoRoleConfigured ? 'AutoRole настроен' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (error) {
            logger.warn('Не удалось получить данные панели верификации:', error.message);
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, verifiedUserCount, conflictSummary, panelStatus)],
            components: [
                buildButtonRow(cfg, guildId, false, panelStatus),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Не удалось обновить панель верификации (возможно, взаимодействие истекло):', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);
            const cfg = guildConfig.verification;

            if (!cfg?.channelId) {
                throw new TitanBotError(
                    'Верификация не настроена',
                    ErrorTypes.CONFIGURATION,
                    'Система верификации ещё не настроена. Сначала выполните `/verification setup`.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let verifiedUserCount = 0;
            let conflictSummary = '';
            let panelStatus = null;

            if (cfg.channelId && cfg.enabled !== false) {
                panelStatus = await getVerificationPanelStatus(client, interaction.guild, cfg);
                if (panelStatus.recoveredId) {
                    cfg.messageId = panelStatus.recoveredId;
                    guildConfig.verification = cfg;
                    await setGuildConfig(client, guildId, guildConfig);
                }
            }
            
            try {
                const verifiedRole = interaction.guild.roles.cache.get(cfg.roleId);
                if (verifiedRole) {
                    verifiedUserCount = verifiedRole.members.size;
                }
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const conflicts = [
                    autoVerifyEnabled ? 'Автоматическая верификация включена' : null,
                    autoRoleConfigured ? 'AutoRole настроен' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (error) {
                logger.warn('Не удалось получить данные панели верификации:', error.message);
            }

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(cfg, interaction.guild, verifiedUserCount, conflictSummary, panelStatus)],
                components: [
                    buildButtonRow(cfg, guildId, false, panelStatus),
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),
                ],
                flags: MessageFlags.Ephemeral,
                selectMenuId: `verif_cfg_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `verif_cfg_toggle_${guildId}` || customId === `verif_cfg_repost_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role':
                            await handleRole(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'button_text':
                            await handleButtonText(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `verif_cfg_repost_${guildId}`) {
                        await btnInteraction.deferUpdate();
                        const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                        cfg.messageId = newMsg.id;
                        const latestConfig = await getGuildConfig(client, guildId);
                        latestConfig.verification = cfg;
                        await setGuildConfig(client, guildId, latestConfig);
                        await btnInteraction.followUp({
                            embeds: [successEmbed('Панель восстановлена', `Панель верификации восстановлена в ${newMsg.channel}.`)],
                            flags: MessageFlags.Ephemeral,
                        });
                        await refreshDashboard(interaction, cfg, guildId, client);
                        return;
                    }

                    await btnInteraction.deferUpdate().catch(() => null);

                    const wasEnabled = cfg.enabled !== false;
                    const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

                    if (!wasEnabled && autoVerifyEnabled) {
                        await replyUserError(btnInteraction, {
                            type: ErrorTypes.CONFIGURATION,
                            message: 'Автоматическая верификация сейчас включена. Сначала отключите AutoVerify, прежде чем включать ручную систему верификации.\n\nИспользуйте `/autoverify`, чтобы открыть панель AutoVerify.',
                        });
                        return;
                    }

                    cfg.enabled = !wasEnabled;

                    if (!cfg.enabled && cfg.channelId && cfg.messageId) {
                        const channel = interaction.guild.channels.cache.get(cfg.channelId);
                        if (channel) {
                            const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
                            if (msg) await msg.delete().catch(() => {});
                        }
                    }

                    if (cfg.enabled && cfg.channelId) {
                        try {
                            const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                            cfg.messageId = newMsg.id;
                        } catch (error) {
                            logger.warn('Не удалось повторно опубликовать панель верификации при включении:', error.message);
                        }
                    }

                    const latestConfig = await getGuildConfig(client, guildId);
                    latestConfig.verification = cfg;
                    await setGuildConfig(client, guildId, latestConfig);

                    await btnInteraction.followUp({
                        embeds: [
                            successEmbed(
                                '✅ Система обновлена',
                                `Система верификации теперь **${cfg.enabled ? 'включена' : 'отключена'}**.`,
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });

                    await refreshDashboard(interaction, cfg, guildId, client);
                },
                onTimeout: async (rootInteraction) => {
                    await InteractionHelper.safeEditReply(rootInteraction, {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Время работы панели истекло')
                                .setDescription('Эта панель была закрыта из-за отсутствия активности. Запустите команду снова, чтобы продолжить.')
                                .setColor(getColor('error')),
                        ],
                        components: [],
                        flags: MessageFlags.Ephemeral,
                    });
                },
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Неожиданная ошибка в verification_dashboard:', error);
            throw new TitanBotError(
                `Панель верификации завершилась с ошибкой: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Не удалось открыть панель управления верификацией.',
            );
        }
    },
};

async function handleChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('verif_cfg_channel')
        .setPlaceholder('Выберите текстовый канал...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Изменение канала верификации')
                .setDescription(
                    `**Текущий:** ${cfg.channelId ? `<#${cfg.channelId}>` : '`Не настроен`'}\n\nВыберите канал, где будет опубликована панель верификации.\n\n> ⚠️ Существующая панель будет удалена и опубликована заново в новом канале.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferUpdate();
        const newChannel = chanInteraction.channels.first();

        if (!botHasPermission(newChannel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `Мне нужны разрешения **Просмотр канала**, **Отправка сообщений** и **Встраивание ссылок** в ${newChannel}.`,
            });
            return;
        }

        if (cfg.channelId && cfg.messageId) {
            const oldChannel = rootInteraction.guild.channels.cache.get(cfg.channelId);
            if (oldChannel) {
                try {
                    const oldMsg = await oldChannel.messages.fetch(cfg.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch {
                    
                }
            }
        }

        if (cfg.enabled !== false) {
            try {
                const verifyEmbed = new EmbedBuilder()
                    .setTitle('Верификация сервера')
                    .setDescription(cfg.message || botConfig.verification.defaultMessage)
                    .setColor(getColor('success'));

                const verifyButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_user')
                        .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                );

                const newMsg = await newChannel.send({ embeds: [verifyEmbed], components: [verifyButton] });
                cfg.messageId = newMsg.id;
            } catch (error) {
                logger.warn('Не удалось опубликовать панель верификации в новом канале:', error.message);
            }
        }

        cfg.channelId = newChannel.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await chanInteraction.followUp({
            embeds: [successEmbed('Канал обновлён', `Панель верификации перемещена в ${newChannel}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Канал не был выбран. Настройка не изменена.',
            }).catch(() => {});
        }
    });
}

async function handleRole(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('verif_cfg_role')
        .setPlaceholder('Выберите роль...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Изменение роли верификации')
                .setDescription(
                    `**Текущая:** ${cfg.roleId ? `<@&${cfg.roleId}>` : '`Не настроена`'}\n\nВыберите роль, которая будет выдаваться после прохождения верификации.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();
        const guild = rootInteraction.guild;
        const botMember = guild.members.me;

        if (role.id === guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'Пожалуйста, выберите обычную роль, которую можно выдавать (не @everyone и не роль, управляемую ботом/интеграцией).',
            });
            return;
        }

        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'Роль верификации должна находиться ниже моей высшей роли в иерархии ролей сервера.',
            });
            return;
        }

        cfg.roleId = role.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('Роль обновлена', `Роль верификации установлена: ${role}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Роль не была выбрана. Настройка не изменена.',
            }).catch(() => {});
        }
    });
}

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_message')
            .setTitle('Изменение сообщения верификации')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message_input')
                        .setLabel('Сообщение на панели верификации')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(cfg.message || botConfig.verification.defaultMessage)
                        .setMaxLength(2000)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_message' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        cfg.message = submitted.fields.getTextInputValue('message_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await updateLivePanel(rootInteraction.guild, cfg);

        await submitted.reply({
            embeds: [successEmbed('Сообщение обновлено', 'Панель верификации обновлена с новым сообщением.')],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (error) {
        logger.error('Ошибка в handleMessage:', error);
        
    }
}

async function handleButtonText(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_button_text')
            .setTitle('Изменение текста кнопки')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('button_text_input')
                        .setLabel('Текст кнопки (максимум 80 символов)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setMaxLength(80)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_button_text' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        cfg.buttonText = submitted.fields.getTextInputValue('button_text_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await updateLivePanel(rootInteraction.guild, cfg);

        await submitted.reply({
            embeds: [successEmbed('Текст кнопки обновлён', `Теперь на кнопке верификации написано **${cfg.buttonText}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (error) {
        logger.error('Ошибка в handleButtonText:', error);
        
    }
}
