import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    LabelBuilder,
    RoleSelectMenuBuilder
} from 'discord.js';

import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getColor, getApplicationStatusColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import {
    withErrorHandling,
    createError,
    ErrorTypes,
    replyUserError
} from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';

import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplication,
    getApplications,
    updateApplication,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplication
} from '../../utils/database.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import appDashboard from './modules/app_dashboard.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized =
        typeof statusValue === 'string'
            ? statusValue.trim().toLowerCase()
            : 'unknown';

    const statusLabel =
        normalized === 'pending'
            ? 'В процессе'
            : normalized === 'approved'
              ? 'Принято'
              : normalized === 'denied'
                ? 'Отклонено'
                : 'Неизвестно';

    const statusEmoji =
        normalized === 'pending'
            ? '🟡'
            : normalized === 'approved'
              ? '🟢'
              : normalized === 'denied'
                ? '🔴'
                : '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
        .setName('app-admin')
        .setDescription('Управление заявками сотрудников')

        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Настроить новую заявку')
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('review')
                .setDescription('Одобрить или отклонить заявку')
                .addStringOption((option) =>
                    option
                        .setName('id')
                        .setDescription('ID заявки')
                        .setRequired(true)
                )
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('Показать все заявки')

                .addStringOption((option) =>
                    option
                        .setName('status')
                        .setDescription('Фильтр по статусу')
                        .addChoices(
                            { name: 'В процессе', value: 'pending' },
                            { name: 'Одобрена', value: 'approved' },
                            { name: 'Отклонена', value: 'denied' }
                        )
                )

                .addStringOption((option) =>
                    option
                        .setName('role')
                        .setDescription('Фильтр по ID роли')
                )

                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('Фильтр по пользователю')
                )

                .addNumberOption((option) =>
                    option
                        .setName('limit')
                        .setDescription(
                            'Максимальное количество отображаемых заявок (по умолчанию: 10)'
                        )
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Открыть панель настройки заявок')

                .addStringOption((option) =>
                    option
                        .setName('application')
                        .setDescription('Выберите заявку для настройки')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    category: 'Community',

    execute: withErrorHandling(
        async (interaction) => {
            if (!interaction.inGuild()) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Эту команду можно использовать только на сервере.'
                });
            }

            const { options, guild, member } = interaction;
            const subcommand = options.getSubcommand();

            if (subcommand !== 'dashboard' && subcommand !== 'setup') {
                await InteractionHelper.safeDefer(interaction, {
                    flags: ['Ephemeral']
                });
            }

            logger.info(`Выполнена команда app-admin: ${subcommand}`, {
                userId: interaction.user.id,
                guildId: guild.id,
                subcommand
            });

            await ApplicationService.checkManagerPermission(
                interaction.client,
                guild.id,
                member
            );

            if (subcommand === 'setup') {
                await handleSetup(interaction);
            } else if (subcommand === 'review') {
                await handleReview(interaction);
            } else if (subcommand === 'list') {
                await handleList(interaction);
            } else if (subcommand === 'dashboard') {
                const selectedAppName =
                    interaction.options.getString('application');

                await appDashboard.execute(
                    interaction,
                    null,
                    interaction.client,
                    selectedAppName
                );
            }
        },
        {
            type: 'command',
            commandName: 'app-admin'
        }
    )
};

