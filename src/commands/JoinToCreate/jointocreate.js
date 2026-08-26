import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    LabelBuilder
} from 'discord.js';

import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
    TitanBotError,
    ErrorTypes,
    replyUserError
} from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("Управление системой голосовых каналов «Войди и создай».")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)

        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Настроить новый голосовой канал «Войди и создай».")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Категория, в которой будет создан канал.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Выберите шаблон названия временных голосовых каналов.")
                        .addChoices(
                            {
                                name: "{username}'s Room (По умолчанию)",
                                value: "{username}'s Room"
                            },
                            {
                                name: "{username}'s Channel",
                                value: "{username}'s Channel"
                            },
                            {
                                name: "{username}'s Lounge",
                                value: "{username}'s Lounge"
                            },
                            {
                                name: "{username}'s Space",
                                value: "{username}'s Space"
                            },
                            {
                                name: "{displayName}'s Room",
                                value: "{displayName}'s Room"
                            },
                            {
                                name: "{username}'s VC",
                                value: "{username}'s VC"
                            },
                            {
                                name: "{username}'s Music Room",
                                value: "{username}'s Music Room"
                            },
                            {
                                name: "{username}'s Gaming Room",
                                value: "{username}'s Gaming Room"
                            },
                            {
                                name: "{username}'s Chat Room",
                                value: "{username}'s Chat Room"
                            },
                            {
                                name: "{username}'s Private Room",
                                value: "{username}'s Private Room"
                            }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription(
                            "Максимальное количество пользователей во временных каналах. (0 = без ограничений)"
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription(
                            "Битрейт временных каналов в кбит/с (8-96)."
                        )
                )
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Настроить существующую систему «Войди и создай».")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription(
                            "Канал-триггер «Войди и создай», который нужно настроить."
                        )
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),

    category: "utility",

    async execute(interaction, config, client) {
        try {
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'Для использования этой команды вам необходимо право **Управление сервером**.'
                );
            }

            const subcommand = interaction.options.getSubcommand();

            await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral
            });

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage =
                    'Произошла ошибка при выполнении этой команды.';

                if (error instanceof TitanBotError) {
                    errorMessage =
                        error.userMessage ||
                        'Произошла ошибка. Пожалуйста, попробуйте ещё раз.';

                    logger.debug(
                        `TitanBotError [${error.type}]: ${error.message}`,
                        error.context || {}
                    );
                } else {
                    logger.error(
                        'Неожиданная ошибка в команде jointocreate:',
                        error
                    );

                    errorMessage =
                        'Произошла непредвиденная ошибка. Попробуйте ещё раз или обратитесь в поддержку.';
                }

                return replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: errorMessage
                });

            } catch (replyError) {
                logger.error(
                    'Не удалось отправить сообщение об ошибке:',
                    replyError
                );
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category =
            interaction.options.getChannel('category');

        const nameTemplate =
            interaction.options.getString('channel_name') ||
            "{username}'s Room";

        const userLimit =
            interaction.options.getInteger('user_limit') || 0;

        const bitrate =
            interaction.options.getInteger('bitrate') || 64;

        const guildId = interaction.guild.id;

        logger.debug(
            `Настройка Join to Create на сервере ${guildId} с шаблоном: ${nameTemplate}`
        );

        const existingConfig =
            await getConfiguration(client, guildId);

        if (
            Array.isArray(existingConfig.triggerChannels) &&
            existingConfig.triggerChannels.length > 0
        ) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (
                const existingChannelId of existingConfig.triggerChannels
            ) {
                const existingChannel =
                    await interaction.guild.channels
                        .fetch(existingChannelId)
                        .catch(() => null);

                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(
                        `Очистка устаревшего JTC-триггера ${staleChannelId} на сервере ${guildId}`
                    );

                    await removeTriggerChannel(
                        client,
                        guildId,
                        staleChannelId
                    );
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger =
                    activeTriggerChannels[0];

                const errorMessage =
                    `На этом сервере уже настроен канал «Войди и создай»: ${primaryTrigger}\n\n` +
                    `Используйте \`/jointocreate dashboard\`, чтобы изменить его, ` +
                    `или сначала удалите существующий канал, прежде чем создавать новый.`;

                throw new TitanBotError(
                    'Guild already has a Join to Create channel',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount:
                            activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        logger.debug(
            'Создание канала-триггера Join to Create...'
        );

        const triggerChannel =
            await interaction.guild.channels.create({
                name: 'Войди и создай',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: 0,
                bitrate: 64000,

                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ],
                    },
                ],
            });

        logger.debug(
            `Канал-триггер ${triggerChannel.id} создан, инициализация конфигурации...`
        );

        const config = await initializeJoinToCreate(
            client,
            guildId,
            triggerChannel.id,
            {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            }
        );

        await logConfigurationChange(
            client,
            guildId,
            interaction.user.id,
            'Инициализирована система Join to Create',
            {
                channelId: triggerChannel.id,
                nameTemplate,
                userLimit,
                bitrate
            }
        );

        logger.info(
            `Система Join to Create успешно создана на сервере ${guildId}`
        );

        const responseEmbed = successEmbed(
            '✅ Настройка завершена',

            `Создан канал Join to Create: ${triggerChannel}\n\n` +

            `**Настройки:**\n` +

            `• Шаблон: \`${nameTemplate}\`\n` +

            `• Лимит пользователей: ${
                userLimit === 0
                    ? 'Без ограничений'
                    : userLimit + ' пользователей'
            }\n` +

            `• Битрейт: ${bitrate} кбит/с\n` +

            `${
                category
                    ? `• Категория: ${category.name}`
                    : '• Категория: Корневой уровень'
            }`
        );

        return await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [responseEmbed]
            }
        );

    } catch (error) {
        logger.error(
            'Ошибка в handleSetupSubcommand:',
            error
        );

        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Setup failed: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Не удалось настроить систему Join to Create. Проверьте права бота.'
        );
    }
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel =
            interaction.options.getChannel('trigger_channel');

        const guildId = interaction.guild.id;

        const currentConfig =
            await getChannelConfiguration(
                client,
                guildId,
                triggerChannel.id
            );

        const channelConfig =
            currentConfig.channelConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('Настройка Join to Create')
            .setDescription(
                `Настройки для ${triggerChannel}`
            )
            .setColor(getColor('info'))

            .addFields(
                {
                    name: 'Шаблон названия канала',
                    value:
                        `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },

                {
                    name: 'Лимит пользователей',
                    value:
                        `${
                            (
                                channelConfig.userLimit ??
                                currentConfig.userLimit ??
                                0
                            ) === 0
                                ? 'Без ограничений'
                                : (
                                    channelConfig.userLimit ??
                                    currentConfig.userLimit ??
                                    0
                                ) + ' пользователей'
                        }`,
                    inline: true
                },

                {
                    name: 'Битрейт',
                    value:
                        `${
                            (
                                channelConfig.bitrate ??
                                currentConfig.bitrate ??
                                64000
                            ) / 1000
                        } кбит/с`,
                    inline: true
                }
            )

            .setFooter({
                text:
                    'Используйте кнопки ниже для изменения настроек • На сервере поддерживается только один канал-триггер'
            })

            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(
                `jtc_config_name_${triggerChannel.id}`
            )
            .setLabel('📝 Шаблон названия')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(
                `jtc_config_limit_${triggerChannel.id}`
            )
            .setLabel('👥 Лимит пользователей')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(
                `jtc_config_bitrate_${triggerChannel.id}`
            )
            .setLabel('🎵 Битрейт')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(
                `jtc_config_delete_${triggerChannel.id}`
            )
            .setLabel('🗑️ Удалить канал')
            .setStyle(ButtonStyle.Danger);

        const row =
            new ActionRowBuilder().addComponents(
                nameButton,
                limitButton,
                bitrateButton,
                deleteButton
            );

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [configEmbed],
                components: [row]
            }
        );

        const message =
            await interaction.fetchReply();

        if (
            !message ||
            typeof message.createMessageComponentCollector !==
                'function'
        ) {
            throw new TitanBotError(
                'Failed to fetch interaction reply for collector setup',
                ErrorTypes.DISCORD_API,
                'Не удалось открыть элементы управления конфигурацией. Запустите `/jointocreate dashboard` ещё раз.'
            );
        }

        const collector =
            message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000
            });

        collector.on(
            'collect',
            async (buttonInteraction) => {
                try {
                    if (
                        !hasManageGuildPermission(
                            buttonInteraction.member
                        )
                    ) {
                        await buttonInteraction.reply({
                            content:
                                '❌ Для использования этих элементов управления необходимо право **Управление сервером**.',
                            flags: MessageFlags.Ephemeral
                        });

                        return;
                    }

                    const customId =
                        buttonInteraction.customId;

                    if (
                        customId.includes(
                            'jtc_config_name_'
                        )
                    ) {
                        await handleNameTemplateModal(
                            buttonInteraction,
                            triggerChannel,
                            currentConfig,
                            client
                        );

                    } else if (
                        customId.includes(
                            'jtc_config_limit_'
                        )
                    ) {
                        await handleUserLimitModal(
                            buttonInteraction,
                            triggerChannel,
                            currentConfig,
                            client
                        );

                    } else if (
                        customId.includes(
                            'jtc_config_bitrate_'
                        )
                    ) {
                        await handleBitrateModal(
                            buttonInteraction,
                            triggerChannel,
                            currentConfig,
                            client
                        );

                    } else if (
                        customId.includes(
                            'jtc_config_delete_'
                        )
                    ) {
                        await handleChannelDeletion(
                            buttonInteraction,
                            triggerChannel,
                            currentConfig,
                            client
                        );
                    }

                } catch (error) {
                    const userMessage =
                        error instanceof TitanBotError
                            ? error.userMessage ||
                              'Произошла ошибка.'
                            : 'Произошла ошибка при обработке запроса.';

                    if (
                        error instanceof TitanBotError
                    ) {
                        logger.debug(
                            `Ошибка проверки взаимодействия кнопки: ${error.message}`,
                            error.context || {}
                        );
                    } else {
                        logger.error(
                            'Неожиданная ошибка во взаимодействии с кнопкой конфигурации:',
                            error
                        );
                    }

                    await buttonInteraction
                        .reply({
                            content:
                                `❌ ${userMessage}`,
                            flags:
                                MessageFlags.Ephemeral
                        })
                        .catch(() => {});
                }
            }
        );

        collector.on('end', () => {
            const disabledRow =
                new ActionRowBuilder().addComponents(
                    nameButton.setDisabled(true),
                    limitButton.setDisabled(true),
                    bitrateButton.setDisabled(true),
                    deleteButton.setDisabled(true)
                );

            message.edit({
                components: [disabledRow],

                embeds: [
                    configEmbed.setFooter({
                        text:
                            'Сессия настройки истекла. Запустите команду ещё раз, чтобы внести изменения.'
                    })
                ]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Config failed: ${error.message}`,
            ErrorTypes.DATABASE,
            'Не удалось загрузить конфигурацию.'
        );
    }
}

