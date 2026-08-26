import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
            const guildId = interaction.guild.id;

            const currentConfig = await getJoinToCreateConfig(client, guildId);

            if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                throw new TitanBotError(
                    `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                    ErrorTypes.VALIDATION,
                    `${triggerChannel} не настроен как триггер-канал Join to Create.`
                );
            }

            const embed = new EmbedBuilder()
                .setTitle('Настройка Join to Create')
                .setDescription(`Настройте параметры для ${triggerChannel}`)
                .setColor(getColor('info'))
                .addFields(
                    {
                        name: 'Текущий шаблон названия канала',
                        value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                        inline: false
                    },
                    {
                        name: 'Текущий лимит пользователей',
                        value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Без ограничений' : currentConfig.userLimit + ' пользователей'}`,
                        inline: true
                    },
                    {
                        name: 'Текущий битрейт',
                        value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} кбит/с`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Выберите параметр для настройки ниже' })
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`jointocreate_config_${triggerChannel.id}`)
                .setPlaceholder('Выберите параметр для настройки')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Изменить шаблон названия канала')
                        .setDescription('Изменить шаблон названий временных каналов')
                        .setValue('name_template'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Изменить лимит пользователей')
                        .setDescription('Установить максимальное количество пользователей во временном канале')
                        .setValue('user_limit'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Изменить битрейт')
                        .setDescription('Настроить качество звука временных каналов')
                        .setValue('bitrate'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Удалить этот триггер-канал')
                        .setDescription('Удалить этот канал из системы Join to Create')
                        .setValue('remove_trigger'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Просмотреть текущие настройки')
                        .setDescription('Показать все текущие параметры конфигурации')
                        .setValue('view_settings')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            }).catch(error => {
                logger.error('Не удалось изменить ответ в config_setup:', error);
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) =>
                    i.user.id === interaction.user.id &&
                    i.customId === `jointocreate_config_${triggerChannel.id}`,
                time: 60000
            });

            collector.on('collect', async (selectInteraction) => {
                await selectInteraction.deferUpdate();

                const selectedOption = selectInteraction.values[0];

                try {
                    switch (selectedOption) {
                        case 'name_template':
                            await handleNameTemplateChange(
                                selectInteraction,
                                triggerChannel,
                                currentConfig,
                                client
                            );
                            break;

                        case 'user_limit':
                            await handleUserLimitChange(
                                selectInteraction,
                                triggerChannel,
                                currentConfig,
                                client
                            );
                            break;

                        case 'bitrate':
                            await handleBitrateChange(
                                selectInteraction,
                                triggerChannel,
                                currentConfig,
                                client
                            );
                            break;

                        case 'remove_trigger':
                            await handleRemoveTrigger(
                                selectInteraction,
                                triggerChannel,
                                currentConfig,
                                client
                            );
                            break;

                        case 'view_settings':
                            await handleViewSettings(
                                selectInteraction,
                                triggerChannel,
                                currentConfig,
                                client
                            );
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(
                            `Ошибка проверки конфигурации: ${error.message}`,
                            error.context || {}
                        );
                    } else {
                        logger.error('Непредвиденная ошибка меню конфигурации:', error);
                    }

                    const errorMessage = error instanceof TitanBotError
                        ? error.userMessage || 'Произошла ошибка при обработке вашего выбора.'
                        : 'Произошла ошибка при обработке вашего выбора.';

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        selectMenu.setDisabled(true)
                    );

                    await InteractionHelper.safeEditReply(interaction, {
                        components: [disabledRow],
                    }).catch(() => {});
                }
            });

        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }

            logger.error('Непредвиденная ошибка в config_setup:', error);

            throw new TitanBotError(
                `Ошибка настройки: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Не удалось настроить систему Join to Create.'
            );
        }
    }
};

