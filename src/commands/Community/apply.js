import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

import {
    getDefaultApplicationQuestions,
} from '../../config/bot.js';

import {
    createEmbed,
    successEmbed,
} from '../../utils/embeds.js';

import { logger } from '../../utils/logger.js';

import {
    handleInteractionError,
    withErrorHandling,
    createError,
    ErrorTypes,
    replyUserError,
} from '../../utils/errorHandler.js';

import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import {
    logEvent,
    EVENT_TYPES,
    resolveApplicationLogChannel,
} from '../../services/loggingService.js';

import {
    formatLogLine,
    resolveUserAuthor,
} from '../../utils/logging/logEmbeds.js';

import { getGuildConfig } from '../../services/config/guildConfig.js';

import {
    getApplicationSettings,
    getUserApplications,
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings,
} from '../../utils/database.js';


/**
 * Отображение статуса заявки.
 */
function getApplicationStatusPresentation(statusValue) {
    const normalized =
        typeof statusValue === 'string'
            ? statusValue.trim().toLowerCase()
            : 'unknown';

    const statusLabel =
        normalized === 'pending'
            ? 'На рассмотрении'
            : normalized === 'approved'
                ? 'Одобрена'
                : normalized === 'denied'
                    ? 'Отклонена'
                    : 'Неизвестно';

    const statusEmoji =
        normalized === 'pending'
            ? '🟡'
            : normalized === 'approved'
                ? '🟢'
                : normalized === 'denied'
                    ? '🔴'
                    : '⚪';

    return {
        normalized,
        statusLabel,
        statusEmoji,
    };
}


export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Управление заявками на получение ролей')

        // /apply submit
        .addSubcommand((subcommand) =>
            subcommand
                .setName('submit')
                .setDescription('Подать заявку на получение роли')
                .addStringOption((option) =>
                    option
                        .setName('application')
                        .setDescription('Выберите заявку, которую хотите подать')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )

        // /apply status
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('Проверить статус своей заявки')
                .addStringOption((option) =>
                    option
                        .setName('id')
                        .setDescription(
                            'ID заявки (оставьте пустым, чтобы посмотреть все заявки)'
                        )
                        .setRequired(false)
                )
        )

        // /apply list
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('Показать доступные заявки')
        ),

    category: 'Community',

    execute: withErrorHandling(
        async (interaction) => {
            if (!interaction.inGuild()) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        'Эту команду можно использовать только на сервере.',
                });
            }

            const { options, guild } = interaction;
            const subcommand = options.getSubcommand();

            /*
             * submit открывает модальное окно,
             * поэтому предварительно defer делать нельзя.
             */
            if (subcommand !== 'submit') {
                const isListCommand =
                    subcommand === 'list';

                await InteractionHelper.safeDefer(
                    interaction,
                    {
                        flags: isListCommand
                            ? []
                            : ['Ephemeral'],
                    }
                );
            }

            logger.info(
                `Выполнена команда apply: ${subcommand}`,
                {
                    userId: interaction.user.id,
                    guildId: guild.id,
                    subcommand,
                }
            );

            const settings =
                await getApplicationSettings(
                    interaction.client,
                    guild.id
                );

            if (!settings?.enabled) {
                throw createError(
                    'Заявки отключены',
                    ErrorTypes.CONFIGURATION,
                    'Система заявок в настоящее время отключена на этом сервере.',
                    {
                        guildId: guild.id,
                    }
                );
            }

            if (subcommand === 'submit') {
                await handleSubmit(
                    interaction,
                    settings
                );
            } else if (
                subcommand === 'status'
            ) {
                await handleStatus(
                    interaction
                );
            } else if (
                subcommand === 'list'
            ) {
                await handleList(
                    interaction
                );
            }
        },
        {
            type: 'command',
            commandName: 'apply',
        }
    ),
};


/**
 * Обработка отправки модального окна заявки.
 *
 * Custom ID:
 * app_modal_<roleId>
 */