async function handleNameTemplateModal(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    try {
        const TEMPLATE_OPTIONS = [
            {
                label: "{username} Комната (По умолчанию)",
                value: "{username} Комната"
            },
            {
                label: "{username} Канал",
                value: "{username} Канал"
            },
            {
                label: "{username} и его персональный Столик",
                value: "{username} и его персональный Столик"
            },
            {
                label: "{username} и его Космос",
                value: "{username} и его Космос"
            },
            {
                label: "{displayName} Комната",
                value: "{displayName} Комната"
            },
            {
                label: "{username} ГК",
                value: "{username} ГК"
            },
            {
                label: "{username} Музыкальная Комната",
                value: "{username} Музыкальная комната"
            },
            {
                label: "{username} Игровая Комната",
                value: "{username} Игровая Комната"
            },
            {
                label: "{username} Чат",
                value: "{username} Чат"
            },
            {
                label: "{username} Тетатет",
                value: "{username} Тетатет"
            }
        ];

        const currentTemplate =
            currentConfig.channelConfig?.nameTemplate ||
            currentConfig.channelNameTemplate ||
            "{username}'s Room";

        const templateSelect =
            new StringSelectMenuBuilder()
                .setCustomId('template')
                .setPlaceholder(
                    'Выберите шаблон названия...'
                )
                .setOptions(
                    TEMPLATE_OPTIONS.map(o => ({
                        label: o.label,
                        value: o.value,
                        default:
                            o.value === currentTemplate,
                    }))
                );

        const templateLabel =
            new LabelBuilder()
                .setLabel(
                    'Шаблон названия канала'
                )
                .setStringSelectMenuComponent(
                    templateSelect
                );

        const modal =
            new ModalBuilder()
                .setCustomId(
                    `jtc_name_modal_${triggerChannel.id}`
                )
                .setTitle(
                    'Шаблон названия канала'
                )
                .addLabelComponents(
                    templateLabel
                );

        await interaction.showModal(modal);

        const modalSubmission =
            await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.customId ===
                        `jtc_name_modal_${triggerChannel.id}` &&
                    i.user.id === interaction.user.id,
                time: 60000
            });

        if (
            !hasManageGuildPermission(
                modalSubmission.member
            )
        ) {
            await modalSubmission.reply({
                content:
                    '❌ Для изменения этих настроек необходимо право **Управление сервером**.',
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        const [newTemplate] =
            modalSubmission.fields.getStringSelectValues(
                'template'
            );

        await updateChannelConfig(
            client,
            interaction.guild.id,
            triggerChannel.id,
            {
                nameTemplate: newTemplate
            }
        );

        await logConfigurationChange(
            client,
            interaction.guild.id,
            interaction.user.id,
            'Изменён шаблон названия канала',
            {
                channelId: triggerChannel.id,
                newTemplate
            }
        );

        await modalSubmission.reply({
            embeds: [
                successEmbed(
                    'Настройки обновлены',
                    `Шаблон названия канала изменён на \`${newTemplate}\``
                )
            ],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (
            error.code ===
            'INTERACTION_COLLECTOR_ERROR'
        ) {
            return;
        }

        if (error instanceof TitanBotError) {
            throw error;
        }

        logger.error(
            'Неожиданная ошибка в модальном окне шаблона:',
            error
        );

        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Произошла ошибка при изменении шаблона.'
        );
    }
}

async function handleUserLimitModal(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    try {
        const currentLimit =
            currentConfig.channelConfig?.userLimit ??
            currentConfig.userLimit ??
            0;

        const modal =
            new ModalBuilder()
                .setCustomId(
                    `jtc_limit_modal_${triggerChannel.id}`
                )
                .setTitle(
                    'Настройка лимита пользователей'
                )
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('user_limit')
                            .setLabel(
                                'Введите лимит (0-99, 0 = без ограничений)'
                            )
                            .setPlaceholder(
                                'Введите число от 0 до 99'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setRequired(true)
                            .setMinLength(1)
                            .setMaxLength(2)
                            .setValue(
                                currentLimit.toString()
                            )
                    )
                );

        await interaction.showModal(modal);

        const modalSubmission =
            await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.customId ===
                        `jtc_limit_modal_${triggerChannel.id}` &&
                    i.user.id === interaction.user.id,
                time: 60000
            });

        if (
            !hasManageGuildPermission(
                modalSubmission.member
            )
        ) {
            await modalSubmission.reply({
                content:
                    '❌ Для изменения этих настроек необходимо право **Управление сервером**.',
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        const userInput =
            modalSubmission.fields
                .getTextInputValue('user_limit')
                .trim();

        const parsedLimit =
            parseInt(userInput);

        if (
            !Number.isInteger(parsedLimit) ||
            parsedLimit < 0 ||
            parsedLimit > 99
        ) {
            await modalSubmission.reply({
                content:
                    '❌ Лимит пользователей должен быть числом от 0 до 99.',
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        await updateChannelConfig(
            client,
            interaction.guild.id,
            triggerChannel.id,
            {
                userLimit: parsedLimit
            }
        );

        await logConfigurationChange(
            client,
            interaction.guild.id,
            interaction.user.id,
            'Изменён лимит пользователей',
            {
                channelId: triggerChannel.id,
                userLimit: parsedLimit
            }
        );

        await modalSubmission.reply({
            embeds: [
                successEmbed(
                    'Настройки обновлены',
                    `Лимит пользователей изменён на ${
                        parsedLimit === 0
                            ? 'Без ограничений'
                            : parsedLimit + ' пользователей'
                    }`
                )
            ],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (
            error.code ===
            'INTERACTION_COLLECTOR_ERROR'
        ) {
            return;
        }

        if (error instanceof TitanBotError) {
            throw error;
        }

        logger.error(
            'Неожиданная ошибка в модальном окне лимита:',
            error
        );

        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Произошла ошибка при изменении лимита пользователей.'
        );
    }
}

async function handleBitrateModal(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    try {
        const currentBitrate =
            (
                (
                    currentConfig.channelConfig?.bitrate ??
                    currentConfig.bitrate ??
                    64000
                ) / 1000
            );

        const modal =
            new ModalBuilder()
                .setCustomId(
                    `jtc_bitrate_modal_${triggerChannel.id}`
                )
                .setTitle(
                    'Настройка битрейта'
                )
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('bitrate')
                            .setLabel(
                                'Введите битрейт в кбит/с (8-384)'
                            )
                            .setPlaceholder(
                                'Введите число от 8 до 384'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setRequired(true)
                            .setMinLength(1)
                            .setMaxLength(3)
                            .setValue(
                                currentBitrate.toString()
                            )
                    )
                );

        await interaction.showModal(modal);

        const modalSubmission =
            await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.customId ===
                        `jtc_bitrate_modal_${triggerChannel.id}` &&
                    i.user.id === interaction.user.id,
                time: 60000
            });

        if (
            !hasManageGuildPermission(
                modalSubmission.member
            )
        ) {
            await modalSubmission.reply({
                content:
                    '❌ Для изменения этих настроек необходимо право **Управление сервером**.',
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        const userInput =
            modalSubmission.fields
                .getTextInputValue('bitrate')
                .trim();

        const parsedBitrate =
            parseInt(userInput);

        if (
            !Number.isInteger(parsedBitrate) ||
            parsedBitrate < 8 ||
            parsedBitrate > 384
        ) {
            await modalSubmission.reply({
                content:
                    '❌ Битрейт должен быть числом от 8 до 384 кбит/с.',
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        await updateChannelConfig(
            client,
            interaction.guild.id,
            triggerChannel.id,
            {
                bitrate: parsedBitrate * 1000
            }
        );

        await logConfigurationChange(
            client,
            interaction.guild.id,
            interaction.user.id,
            'Изменён битрейт',
            {
                channelId: triggerChannel.id,
                bitrate: parsedBitrate
            }
        );

        await modalSubmission.reply({
            embeds: [
                successEmbed(
                    'Настройки обновлены',
                    `Битрейт изменён на ${parsedBitrate} кбит/с`
                )
            ],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (
            error.code ===
            'INTERACTION_COLLECTOR_ERROR'
        ) {
            return;
        }

        if (error instanceof TitanBotError) {
            throw error;
        }

        logger.error(
            'Неожиданная ошибка в модальном окне битрейта:',
            error
        );

        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Произошла ошибка при изменении битрейта.'
        );
    }
}

async function handleChannelDeletion(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    try {
        const confirmRow =
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `jtc_delete_confirm_${triggerChannel.id}`
                    )
                    .setLabel('🗑️ Да, удалить')
                    .setStyle(
                        ButtonStyle.Danger
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `jtc_delete_cancel_${triggerChannel.id}`
                    )
                    .setLabel('❌ Отмена')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

        await InteractionHelper.safeReply(
            interaction,
            {
                embeds: [
                    warningEmbed(
                        'Подтверждение удаления',

                        `Вы уверены, что хотите удалить **${triggerChannel.name}** из системы Join to Create?\n\n` +
                        `Это действие нельзя отменить.`
                    )
                ],

                components: [confirmRow],

                flags:
                    MessageFlags.Ephemeral
            }
        );

        const message =
            await interaction.fetchReply();

        const deleteCollector =
            message.createMessageComponentCollector({
                componentType:
                    ComponentType.Button,

                filter: (i) =>
                    i.user.id ===
                        interaction.user.id &&
                    (
                        i.customId ===
                            `jtc_delete_confirm_${triggerChannel.id}` ||
                        i.customId ===
                            `jtc_delete_cancel_${triggerChannel.id}`
                    ),

                time: 600000,
                max: 1
            });

        deleteCollector.on(
            'collect',
            async (buttonInteraction) => {
                try {
                    if (
                        !hasManageGuildPermission(
                            buttonInteraction.member
                        )
                    ) {
                        await buttonInteraction.reply({
                            content:
                                '❌ Для удаления каналов необходимо право **Управление сервером**.',
                            flags:
                                MessageFlags.Ephemeral
                        });

                        return;
                    }

                    if (
                        buttonInteraction.customId ===
                        `jtc_delete_confirm_${triggerChannel.id}`
                    ) {
                        await removeTriggerChannel(
                            client,
                            interaction.guild.id,
                            triggerChannel.id
                        );

                        await logConfigurationChange(
                            client,
                            interaction.guild.id,
                            interaction.user.id,
                            'Удалён триггер Join to Create',
                            {
                                channelId:
                                    triggerChannel.id,

                                channelName:
                                    triggerChannel.name
                            }
                        );

                        try {
                            if (
                                triggerChannel.members
                                    .size === 0
                            ) {
                                await triggerChannel.delete(
                                    'Канал-триггер Join to Create удалён администратором'
                                );
                            }
                        } catch (deleteError) {
                            logger.warn(
                                `Не удалось удалить канал ${triggerChannel.id}: ${deleteError.message}`
                            );
                        }

                        await buttonInteraction.update({
                            embeds: [
                                successEmbed(
                                    'Канал удалён',

                                    `**${triggerChannel.name}** был удалён из системы Join to Create.`
                                )
                            ],

                            components: []
                        });

                    } else {
                        await buttonInteraction.update({
                            embeds: [
                                successEmbed(
                                    'Отменено',
                                    'Удаление канала отменено.'
                                )
                            ],

                            components: []
                        });
                    }

                } catch (collectError) {
                    logger.error(
                        'Ошибка обработки подтверждения удаления:',
                        collectError
                    );

                    await buttonInteraction
                        .reply({
                            content:
                                '❌ Произошла ошибка при обработке запроса.',
                            flags:
                                MessageFlags.Ephemeral
                        })
                        .catch(() => {});
                }
            }
        );

        deleteCollector.on(
            'end',
            (collected, reason) => {
                if (
                    reason === 'time' &&
                    collected.size === 0
                ) {
                    message
                        .edit({
                            components: []
                        })
                        .catch(() => {});
                }
            }
        );

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        logger.error(
            'Неожиданная ошибка в handleChannelDeletion:',
            error
        );

        throw new TitanBotError(
            `Deletion error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Произошла ошибка при удалении канала.'
        );
    }
}