async function handleNameTemplateChange(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    const embed = new EmbedBuilder()
        .setTitle('Настройка шаблона названия канала')
        .setDescription('Введите новый шаблон названия канала.')
        .addFields(
            {
                name: 'Доступные переменные',
                value:
                    '• `{username}` — имя пользователя\n' +
                    '• `{display_name}` — отображаемое имя пользователя\n' +
                    '• `{user_tag}` — тег пользователя (User#1234)\n' +
                    '• `{guild_name}` — название сервера',
                inline: false
            },
            {
                name: 'Текущий шаблон',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Введите новый шаблон в чат ниже' });

    await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();

            if (!newTemplate || newTemplate.length > 100) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Шаблон должен содержать от 1 до 100 символов.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};

            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(
                client,
                interaction.guild.id,
                {
                    channelOptions: channelOptions
                }
            );

            await interaction.followUp({
                embeds: [
                    successEmbed(
                        'Шаблон обновлён',
                        `Шаблон названия канала изменён на \`${newTemplate}\``
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});

        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Ошибка проверки шаблона: ${error.message}`);
            } else {
                logger.error('Ошибка обновления шаблона:', error);
            }

            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Не удалось обновить шаблон названия канала.'
                : 'Не удалось обновить шаблон названия канала.';

            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Ответ не получен. Изменение шаблона отменено.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    const embed = new EmbedBuilder()
        .setTitle('Настройка лимита пользователей')
        .setDescription(
            'Введите новый лимит пользователей (0–99, где 0 = без ограничений).'
        )
        .addFields(
            {
                name: 'Текущий лимит',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Без ограничений' : currentConfig.userLimit + ' пользователей'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Введите новый лимит в чат ниже' });

    await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) =>
            m.author.id === interaction.user.id &&
            /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());

            if (newLimit < 0 || newLimit > 99) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Лимит пользователей должен быть от 0 до 99.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};

            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(
                client,
                interaction.guild.id,
                {
                    channelOptions: channelOptions
                }
            );

            await interaction.followUp({
                embeds: [
                    successEmbed(
                        'Лимит обновлён',
                        `Лимит пользователей изменён на ${
                            newLimit === 0
                                ? 'Без ограничений'
                                : newLimit + ' пользователей'
                        }`
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});

        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Ошибка проверки лимита: ${error.message}`);
            } else {
                logger.error('Ошибка обновления лимита:', error);
            }

            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Не удалось обновить лимит пользователей.'
                : 'Не удалось обновить лимит пользователей.';

            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Корректный ответ не получен. Изменение отменено.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    const embed = new EmbedBuilder()
        .setTitle('Настройка битрейта')
        .setDescription('Введите новый битрейт в кбит/с (8–384).')
        .addFields(
            {
                name: 'Текущий битрейт',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} кбит/с`,
                inline: false
            },
            {
                name: 'Распространённые значения',
                value:
                    '• 64 кбит/с — обычное качество\n' +
                    '• 96 кбит/с — хорошее качество\n' +
                    '• 128 кбит/с — высокое качество\n' +
                    '• 256 кбит/с — очень высокое качество',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Введите новый битрейт в чат ниже' });

    await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) =>
            m.author.id === interaction.user.id &&
            /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());

            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Битрейт должен быть от 8 до 384 кбит/с.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};

            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(
                client,
                interaction.guild.id,
                {
                    channelOptions: channelOptions
                }
            );

            await interaction.followUp({
                embeds: [
                    successEmbed(
                        'Битрейт обновлён',
                        `Битрейт изменён на ${newBitrate} кбит/с`
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});

        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Ошибка проверки битрейта: ${error.message}`);
            } else {
                logger.error('Ошибка обновления битрейта:', error);
            }

            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Не удалось обновить битрейт.'
                : 'Не удалось обновить битрейт.';

            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Корректный ответ не получен. Изменение отменено.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    const embed = new EmbedBuilder()
        .setTitle('Удаление триггер-канала')
        .setDescription(
            `Вы уверены, что хотите удалить ${triggerChannel} из системы Join to Create?`
        )
        .setColor('#ff6600')
        .setFooter({ text: 'Это действие нельзя отменить' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Удалить канал')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Отмена')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) =>
            i.user.id === interaction.user.id &&
            (
                i.customId === `confirm_remove_${triggerChannel.id}` ||
                i.customId === `cancel_remove_${triggerChannel.id}`
            ),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(
                    client,
                    interaction.guild.id,
                    triggerChannel.id
                );

                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [
                            successEmbed(
                                'Канал удалён',
                                `${triggerChannel} был удалён из системы Join to Create.`
                            )
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserError(buttonInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'Не удалось удалить триггер-канал.'
                    });
                }

            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(
                        `Ошибка проверки удаления триггера: ${error.message}`
                    );
                } else {
                    logger.error('Ошибка удаления триггера:', error);
                }

                const errorMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Произошла ошибка при удалении триггер-канала.'
                    : 'Произошла ошибка при удалении триггер-канала.';

                await replyUserError(buttonInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [
                    successEmbed(
                        'Отменено',
                        'Удаление канала отменено.'
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Ответ не получен. Удаление отменено.'
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(
    interaction,
    triggerChannel,
    currentConfig,
    client
) {
    const channelConfig =
        currentConfig.channelOptions?.[triggerChannel.id] || {};

    const embed = new EmbedBuilder()
        .setTitle('Текущие настройки')
        .setDescription(`Конфигурация для ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: 'Триггер-канал',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: 'Шаблон названия канала',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: 'Лимит пользователей',
                value: `${
                    channelConfig.userLimit || currentConfig.userLimit === 0
                        ? 'Без ограничений'
                        : (channelConfig.userLimit || currentConfig.userLimit) +
                          ' пользователей'
                }`,
                inline: true
            },
            {
                name: 'Битрейт',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} кбит/с`,
                inline: true
            },
            {
                name: 'Категория',
                value: currentConfig.categoryId
                    ? `<#${currentConfig.categoryId}>`
                    : 'Не установлена',
                inline: true
            },
            {
                name: 'Статус системы',
                value: currentConfig.enabled
                    ? '✅ Включена'
                    : '❌ Выключена',
                inline: true
            },
            {
                name: 'Активные временные каналы',
                value: Object.keys(
                    currentConfig.temporaryChannels || {}
                ).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}
