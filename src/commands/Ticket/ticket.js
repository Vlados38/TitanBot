import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Управляет системой тикетов сервера.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Настраивает панель создания тикетов в указанном канале.",
                )
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription(
                            "Канал, в котором будет размещена панель тикетов.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "Основное сообщение/описание панели тикетов.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "Название кнопки создания тикета (по умолчанию: Создать тикет)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "Категория, в которой будут создаваться новые тикеты (необязательно).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "Категория, в которую будут перемещаться закрытые тикеты (необязательно).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "Роль, которая получит доступ к тикетам (необязательно).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Максимальное количество тикетов, которые пользователь может создать (по умолчанию: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Отправлять пользователю ЛС при закрытии тикета (по умолчанию: да)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Открыть интерактивную панель управления системой тикетов"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Доступ к команде тикетов запрещён', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });

            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для выполнения этого действия вам необходимо разрешение `Manage Channels`.',
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);

            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `На этом сервере уже настроена система тикетов (панель находится в <#${existingConfig.ticketPanelChannelId}>).\n\nНа сервере поддерживается только одна система тикетов. Используйте \`/ticket dashboard\`, чтобы изменить существующую настройку, или выберите **Удалить систему** в панели управления, чтобы удалить её и настроить заново.`,
                });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");

            const categoryChannel =
                interaction.options.getChannel("category");

            const closedCategoryChannel =
                interaction.options.getChannel("closed_category");

            const staffRole =
                interaction.options.getRole("staff_role");

            const panelMessage =
                interaction.options.getString("panel_message") ||
                "Нажмите кнопку ниже, чтобы создать тикет поддержки.";

            const buttonLabel =
                interaction.options.getString("button_label") ||
                "Создать тикет";

            const maxTicketsPerUser =
                interaction.options.getInteger("max_tickets_per_user") || 3;

            const dmOnClose =
                interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({
                title: "Тикеты поддержки",
                description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;

                    currentConfig.ticketCategoryId =
                        categoryChannel ? categoryChannel.id : null;

                    currentConfig.ticketClosedCategoryId =
                        closedCategoryChannel ? closedCategoryChannel.id : null;

                    currentConfig.ticketStaffRoleId =
                        staffRole ? staffRole.id : null;

                    currentConfig.ticketPanelChannelId =
                        panelChannel.id;

                    currentConfig.ticketPanelMessageId =
                        sentPanel?.id || null;

                    currentConfig.ticketPanelMessage =
                        panelMessage;

                    currentConfig.ticketButtonLabel =
                        buttonLabel;

                    currentConfig.maxTicketsPerUser =
                        maxTicketsPerUser;

                    currentConfig.dmOnClose =
                        dmOnClose;

                    await setGuildConfig(
                        client,
                        interaction.guildId,
                        currentConfig
                    );

                    logger.info('Конфигурация тикетов сохранена', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error(
                        'Настройка тикетов: база данных недоступна, панель отправлена, но конфигурация НЕ сохранена',
                        {
                            guildId: interaction.guildId,
                        }
                    );
                }

                let successMessage =
                    `Панель создания тикетов отправлена в ${panelChannel}.`;

                if (categoryChannel) {
                    successMessage +=
                        ` Новые тикеты будут создаваться в категории **${categoryChannel.name}**.`;
                } else {
                    successMessage +=
                        ' Новые тикеты будут создаваться в новой категории "Тикеты".';
                }

                if (closedCategoryChannel) {
                    successMessage +=
                        ` Закрытые тикеты будут перемещаться в категорию **${closedCategoryChannel.name}**.`;
                }

                if (staffRole) {
                    successMessage +=
                        ` Роль **${staffRole.name}** получит доступ к тикетам.`;
                }

                successMessage +=
                    `\n\n**Максимум тикетов на пользователя:** ${maxTicketsPerUser}` +
                    `\n**ЛС при закрытии:** ${dmOnClose ? 'Включены' : 'Отключены'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Панель тикетов настроена",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Настройка панели тикетов завершена', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "Настройка системы тикетов (журнал конфигурации)",
                    description: `Панель тикетов была настроена в ${panelChannel} пользователем ${interaction.user}.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Канал панели",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Категория тикетов",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "Не указана.",
                            inline: true,
                        },
                        {
                            name: "Категория закрытых тикетов",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "Не указана.",
                            inline: true,
                        },
                        {
                            name: "Роль сотрудников",
                            value: staffRole
                                ? staffRole.toString()
                                : "Не указана.",
                            inline: true,
                        },
                        {
                            name: "Максимум тикетов на пользователя",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "ЛС при закрытии",
                            value: dmOnClose ? 'Включены' : 'Отключены',
                            inline: true,
                        },
                        {
                            name: "Модератор",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ошибка настройки тикетов', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });

                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Не удалось отправить панель тикетов или сохранить конфигурацию. Проверьте права бота (особенно возможность отправлять сообщения в выбранный канал) и подключение к базе данных.',
                    }).catch(err => {
                        logger.error('Не удалось отправить сообщение об ошибке', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};
