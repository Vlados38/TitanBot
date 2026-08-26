import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    FileUploadBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getWelcomeConfig, saveWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';

async function deferComponent(interaction) {
    if (interaction.deferred || interaction.replied) {
        return true;
    }

    try {
        await interaction.deferUpdate();
        return true;
    } catch (error) {
        logger.debug('Взаимодействие с компонентом истекло или уже было обработано:', error.message);
        return false;
    }
}

async function sendEphemeralFollowUp(interaction, payload) {
    try {
        await interaction.followUp({
            ...payload,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Не удалось отправить временное дополнительное сообщение:', error.message);
    }
}

function buildDashboardEmbed(cfg, guild) {
    const welcomeChannel = cfg.channelId ? `<#${cfg.channelId}>` : '`Не настроено`';
    const goodbyeChannel = cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`Не настроено`';

    const rawWelcome = cfg.welcomeMessage || 'Добро пожаловать, {user}, на сервер {server}!';
    const rawGoodbye = cfg.leaveMessage || '{user.tag} покинул сервер.';
    const welcomePreview = `\`${rawWelcome.length > 55 ? rawWelcome.substring(0, 55) + '…' : rawWelcome}\``;
    const goodbyePreview = `\`${rawGoodbye.length > 55 ? rawGoodbye.substring(0, 55) + '…' : rawGoodbye}\``;

    return new EmbedBuilder()
        .setTitle('👋 Панель приветствия')
        .setDescription(
            `Управление настройками приветствия и прощания для **${guild.name}**.\nИспользуйте переключатели, чтобы включить или отключить приветствия и прощания, затем выберите нужный параметр для редактирования.`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: 'Канал приветствия', value: welcomeChannel, inline: true },
            { name: 'Статус приветствия', value: cfg.enabled ? 'Включено' : 'Отключено', inline: true },
            { name: 'Упоминание при входе', value: cfg.welcomePing ? 'Включено' : 'Отключено', inline: true },
            { name: 'Канал прощания', value: goodbyeChannel, inline: true },
            { name: 'Статус прощания', value: cfg.goodbyeEnabled ? 'Включено' : 'Отключено', inline: true },
            { name: 'Упоминание при выходе', value: cfg.goodbyePing ? 'Включено' : 'Отключено', inline: true },
            { name: 'Сообщение приветствия', value: welcomePreview, inline: false },
            { name: 'Сообщение прощания', value: goodbyePreview, inline: false },
        )
        .setFooter({ text: 'Панель закроется после 10 минут бездействия' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`greet_cfg_${guildId}`)
        .setPlaceholder('Выберите настройку для изменения...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Канал приветствия')
                .setDescription('Выберите канал, куда будут отправляться приветственные сообщения')
                .setValue('welcome_channel')
                .setEmoji('🟢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Сообщение приветствия')
                .setDescription('Измените текст, который отображается при входе участника')
                .setValue('welcome_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изображение приветствия')
                .setDescription('Установите изображение для приветственных сообщений')
                .setValue('welcome_image')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Канал прощания')
                .setDescription('Выберите канал, куда будут отправляться сообщения при выходе')
                .setValue('goodbye_channel')
                .setEmoji('🔴'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Сообщение прощания')
                .setDescription('Измените текст, который отображается при выходе участника')
                .setValue('goodbye_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изображение прощания')
                .setDescription('Установите изображение для сообщений при выходе')
                .setValue('goodbye_image')
                .setEmoji('🖼️'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const welcomeOn = cfg.enabled === true;
    const goodbyeOn = cfg.goodbyeEnabled === true;
    const welcomePingOn = cfg.welcomePing === true;
    const goodbyePingOn = cfg.goodbyePing === true;
    
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_welcome_${guildId}`)
                .setLabel('Приветствие')
                .setStyle(welcomeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🟢')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_goodbye_${guildId}`)
                .setLabel('Прощание')
                .setStyle(goodbyeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🔴')
                .setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_welcome_${guildId}`)
                .setLabel('Упоминание при входе')
                .setStyle(welcomePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_goodbye_${guildId}`)
                .setLabel('Упоминание при выходе')
                .setStyle(goodbyePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
        ),
    ];
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    try {
        const selectMenu = buildSelectMenu(guildId);
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
            components: [
                ...buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
        });
    } catch (error) {
        logger.debug('Не удалось обновить панель приветствия (возможно, взаимодействие истекло):', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getWelcomeConfig(client, guildId);

            if (!cfg.channelId && !cfg.goodbyeChannelId) {
                throw new TitanBotError(
                    'Система приветствия не настроена',
                    ErrorTypes.CONFIGURATION,
                    'Ни приветствие, ни прощание ещё не настроены. Сначала выполните `/welcome setup` или `/goodbye setup`.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!interaction.deferred) {
                return;
            }

            const selectMenu = buildSelectMenu(guildId);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(cfg, interaction.guild)],
                components: [
                    ...buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `greet_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'welcome_channel':
                            await handleWelcomeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_message':
                            await handleWelcomeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_image':
                            await handleWelcomeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_channel':
                            await handleGoodbyeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_message':
                            await handleGoodbyeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_image':
                            await handleGoodbyeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Ошибка проверки настроек приветствия: ${error.message}`);
                    } else {
                        logger.error('Непредвиденная ошибка панели приветствия:', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || 'Произошла ошибка при обработке вашего выбора.'
                            : 'Произошла непредвиденная ошибка при обновлении настроек.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (i.customId === `greet_cfg_toggle_welcome_${guildId}` ||
                        i.customId === `greet_cfg_toggle_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_ping_welcome_${guildId}` ||
                        i.customId === `greet_cfg_ping_goodbye_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (!await deferComponent(btnInteraction)) {
                        return;
                    }

                    const customId = btnInteraction.customId;

                    if (customId === `greet_cfg_toggle_welcome_${guildId}`) {
                        cfg.enabled = !cfg.enabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Приветствие обновлено',
                                    `Приветственные сообщения теперь **${cfg.enabled ? 'включены' : 'отключены'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_toggle_goodbye_${guildId}`) {
                        cfg.goodbyeEnabled = !cfg.goodbyeEnabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Прощание обновлено',
                                    `Сообщения при выходе теперь **${cfg.goodbyeEnabled ? 'включены' : 'отключены'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_welcome_${guildId}`) {
                        cfg.welcomePing = !cfg.welcomePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Упоминание при входе обновлено',
                                    `При входе пользователи ${cfg.welcomePing ? 'будут' : '**не будут**'} упоминаться в приветственном сообщении.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_goodbye_${guildId}`) {
                        cfg.goodbyePing = !cfg.goodbyePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Упоминание при выходе обновлено',
                                    `При выходе пользователи ${cfg.goodbyePing ? 'будут' : '**не будут**'} упоминаться в сообщении.`,
                                ),
                            ],
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                } catch (error) {
                    logger.error('Ошибка при обработке кнопки панели приветствия:', error);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Панель закрыта')
                                    .setDescription('Эта панель была закрыта из-за отсутствия активности. Запустите команду снова, чтобы продолжить.')
                                    .setColor(getColor('error'))
                            ],
                            components: [],
                        });
                    } catch (error) {
                        logger.debug('Не удалось обновить панель после истечения времени:', error.message);
                    }
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Непредвиденная ошибка в greet_dashboard:', error);
            throw new TitanBotError(
                `Ошибка панели приветствия: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Не удалось открыть панель приветствия.',
            );
        }
    },
};

async function handleWelcomeChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_welcome_channel')
        .setPlaceholder('Выберите текстовый канал...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🟢 Канал приветствия')
                .setDescription(
                    `**Текущий:** ${cfg.channelId ? `<#${cfg.channelId}>` : '`Не настроено`'}\n\nВыберите канал, куда будут отправляться приветственные сообщения.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_welcome_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }

        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `Мне нужны права **Просмотр канала**, **Отправка сообщений** и **Встраивание ссылок** в ${channel}.`,
            });
            return;
        }

        cfg.channelId = channel.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('Канал обновлён', `Приветственные сообщения теперь будут отправляться в ${channel}.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
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

async function handleWelcomeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_message')
        .setTitle('Редактирование приветствия')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Сообщение (переменные: {user}, {server} и т. д.)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.welcomeMessage || 'Добро пожаловать, {user}, на сервер {server}!')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.welcomeMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Приветственное сообщение обновлено', 'Приветственное сообщение сохранено.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_image')
        .setTitle('Установка изображения приветствия');

    const imageHint = new TextDisplayBuilder()
        .setContent('Укажите прямую ссылку на изображение **или** загрузите файл ниже. Если указаны оба варианта, загруженный файл будет иметь приоритет. Чтобы удалить изображение, оставьте URL пустым и не загружайте файл.');

    const urlLabel = new LabelBuilder()
        .setLabel('URL изображения (необязательно)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/welcome.png')
                .setStyle(TextInputStyle.Short)
                .setValue(cfg.welcomeImage || '')
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Или загрузите файл изображения (необязательно)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, {
                    type: ErrorTypes.VALIDATION,
                    message: 'URL изображения должен начинаться с `http://` или `https://`.',
                });
                return;
            }
        } catch {
            await replyUserError(submitted, {
                type: ErrorTypes.VALIDATION,
                message: 'Пожалуйста, укажите корректный URL изображения.',
            });
            return;
        }
    }

    cfg.welcomeImage = imageUrl || null;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Изображение приветствия обновлено', `Изображение успешно ${imageUrl ? 'обновлено' : 'удалено'}.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.welcomePing = !cfg.welcomePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ Упоминание при входе обновлено',
                `При входе пользователи ${cfg.welcomePing ? 'будут' : '**не будут**'} упоминаться в приветственном сообщении.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_goodbye_channel')
        .setPlaceholder('Выберите текстовый канал...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🔴 Канал прощания')
                .setDescription(
                    `**Текущий:** ${cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`Не настроено`'}\n\nВыберите канал, куда будут отправляться сообщения при выходе участников.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_goodbye_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }

        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `Мне нужны права **Просмотр канала**, **Отправка сообщений** и **Встраивание ссылок** в ${channel}.`,
            });
            return;
        }

        cfg.goodbyeChannelId = channel.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('Канал обновлён', `Сообщения при выходе теперь будут отправляться в ${channel}.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
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

async function handleGoodbyeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_message')
        .setTitle('Редактирование сообщения прощания')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Сообщение (переменные: {user}, {server} и т. д.)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.leaveMessage || '{user.tag} покинул сервер.')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.leaveMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Сообщение прощания обновлено', 'Сообщение прощания сохранено.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_image')
        .setTitle('Установка изображения прощания');

    const imageHint = new TextDisplayBuilder()
        .setContent('Укажите прямую ссылку на изображение **или** загрузите файл ниже. Если указаны оба варианта, загруженный файл будет иметь приоритет. Чтобы удалить изображение, оставьте URL пустым и не загружайте файл.');

    const urlLabel = new LabelBuilder()
        .setLabel('URL изображения (необязательно)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/goodbye.png')
                .setStyle(TextInputStyle.Short)
                .setValue(
                    typeof cfg.leaveEmbed?.image === 'string'
                        ? cfg.leaveEmbed.image
                        : cfg.leaveEmbed?.image?.url || ''
                )
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Или загрузите файл изображения (необязательно)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, {
                    type: ErrorTypes.VALIDATION,
                    message: 'URL изображения должен начинаться с `http://` или `https://`.',
                });
                return;
            }
        } catch {
            await replyUserError(submitted, {
                type: ErrorTypes.VALIDATION,
                message: 'Пожалуйста, укажите корректный URL изображения.',
            });
            return;
        }
    }

    const nextLeaveEmbed = { ...(cfg.leaveEmbed || {}) };

    if (imageUrl) {
        nextLeaveEmbed.image = imageUrl;
    } else {
        delete nextLeaveEmbed.image;
    }

    cfg.leaveEmbed = nextLeaveEmbed;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Изображение прощания обновлено', `Изображение успешно ${imageUrl ? 'обновлено' : 'удалено'}.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.goodbyePing = !cfg.goodbyePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ Упоминание при выходе обновлено',
                `При выходе пользователи ${cfg.goodbyePing ? 'будут' : '**не будут**'} упоминаться в сообщении.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