export async function handleApplicationModal(
    interaction
) {
    if (!interaction.isModalSubmit()) {
        return;
    }

    const customId =
        interaction.customId;

    if (!customId.startsWith('app_modal_')) {
        return;
    }

    if (!interaction.inGuild()) {
        return await replyUserError(
            interaction,
            {
                type: ErrorTypes.UNKNOWN,
                message:
                    'Это взаимодействие можно использовать только на сервере.',
            }
        );
    }

    const roleId =
        customId.substring(
            'app_modal_'.length
        );

    if (!roleId) {
        return await replyUserError(
            interaction,
            {
                type: ErrorTypes.USER_INPUT,
                message:
                    'Не удалось определить роль заявки.',
            }
        );
    }

    try {
        const applicationRoles =
            await getApplicationRoles(
                interaction.client,
                interaction.guild.id
            );

        const applicationRole =
            applicationRoles.find(
                (appRole) =>
                    appRole.roleId === roleId
            );

        if (!applicationRole) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.CONFIGURATION,
                    message:
                        'Настройки этой заявки не найдены.',
                }
            );
        }

        if (applicationRole.enabled === false) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.USER_INPUT,
                    message:
                        'Эта заявка в данный момент отключена.',
                }
            );
        }

        const role =
            await interaction.guild.roles
                .fetch(roleId)
                .catch(() => null);

        if (!role) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.USER_INPUT,
                    message:
                        'Роль этой заявки больше не существует.',
                }
            );
        }

        /*
         * Получаем вопросы.
         *
         * Приоритет:
         * 1. Вопросы конкретной заявки
         * 2. Глобальные вопросы
         * 3. Стандартные вопросы
         */
        const settings =
            await getApplicationSettings(
                interaction.client,
                interaction.guild.id
            );

        let questions =
            settings?.questions?.length
                ? settings.questions
                : getDefaultApplicationQuestions();

        const roleSettings =
            await getApplicationRoleSettings(
                interaction.client,
                interaction.guild.id,
                roleId
            );

        if (
            roleSettings?.questions &&
            roleSettings.questions.length > 0
        ) {
            questions =
                roleSettings.questions;
        }

        /*
         * Получаем ответы пользователя.
         */
        const answers = [];

        for (
            let i = 0;
            i < questions.length;
            i++
        ) {
            const fieldId = `q${i}`;

            let answer = '';

            try {
                answer =
                    interaction.fields
                        .getTextInputValue(
                            fieldId
                        )
                        ?.trim() || '';
            } catch {
                answer = '';
            }

            answers.push({
                question: questions[i],
                answer,
            });
        }

        /*
         * Проверяем наличие уже существующей
         * заявки на рассмотрении.
         */
        const userApplications =
            await getUserApplications(
                interaction.client,
                interaction.guild.id,
                interaction.user.id
            );

        const pendingApplication =
            userApplications.find(
                (application) =>
                    application.status ===
                    'pending'
            );

        if (pendingApplication) {
            return await replyUserError(
                interaction,
                {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        'У вас уже есть заявка на рассмотрении. Пожалуйста, дождитесь её проверки.',
                }
            );
        }

        /*
         * Создаём заявку.
         */
        const application =
            await ApplicationService.submitApplication(
                interaction.client,
                {
                    guildId:
                        interaction.guild.id,

                    userId:
                        interaction.user.id,

                    roleId,

                    roleName:
                        applicationRole.name,

                    username:
                        interaction.user.tag,

                    avatar:
                        interaction.user.displayAvatarURL(),

                    answers,
                }
            );

        /*
         * Сообщение пользователю.
         */
        const embed = successEmbed(
            'Заявка отправлена',
            `Ваша заявка на роль **${applicationRole.name}** успешно отправлена!\n\n` +
                `**ID заявки:** \`${application.id}\`\n` +
                `Проверить статус можно с помощью команды \`/apply status id:${application.id}\`.`
        );

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [embed],
                flags: ['Ephemeral'],
            }
        );

        /*
         * Загружаем актуальные настройки.
         */
        const latestSettings =
            await getApplicationSettings(
                interaction.client,
                interaction.guild.id
            );

        const latestRoleSettings =
            await getApplicationRoleSettings(
                interaction.client,
                interaction.guild.id,
                roleId
            );

        const guildConfig =
            await getGuildConfig(
                interaction.client,
                interaction.guild.id
            );

        const logChannelId =
            resolveApplicationLogChannel(
                guildConfig,
                latestRoleSettings,
                latestSettings
            );

        /*
         * Отправляем заявку в канал логов.
         */
        if (logChannelId) {
            try {
                const logMessage =
                    await logEvent({
                        client:
                            interaction.client,

                        guildId:
                            interaction.guild.id,

                        eventType:
                            EVENT_TYPES.APPLICATION_SUBMIT,

                        channelId:
                            logChannelId,

                        data: {
                            title:
                                'Новая заявка',

                            lines: [
                                formatLogLine(
                                    'Пользователь',
                                    `<@${interaction.user.id}> (${interaction.user.tag})`
                                ),

                                formatLogLine(
                                    'Заявка',
                                    applicationRole.name
                                ),

                                formatLogLine(
                                    'Роль',
                                    role.name
                                ),

                                formatLogLine(
                                    'ID заявки',
                                    `\`${application.id}\``
                                ),
                            ],

                            inlineFields: [
                                {
                                    name:
                                        'Статус',

                                    value:
                                        '🟡 На рассмотрении',

                                    inline: true,
                                },
                            ],

                            author:
                                await resolveUserAuthor(
                                    interaction.client,
                                    interaction.user.id
                                ),
                        },
                    });

                /*
                 * Сохраняем ID сообщения логов.
                 */
                if (logMessage) {
                    await updateApplication(
                        interaction.client,
                        interaction.guild.id,
                        application.id,
                        {
                            logMessageId:
                                logMessage.id,

                            logChannelId,
                        }
                    );
                }
            } catch (error) {
                /*
                 * Ошибка логирования не должна
                 * отменять отправку заявки.
                 */
                logger.warn(
                    'Не удалось записать заявку в лог',
                    {
                        error:
                            error.message,

                        guildId:
                            interaction.guild.id,

                        applicationId:
                            application.id,

                        logChannelId,
                    }
                );
            }
        }
    } catch (error) {
        logger.error(
            'Ошибка при создании заявки',
            {
                error: error.message,

                userId:
                    interaction.user.id,

                guildId:
                    interaction.guild.id,

                roleId,

                stack: error.stack,
            }
        );

        await handleInteractionError(
            interaction,
            error,
            {
                type: 'modal',
                handler:
                    'application_submission',
            }
        );
    }
}