async function handleSetup(interaction) {
    if (interaction.deferred || interaction.replied) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message:
                'Это взаимодействие уже было обработано. Пожалуйста, попробуйте выполнить команду ещё раз.'
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('Настройка новой заявки');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('Выберите роль, на которую будут подаваться заявки')
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Роль для заявки')
        .setDescription('Роль, на которую пользователи смогут подавать заявки')
        .setRoleSelectMenuComponent(roleSelect);

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Например: Модератор, Помощник, Разработчик')
        .setMaxLength(50)
        .setMinLength(1)
        .setRequired(true);

    const appNameLabel = new LabelBuilder()
        .setLabel('Название заявки')
        .setTextInputComponent(appNameInput);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Почему вы хотите получить эту роль?')
        .setMaxLength(100)
        .setMinLength(1)
        .setRequired(true);

    const q1Label = new LabelBuilder()
        .setLabel('Вопрос 1 (обязательный)')
        .setTextInputComponent(q1Input);

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Какой у вас опыт?')
        .setMaxLength(100)
        .setRequired(false);

    const q2Label = new LabelBuilder()
        .setLabel('Вопрос 2 (необязательный)')
        .setTextInputComponent(q2Input);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    const q3Label = new LabelBuilder()
        .setLabel('Вопрос 3 (необязательный)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(
        roleLabel,
        appNameLabel,
        q1Label,
        q2Label,
        q3Label
    );

    await interaction.showModal(modal);

    const submitted = await interaction
        .awaitModalSubmit({
            time: 15 * 60 * 1000,
            filter: (i) =>
                i.customId === 'app_setup_modal' &&
                i.user.id === interaction.user.id
        })
        .catch(() => null);

    if (!submitted) {
        logger.info(
            'Модальное окно настройки заявки закрыто или время ожидания истекло',
            {
                guildId: interaction.guild.id,
                userId: interaction.user.id
            }
        );
        return;
    }

    const appName = submitted.fields
        .getTextInputValue('app_name')
        .trim();

    const selectedRoles = submitted.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles.first()?.id;

    if (!roleId) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'Необходимо выбрать роль для заявки.'
        });
        return;
    }

    const questions = [
        submitted.fields
            .getTextInputValue('app_question_1')
            .trim(),

        submitted.fields
            .getTextInputValue('app_question_2')
            .trim(),

        submitted.fields
            .getTextInputValue('app_question_3')
            .trim()
    ].filter((q) => q.length > 0);

    const role = await interaction.guild.roles
        .fetch(roleId)
        .catch(() => null);

    if (!role) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Выбранная роль не найдена.'
        });
        return;
    }

    const existingRoles = await getApplicationRoles(
        interaction.client,
        interaction.guild.id
    );

    if (existingRoles.some((r) => r.roleId === roleId)) {
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: `Роль ${role} уже настроена как заявка.`
        });
        return;
    }

    existingRoles.push({
        roleId: roleId,
        name: appName,
        enabled: true
    });

    await saveApplicationRoles(
        interaction.client,
        interaction.guild.id,
        existingRoles
    );

    const settings = await getApplicationSettings(
        interaction.client,
        interaction.guild.id
    );

    if (!settings.enabled) {
        await ApplicationService.updateSettings(
            interaction.client,
            interaction.guild.id,
            { enabled: true }
        );
    }

    await saveApplicationRoleSettings(
        interaction.client,
        interaction.guild.id,
        roleId,
        { questions }
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Заявка создана',
                `Заявка **${appName}** создана для роли ${role}.\n\nВы можете настроить канал логов, роли менеджеров, вопросы и срок хранения в панели управления.`
            )
        ],
        flags: ['Ephemeral']
    });

    setTimeout(() => {
        appDashboard.execute(
            submitted,
            null,
            interaction.client,
            appName
        );
    }, 500);
}

