import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
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
import { getLevelingConfig, saveLevelingConfig } from '../../../services/leveling/leveling.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

function buildDashboardEmbed(cfg, guild) {
    const channel = cfg.levelUpChannel ? `<#${cfg.levelUpChannel}>` : '`Не установлен`';
    const xpMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const xpMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;
    const cooldown = cfg.xpCooldown ?? 60;
    const rawMsg = cfg.levelUpMessage || '{user} достиг уровня {level}!';
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;

    const rewards = cfg.roleRewards ?? {};
    const rewardEntries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));
    const rewardsValue = rewardEntries.length > 0
        ? rewardEntries.map(([lvl, roleId]) => `Уровень **${lvl}** → <@&${roleId}>`).join('\n')
        : '`Не настроены`';

    const ignoredChannels = cfg.ignoredChannels ?? [];
    const ignoredRoles = cfg.ignoredRoles ?? [];
    const ignoredChValue = ignoredChannels.length > 0 ? ignoredChannels.map(id => `<#${id}>`).join(', ') : '`Нет`';
    const ignoredRoValue = ignoredRoles.length > 0 ? ignoredRoles.map(id => `<@&${id}>`).join(', ') : '`Нет`';

    return new EmbedBuilder()
        .setTitle('⚡ Панель управления системой уровней')
        .setDescription(`Управление настройками системы уровней для **${guild.name}**.\nВыберите нужный параметр ниже, чтобы изменить его.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Канал повышения уровня', value: channel, inline: true },
            { name: 'Статус системы', value: cfg.enabled ? '**Включена**' : '**Выключена**', inline: true },
            { name: 'Уведомления', value: cfg.announceLevelUp !== false ? '**Включены**' : '**Выключены**', inline: true },
            { name: 'XP за сообщение', value: `\`${xpMin} – ${xpMax}\``, inline: true },
            { name: 'Задержка XP', value: `\`${cooldown} сек.\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Сообщение при повышении уровня', value: msgPreview, inline: false },
            { name: 'Награды за уровни', value: rewardsValue, inline: false },
            { name: 'Игнорируемые каналы', value: ignoredChValue, inline: true },
            { name: 'Игнорируемые роли', value: ignoredRoValue, inline: true },
        )
        .setFooter({ text: 'Панель управления закроется после 10 минут бездействия' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`level_cfg_${guildId}`)
        .setPlaceholder('Выберите настройку для изменения...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить канал повышения уровня')
                .setDescription('Выберите канал для отправки уведомлений о повышении уровня')
                .setValue('channel')
                .setEmoji('📢'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить сообщение повышения уровня')
                .setDescription('Настройте сообщение, которое отображается при повышении уровня')
                .setValue('message')
                .setEmoji('💬'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Настроить диапазон XP')
                .setDescription('Установите минимальное и максимальное количество XP за сообщение')
                .setValue('xp_range')
                .setEmoji('🎲'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Настроить задержку XP')
                .setDescription('Количество секунд между начислениями XP одному пользователю')
                .setValue('xp_cooldown')
                .setEmoji('⏱️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Добавить награду за уровень')
                .setDescription('Выдать роль пользователю при достижении определённого уровня')
                .setValue('role_reward_add')
                .setEmoji('🏆'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Удалить награду за уровень')
                .setDescription('Удалить награду за определённый уровень')
                .setValue('role_reward_remove')
                .setEmoji('🗑️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Игнорируемые каналы')
                .setDescription('Переключить каналы, в которых XP не начисляется')
                .setValue('ignore_channels')
                .setEmoji('🚫'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Игнорируемые роли')
                .setDescription('Переключить роли, пользователи с которыми не получают XP')
                .setValue('ignore_roles')
                .setEmoji('🚫'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const announceOn = cfg.announceLevelUp !== false;
    const systemOn = cfg.enabled !== false;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_announce_${guildId}`)
            .setLabel('Уведомления')
            .setStyle(announceOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('📣')
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_system_${guildId}`)
            .setLabel('Система уровней')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('⚡')
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
        components: [
            buildButtonRow(cfg, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,

    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getLevelingConfig(client, guildId);

            if (!cfg.configured) {
                throw new TitanBotError(
                    'Leveling system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Система уровней ещё не настроена. Сначала выполните `/level setup` для её настройки.',
                );
            }

            await startDashboardSession({
                interaction,

                embeds: [buildDashboardEmbed(cfg, interaction.guild)],

                components: [
                    buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),
                ],

                selectMenuId: `level_cfg_${guildId}`,

                buttonMatcher: (customId) =>
                    customId === `level_cfg_toggle_announce_${guildId}` ||
                    customId === `level_cfg_toggle_system_${guildId}`,

                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];

                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'xp_range':
                            await handleXpRange(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'xp_cooldown':
                            await handleXpCooldown(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'role_reward_add':
                            await handleRoleRewardAdd(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'role_reward_remove':
                            await handleRoleRewardRemove(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'ignore_channels':
                            await handleIgnoreChannels(selectInteraction, interaction, cfg, guildId, client);
                            break;

                        case 'ignore_roles':
                            await handleIgnoreRoles(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                },

                onButton: async (btnInteraction) => {
                    await btnInteraction.deferUpdate().catch(() => null);

                    const isAnnounce =
                        btnInteraction.customId === `level_cfg_toggle_announce_${guildId}`;

                    if (isAnnounce) {
                        cfg.announceLevelUp = cfg.announceLevelUp === false;

                        await saveLevelingConfig(client, guildId, cfg);

                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Уведомления обновлены',
                                    `Уведомления о повышении уровня теперь **${cfg.announceLevelUp ? 'включены' : 'выключены'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        const wasEnabled = cfg.enabled !== false;
                        cfg.enabled = !wasEnabled;

                        await saveLevelingConfig(client, guildId, cfg);

                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Система обновлена',
                                    `Система уровней теперь **${cfg.enabled ? 'включена' : 'выключена'}**.${!cfg.enabled ? '\n> ⚠️ Пока система выключена, пользователи не будут получать XP.' : ''}`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                },
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;

            logger.error('Unexpected error in level_dashboard:', error);

            throw new TitanBotError(
                `Level dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Не удалось открыть панель управления системой уровней.',
            );
        }
    },
};

async function handleRoleRewardAdd(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_add_${guildId}`)
        .setTitle('🏆 Добавить награду за уровень');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('reward_role')
        .setPlaceholder('Выберите роль для награды...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Роль для награды')
        .setDescription('Эта роль будет выдана при достижении указанного уровня')
        .setRoleSelectMenuComponent(roleSelect);

    const levelInput = new TextInputBuilder()
        .setCustomId('reward_level')
        .setLabel('Требуемый уровень (1–500)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(levelInput));

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_role_reward_add_${guildId}` &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields.getTextInputValue('reward_level').trim();
    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || level < 1 || level > 500) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Уровень должен быть целым числом от **1** до **500**.',
        });

        return;
    }

    const roleId = submitted.fields.getField('reward_role').values[0];

    cfg.roleRewards = cfg.roleRewards ?? {};
    cfg.roleRewards[level] = roleId;

    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                'Награда добавлена',
                `<@&${roleId}> теперь будет выдаваться при достижении **${level} уровня**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleRoleRewardRemove(selectInteraction, rootInteraction, cfg, guildId, client) {
    const rewards = cfg.roleRewards ?? {};
    const entries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));

    if (entries.length === 0) {
        await selectInteraction.deferUpdate();

        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Нет настроенных наград за уровни, которые можно удалить.',
        });

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_remove_${guildId}`)
        .setTitle('🗑️ Удалить награду за уровень');

    const infoInput = new TextInputBuilder()
        .setCustomId('current_rewards')
        .setLabel('Текущие награды (только для чтения)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(
            entries
                .map(([lvl, roleId]) => `Уровень ${lvl}: <@&${roleId}>`)
                .join('\n')
        )
        .setRequired(false);

    const levelInput = new TextInputBuilder()
        .setCustomId('remove_level')
        .setLabel('Уровень, награду которого нужно удалить')
        .setStyle(TextInputStyle.Short)
        .setValue(entries[0][0])
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(infoInput),
        new ActionRowBuilder().addComponents(levelInput),
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_role_reward_remove_${guildId}` &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields.getTextInputValue('remove_level').trim();
    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || !cfg.roleRewards?.[level]) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: `Для уровня **${rawLevel}** награда не настроена.`,
        });

        return;
    }

    delete cfg.roleRewards[level];

    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                'Награда удалена',
                `Награда за **${level} уровень** была удалена.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_channel_modal_${guildId}`)
        .setTitle('📢 Изменить канал повышения уровня');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('levelup_channel')
        .setPlaceholder('Выберите текстовый канал...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Канал повышения уровня')
        .setDescription('Канал, куда будут отправляться уведомления о повышении уровня')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_channel_modal_${guildId}` &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const channelId = submitted.fields.getField('levelup_channel').values[0];
    const channel = selectInteraction.guild.channels.cache.get(channelId);

    if (channel && !botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
        await replyUserError(submitted, {
            type: ErrorTypes.PERMISSION,
            message: `Мне нужны разрешения **SendMessages** и **EmbedLinks** в ${channel}, чтобы отправлять уведомления о повышении уровня.`,
        });

        return;
    }

    cfg.levelUpChannel = channelId;

    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Канал обновлён',
                `Уведомления о повышении уровня теперь будут отправляться в ${channel ?? `<#${channelId}>`}.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleIgnoreChannels(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_channels_${guildId}`)
        .setTitle('🚫 Игнорируемые каналы');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ignore_channel')
        .setPlaceholder('Выберите каналы для переключения...')
        .setMinValues(1)
        .setMaxValues(10)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Переключить игнорируемые каналы')
        .setDescription('Выбранные каналы будут переключены — в них XP начисляться не будет')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_ignore_channels_${guildId}` &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = submitted.fields.getField('ignore_channel').values;
    const ignoreSet = new Set(cfg.ignoredChannels ?? []);

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredChannels = Array.from(ignoreSet);

    await saveLevelingConfig(client, guildId, cfg);

    const list = cfg.ignoredChannels.length > 0
        ? cfg.ignoredChannels.map(id => `<#${id}>`).join(', ')
        : '`Нет`';

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Игнорируемые каналы обновлены',
                `XP не будет начисляться в: ${list}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleIgnoreRoles(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_roles_${guildId}`)
        .setTitle('🚫 Игнорируемые роли');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ignore_role')
        .setPlaceholder('Выберите роли для переключения...')
        .setMinValues(1)
        .setMaxValues(10)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Переключить игнорируемые роли')
        .setDescription('Выбранные роли будут переключены — пользователи с ними не будут получать XP')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === `level_cfg_ignore_roles_${guildId}` &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = submitted.fields.getField('ignore_role').values;
    const ignoreSet = new Set(cfg.ignoredRoles ?? []);

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredRoles = Array.from(ignoreSet);

    await saveLevelingConfig(client, guildId, cfg);

    const list = cfg.ignoredRoles.length > 0
        ? cfg.ignoredRoles.map(id => `<@&${id}>`).join(', ')
        : '`Нет`';

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Игнорируемые роли обновлены',
                `Эти роли не будут получать XP: ${list}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_message')
        .setTitle('💬 Изменить сообщение повышения уровня')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Сообщение ({user} и {level} доступны)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.levelUpMessage || '{user} достиг уровня {level}!')
                    .setMaxLength(500)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('{user} достиг уровня {level}!'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_message' &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields
        .getTextInputValue('message_input')
        .trim();

    if (!newMessage.includes('{user}') && !newMessage.includes('{level}')) {
        logger.warn(
            `Level-up message set without {user} or {level} placeholders in guild ${guildId}`,
        );
    }

    cfg.levelUpMessage = newMessage;

    await saveLevelingConfig(client, guildId, cfg);

    const preview = newMessage
        .replace('{user}', '@Пользователь')
        .replace('{level}', '5');

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Сообщение обновлено',
                `Сообщение о повышении уровня сохранено.\n**Предпросмотр:** ${preview}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleXpRange(selectInteraction, rootInteraction, cfg, guildId, client) {
    const currentMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const currentMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;

    const modal = new ModalBuilder()
        .setCustomId('level_cfg_xp_range')
        .setTitle('Настроить диапазон XP за сообщение')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_min_input')
                    .setLabel('Минимум XP (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMin))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('15'),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_max_input')
                    .setLabel('Максимум XP (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMax))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('25'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_xp_range' &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawMin = submitted.fields.getTextInputValue('xp_min_input').trim();
    const rawMax = submitted.fields.getTextInputValue('xp_max_input').trim();

    const newMin = parseInt(rawMin, 10);
    const newMax = parseInt(rawMax, 10);

    if (
        isNaN(newMin) ||
        isNaN(newMax) ||
        newMin < 1 ||
        newMax < 1 ||
        newMin > 500 ||
        newMax > 500
    ) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Оба значения XP должны быть целыми числами от **1** до **500**.',
        });

        return;
    }

    if (newMin > newMax) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Минимальное количество XP не может быть больше максимального.',
        });

        return;
    }

    cfg.xpRange = {
        min: newMin,
        max: newMax,
    };

    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Диапазон XP обновлён',
                `Теперь пользователи будут получать от **${newMin}** до **${newMax}** XP за сообщение.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleXpCooldown(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_cooldown')
        .setTitle('⏱️ Настроить задержку XP')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('cooldown_input')
                    .setLabel('Задержка в секундах (0–3600)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(cfg.xpCooldown ?? 60))
                    .setMaxLength(4)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('60'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_cooldown' &&
                i.user.id === selectInteraction.user.id,

            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields
        .getTextInputValue('cooldown_input')
        .trim();

    const newCooldown = parseInt(raw, 10);

    if (
        isNaN(newCooldown) ||
        newCooldown < 0 ||
        newCooldown > 3600
    ) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Задержка должна быть целым числом от **0** до **3600** секунд.',
        });

        return;
    }

    cfg.xpCooldown = newCooldown;

    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Задержка обновлена',
                `Задержка XP установлена на **${newCooldown} ${newCooldown !== 1 ? 'секунд' : 'секунду'}**.${newCooldown === 0 ? '\n> ⚠️ Задержка 0 означает, что XP будет начисляться за каждое сообщение.' : ''}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