/**
 * /apply list
 */
async function handleList(
    interaction
) {
    try {
        const applicationRoles =
            await getApplicationRoles(
                interaction.client,
                interaction.guild.id
            );

        const enabledRoles =
            applicationRoles.filter(
                (appRole) =>
                    appRole.enabled !== false
            );

        if (enabledRoles.length === 0) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.USER_INPUT,

                    message:
                        'В данный момент нет доступных заявок.',
                }
            );
        }

        const embed = createEmbed({
            title:
                '📋 Доступные заявки',

            description:
                'Ниже представлены роли, на которые вы можете подать заявку:',
        });

        enabledRoles.forEach(
            (appRole, index) => {
                const role =
                    interaction.guild.roles.cache.get(
                        appRole.roleId
                    );

                embed.addFields({
                    name:
                        `${index + 1}. ${appRole.name}`,

                    value:
                        `**Роль:** ${
                            role
                                ? `<@&${appRole.roleId}>`
                                : 'Роль не найдена'
                        }\n` +
                        `**Подать заявку:** \`/apply submit application:${appRole.name}\``,

                    inline: false,
                });
            }
        );

        embed.setFooter({
            text:
                'Используйте /apply submit application:<название> для подачи заявки.',
        });

        return await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [embed],
            }
        );
    } catch (error) {
        logger.error(
            'Ошибка при получении списка заявок',
            {
                error: error.message,

                guildId:
                    interaction.guild.id,

                stack: error.stack,
            }
        );

        throw createError(
            'Не удалось загрузить заявки',
            ErrorTypes.DATABASE,
            'Не удалось загрузить список заявок. Пожалуйста, попробуйте позже.',
            {
                guildId:
                    interaction.guild.id,
            }
        );
    }
}


/**
 * /apply submit
 */
async function handleSubmit(
    interaction,
    settings
) {
    const applicationName =
        interaction.options.getString(
            'application'
        );

    if (!applicationName) {
        return await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,

                message:
                    'Пожалуйста, выберите заявку.',
            }
        );
    }

    const applicationRoles =
        await getApplicationRoles(
            interaction.client,
            interaction.guild.id
        );

    const applicationRole =
        applicationRoles.find(
            (appRole) =>
                appRole.enabled !== false &&
                appRole.name?.toLowerCase() ===
                    applicationName
                        .trim()
                        .toLowerCase()
        );

    if (!applicationRole) {
        return await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,

                message:
                    'Такая заявка не найдена. Используйте `/apply list`, чтобы посмотреть доступные заявки.',
            }
        );
    }

    /*
     * Проверяем активные заявки пользователя.
     */
    const userApplications =
        await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id
        );

    const pendingApplication =
        userApplications.find(
            (application) =>
                application.status ===
                'pending'
        );

    if (pendingApplication) {
        return await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.UNKNOWN,

                message:
                    'У вас уже есть заявка на рассмотрении. Пожалуйста, дождитесь её проверки.',
            }
        );
    }

    /*
     * Проверяем существование роли.
     */
    const role =
        await interaction.guild.roles
            .fetch(applicationRole.roleId)
            .catch(() => null);

    if (!role) {
        return await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,

                message:
                    'Роль, указанная для этой заявки, больше не существует.',
            }
        );
    }

    /*
     * Получаем вопросы.
     */
    let questions =
        settings?.questions?.length
            ? settings.questions
            : getDefaultApplicationQuestions();

    const roleSettings =
        await getApplicationRoleSettings(
            interaction.client,
            interaction.guild.id,
            applicationRole.roleId
        );

    if (
        roleSettings?.questions &&
        roleSettings.questions.length > 0
    ) {
        questions =
            roleSettings.questions;
    }

    if (
        !questions ||
        questions.length === 0
    ) {
        return await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.CONFIGURATION,

                message:
                    'Для этой заявки не настроены вопросы.',
            }
        );
    }

    /*
     * Discord позволяет максимум 5 компонентов
     * в одном модальном окне.
     */
    if (questions.length > 5) {
        questions =
            questions.slice(0, 5);
    }

    const modal =
        new ModalBuilder()
            .setCustomId(
                `app_modal_${applicationRole.roleId}`
            )
            .setTitle(
                `Заявка: ${applicationRole.name}`
            );

    questions.forEach(
        (question, index) => {
            const safeQuestion =
                String(question || '')
                    .trim() ||
                `Вопрос ${index + 1}`;

            const input =
                new TextInputBuilder()
                    .setCustomId(
                        `q${index}`
                    )

                    .setLabel(
                        safeQuestion.length > 45
                            ? `${safeQuestion.substring(0, 42)}...`
                            : safeQuestion
                    )

                    .setStyle(
                        TextInputStyle.Paragraph
                    )

                    .setRequired(true)

                    .setMaxLength(1000);

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        input
                    );

            modal.addComponents(row);
        }
    );

    await interaction.showModal(
        modal
    );
}