async function handleReview(interaction) {
    const appId = interaction.options.getString('id');

    const application = await getApplication(
        interaction.client,
        interaction.guild.id,
        appId
    );

    if (!application) {
        return await replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Заявка не найдена.'
        });
    }

    if (application.status !== 'pending') {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Эта заявка уже была обработана.'
        });
    }

    const appEmbed = createEmbed({
        title: 'Просмотр заявки',
        description:
            `**Пользователь:** <@${application.userId}>\n` +
            `**Заявка:** ${application.roleName}\n` +
            `**ID заявки:** \`${appId}\``,
        color: 'info'
    });

    if (application.answers && application.answers.length > 0) {
        application.answers.forEach((item, index) => {
            appEmbed.addFields({
                name: `В${index + 1}: ${item.question}`,
                value: item.answer || '*Ответ не предоставлен*',
                inline: false
            });
        });
    }

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_review_approve_${appId}`)
            .setLabel('Одобрить')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`app_review_deny_${appId}`)
            .setLabel('Отклонить')
            .setStyle(ButtonStyle.Danger)
    );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [appEmbed],
        components: [buttonRow],
        flags: ['Ephemeral']
    });

    const collector =
        interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,

            filter: (i) =>
                i.user.id === interaction.user.id &&
                (
                    i.customId.startsWith(
                        `app_review_approve_${appId}`
                    ) ||
                    i.customId.startsWith(
                        `app_review_deny_${appId}`
                    )
                ),

            time: 300_000,
            max: 1
        });

    collector.on('collect', async (buttonInteraction) => {
        const isApprove =
            buttonInteraction.customId.includes('approve');

        const reasonModal = new ModalBuilder()
            .setCustomId(
                `app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}`
            )
            .setTitle(
                `${isApprove ? 'Одобрение' : 'Отклонение'} заявки — причина`
            );

        reasonModal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('review_reason')
                    .setLabel('Причина (необязательно)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder(
                        'Укажите причину принятого решения...'
                    )
                    .setMaxLength(500)
                    .setRequired(false)
            )
        );

        await buttonInteraction.showModal(reasonModal);

        try {
            const reasonSubmit = await buttonInteraction
                .awaitModalSubmit({
                    time: 5 * 60 * 1000,

                    filter: (i) =>
                        i.customId ===
                            `app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}` &&
                        i.user.id === buttonInteraction.user.id
                })
                .catch(() => null);

            if (!reasonSubmit) return;

            const reason =
                reasonSubmit.fields
                    .getTextInputValue('review_reason')
                    .trim() || 'Причина не указана.';

            const action = isApprove ? 'approve' : 'deny';
            const status = isApprove ? 'approved' : 'denied';

            await ApplicationService.reviewApplication(
                reasonSubmit.client,
                interaction.guild.id,
                appId,
                {
                    action,
                    reason,
                    reviewerId: reasonSubmit.user.id
                }
            );

            try {
                const user = await reasonSubmit.client.users.fetch(
                    application.userId
                );

                const statusColor =
                    getApplicationStatusColor(status);

                const reviewStatus =
                    getApplicationStatusPresentation(status);

                const dmEmbed = createEmbed({
                    title: `${reviewStatus.statusEmoji} Заявка ${reviewStatus.statusLabel}`,
                    description:
                        `Ваша заявка на **${application.roleName}** была **${status === 'approved' ? 'одобрена' : 'отклонена'}**.\n` +
                        `**Примечание:** ${reason}\n\n` +
                        `Используйте \`/apply status id:${appId}\`, чтобы посмотреть подробности.`
                }).setColor(statusColor);

                await user.send({
                    embeds: [dmEmbed]
                });
            } catch (error) {
                logger.warn(
                    'Не удалось отправить пользователю личное сообщение о рассмотрении заявки',
                    {
                        error: error.message,
                        userId: application.userId,
                        applicationId: appId
                    }
                );
            }

            if (
                application.logMessageId &&
                application.logChannelId
            ) {
                try {
                    const statusColor =
                        getApplicationStatusColor(status);

                    const logChannel =
                        interaction.guild.channels.cache.get(
                            application.logChannelId
                        );

                    if (logChannel) {
                        const logMessage =
                            await logChannel.messages.fetch(
                                application.logMessageId
                            );

                        if (logMessage) {
                            const embed =
                                logMessage.embeds[0];

                            if (embed) {
                                const reviewStatus =
                                    getApplicationStatusPresentation(
                                        status
                                    );

                                const newEmbed =
                                    EmbedBuilder.from(embed)
                                        .setColor(statusColor)
                                        .spliceFields(0, 1, {
                                            name: 'Статус',
                                            value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`
                                        });

                                await logMessage.edit({
                                    embeds: [newEmbed],
                                    components: []
                                });
                            }
                        }
                    }
                } catch (error) {
                    logger.warn(
                        'Не удалось обновить сообщение в канале логов',
                        {
                            error: error.message,
                            applicationId: appId,
                            logMessageId:
                                application.logMessageId
                        }
                    );
                }
            }

            if (isApprove) {
                try {
                    const member =
                        await interaction.guild.members.fetch(
                            application.userId
                        );

                    await member.roles.add(
                        application.roleId
                    );
                } catch (error) {
                    logger.error(
                        'Не удалось выдать роль одобренному пользователю',
                        {
                            error: error.message,
                            userId: application.userId,
                            roleId: application.roleId,
                            applicationId: appId
                        }
                    );
                }
            }

            await reasonSubmit.reply({
                embeds: [
                    successEmbed(
                        `Заявка ${status === 'approved' ? 'одобрена' : 'отклонена'}`,
                        `Заявка была **${status === 'approved' ? 'одобрена' : 'отклонена'}**.`
                    )
                ],
                flags: ['Ephemeral']
            });
        } catch (error) {
            logger.error(
                'Ошибка при рассмотрении заявки:',
                error
            );

            await replyUserError(buttonInteraction, {
                type: ErrorTypes.UNKNOWN,
                message:
                    'Произошла ошибка при рассмотрении заявки.'
            });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = createEmbed({
                title: 'Время рассмотрения истекло',
                description:
                    'Кнопки рассмотрения заявки больше недоступны.',
                color: 'warning'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: []
            }).catch(() => {});
        }
    });
}

async function handleList(interaction) {
    const status =
        interaction.options.getString('status');

    const user =
        interaction.options.getUser('user');

    const limit =
        interaction.options.getNumber('limit') || 10;

    const filters = {};

    if (status) {
        filters.status = status;
    } else {
        filters.status = 'pending';
    }

    let applications = await getApplications(
        interaction.client,
        interaction.guild.id,
        filters
    );

    if (!user) {
        applications = await Promise.all(
            applications.map(async (app) => {
                try {
                    await interaction.guild.members.fetch(
                        app.userId
                    );

                    return app;
                } catch {
                    await deleteApplication(
                        interaction.client,
                        interaction.guild.id,
                        app.id,
                        app.userId
                    );

                    return null;
                }
            })
        ).then((results) =>
            results.filter(Boolean)
        );
    }

    if (user) {
        applications = applications.filter(
            (app) => app.userId === user.id
        );
    }

    if (applications.length === 0) {
        const applicationRoles =
            await getApplicationRoles(
                interaction.client,
                interaction.guild.id
            );

        if (applicationRoles.length > 0) {
            const embed = createEmbed({
                title: 'Заявки не найдены',

                description:
                    'Не найдено отправленных заявок, соответствующих указанным критериям.\n\n' +
                    'Однако настроены следующие роли для подачи заявок:'
            });

            applicationRoles.forEach(
                (appRole, index) => {
                    const role =
                        interaction.guild.roles.cache.get(
                            appRole.roleId
                        );

                    embed.addFields({
                        name: `${index + 1}. ${appRole.name}`,

                        value:
                            `**Роль:** ${
                                role
                                    ? `<@&${appRole.roleId}>`
                                    : 'Роль не найдена'
                            }\n` +
                            '**Доступна для заявок:** Да',

                        inline: false
                    });
                }
            );

            embed.setFooter({
                text:
                    'Пользователи могут подать заявку через /apply submit или посмотреть доступные роли через /apply list'
            });

            return InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [embed],
                    flags: ['Ephemeral']
                }
            );
        } else {
            return await replyUserError(
                interaction,
                {
                    type: ErrorTypes.CONFIGURATION,

                    message:
                        'Заявки не найдены, и роли для подачи заявок не настроены.\n' +
                        'Сначала настройте роли для заявок.'
                }
            );
        }
    }

    applications = applications
        .sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        )
        .slice(0, limit);

    const embed = createEmbed({
        title: 'Отправленные заявки',

        description:
            `Показано заявок: ${applications.length}.`
    });

    applications.forEach((app) => {
        const statusView =
            getApplicationStatusPresentation(
                app?.status
            );

        const roleName =
            app?.roleName || 'Неизвестная роль';

        const username =
            app?.username || 'Неизвестный пользователь';

        const createdAt =
            app?.createdAt
                ? new Date(app.createdAt)
                : null;

        const createdAtDisplay =
            createdAt &&
            !Number.isNaN(createdAt.getTime())
                ? createdAt.toLocaleString()
                : 'Неизвестная дата';

        embed.addFields({
            name:
                `${statusView.statusEmoji} ` +
                `${roleName} - ${username}`,

            value:
                `**ID:** \`${app.id}\`\n` +
                `**Статус:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Дата:** ${createdAtDisplay}`,

            inline: true
        });
    });

    await InteractionHelper.safeEditReply(
        interaction,
        {
            embeds: [embed],
            flags: ['Ephemeral']
        }
    );
}