/**
 * /apply status
 */
async function handleStatus(
    interaction
) {
    const appId =
        interaction.options.getString(
            'id'
        );

    /*
     * Если указан ID конкретной заявки.
     */
    if (appId) {
        const application =
            await getApplication(
                interaction.client,
                interaction.guild.id,
                appId
            );

        if (
            !application ||
            application.userId !==
                interaction.user.id
        ) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.PERMISSION,

                    message:
                        'Заявка не найдена или у вас нет прав для её просмотра.',
                }
            );
        }

        const submittedAt =
            application?.createdAt
                ? new Date(
                      application.createdAt
                  )
                : null;

        const submittedAtDisplay =
            submittedAt &&
            !Number.isNaN(
                submittedAt.getTime()
            )
                ? submittedAt.toLocaleString(
                      'ru-RU'
                  )
                : 'Неизвестно';

        const statusView =
            getApplicationStatusPresentation(
                application.status
            );

        const embed = createEmbed({
            title:
                `Заявка #${application.id} — ` +
                `${application.roleName || 'Неизвестная роль'}`,

            description:
                `**ID заявки:** \`${application.id}\`\n` +
                `**Статус:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Подана:** ${submittedAtDisplay}`,
        });

        /*
         * Показываем причину решения,
         * если она сохранена в базе.
         */
        if (application.reason) {
            embed.addFields({
                name:
                    'Комментарий модератора',

                value:
                    application.reason ||
                    'Комментарий не указан.',

                inline: false,
            });
        }

        return await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [embed],
                flags: ['Ephemeral'],
            }
        );
    }

    /*
     * Показываем все заявки пользователя.
     */
    const applications =
        await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id
        );

    if (
        !applications ||
        applications.length === 0
    ) {
        return await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.UNKNOWN,

                message:
                    'Вы ещё не подавали заявок.',
            }
        );
    }

    const recentApplications =
        [...applications]
            .sort(
                (a, b) =>
                    new Date(
                        b.createdAt || 0
                    ) -
                    new Date(
                        a.createdAt || 0
                    )
            )
            .slice(0, 10);

    const embed = createEmbed({
        title:
            '📋 Мои заявки',

        description:
            `Показаны последние ${recentApplications.length} заявок.`,
    });

    recentApplications.forEach(
        (application) => {
            const submittedAt =
                application?.createdAt
                    ? new Date(
                          application.createdAt
                      )
                    : null;

            const submittedAtDisplay =
                submittedAt &&
                !Number.isNaN(
                    submittedAt.getTime()
                )
                    ? submittedAt.toLocaleDateString(
                          'ru-RU'
                      )
                    : 'Неизвестно';

            const statusView =
                getApplicationStatusPresentation(
                    application.status
                );

            embed.addFields({
                name:
                    `${statusView.statusEmoji} ` +
                    `${application.roleName || 'Неизвестная роль'} ` +
                    `(${statusView.statusLabel})`,

                value:
                    `**ID:** \`${application.id}\`\n` +
                    `**Статус:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                    `**Подана:** ${submittedAtDisplay}`,

                inline: true,
            });
        }
    );

    if (
        applications.length >
        recentApplications.length
    ) {
        embed.setFooter({
            text:
                `Показаны последние ${recentApplications.length} ` +
                `из ${applications.length} заявок.`,
        });
    }

    return await InteractionHelper.safeEditReply(
        interaction,
        {
            embeds: [embed],
            flags: ['Ephemeral'],
        }
    );
}
