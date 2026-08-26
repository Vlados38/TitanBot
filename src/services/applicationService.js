// applicationService.js

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { PermissionFlagsBits } from 'discord.js';
import { sanitizeInput, sanitizeMarkdown } from '../utils/validation.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplication,
    getApplications,
    createApplication,
    updateApplication,
    getUserApplications,
    getApplicationRoles,
    saveApplicationRoles
} from '../utils/database.js';
import botConfig from '../config/bot.js';

const applicationCooldowns = new Map();
const APPLICATION_SUBMIT_COOLDOWN = (botConfig.applications?.applicationCooldown ?? 24) * 60 * 60 * 1000;

class ApplicationService {

    // Очищает и ограничивает текст заявки по длине
    static sanitizeApplicationText(value, maxLength) {
        return sanitizeMarkdown(sanitizeInput(String(value ?? ''), maxLength));
    }

    // Проверяет данные перед отправкой заявки
    static validateApplicationSubmission(data) {
        if (!data.guildId || !data.userId || !data.roleId) {
            throw createError(
                'Отсутствуют обязательные поля для отправки заявки',
                ErrorTypes.VALIDATION,
                'Некорректные данные заявки. Пожалуйста, попробуйте ещё раз.',
                { data }
            );
        }

        if (!data.answers || !Array.isArray(data.answers) || data.answers.length === 0) {
            throw createError(
                'В заявке должны быть ответы',
                ErrorTypes.VALIDATION,
                'Вы должны ответить на все вопросы заявки.',
                { data }
            );
        }

        for (const answer of data.answers) {
            const sanitizedQuestion = this.sanitizeApplicationText(answer.question, 200);
            const sanitizedAnswer = this.sanitizeApplicationText(answer.answer, 1000);

            if (!sanitizedQuestion || !sanitizedAnswer) {
                throw createError(
                    'Некорректный формат ответа',
                    ErrorTypes.VALIDATION,
                    'На все вопросы должны быть даны ответы.',
                    { answer }
                );
            }

            if (sanitizedAnswer.length > 1000) {
                throw createError(
                    'Ответ слишком длинный',
                    ErrorTypes.VALIDATION,
                    'Каждый ответ должен содержать менее 1000 символов.',
                    { length: sanitizedAnswer.length }
                );
            }

            if (sanitizedAnswer.trim().length < 10) {
                throw createError(
                    'Ответ слишком короткий',
                    ErrorTypes.VALIDATION,
                    'Пожалуйста, напишите содержательные ответы (не менее 10 символов).',
                    { length: sanitizedAnswer.length }
                );
            }
        }

        return true;
    }

    // Проверяет задержку между отправками заявок
    static checkApplicationCooldown(userId) {
        const now = Date.now();
        const cooldownKey = `submit_${userId}`;
        const lastSubmit = applicationCooldowns.get(cooldownKey);

        if (lastSubmit && now - lastSubmit < APPLICATION_SUBMIT_COOLDOWN) {
            const remainingTime = Math.ceil((APPLICATION_SUBMIT_COOLDOWN - (now - lastSubmit)) / 1000);

            throw createError(
                'Отправка заявки временно недоступна',
                ErrorTypes.RATE_LIMIT,
                `Пожалуйста, подождите ${Math.ceil(remainingTime / 60)} мин. перед отправкой следующей заявки.`,
                { remainingTime, userId }
            );
        }

        applicationCooldowns.set(cooldownKey, now);
        return true;
    }

    // Проверяет, есть ли у пользователя права на управление заявками
    static async checkManagerPermission(client, guildId, member) {
        const settings = await getApplicationSettings(client, guildId);

        const isManager =
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            (settings.managerRoles &&
             settings.managerRoles.some(roleId => member.roles.cache.has(roleId)));

        if (!isManager) {
            throw createError(
                'У пользователя нет прав на управление заявками',
                ErrorTypes.PERMISSION,
                'У вас нет прав на управление заявками.',
                { userId: member.id, guildId }
            );
        }

        return true;
    }

    // Отправляет новую заявку
    static async submitApplication(client, data) {
        try {

            this.validateApplicationSubmission(data);

            this.checkApplicationCooldown(data.userId);

            const settings = await getApplicationSettings(client, data.guildId);

            if (!settings.enabled) {
                throw createError(
                    'Заявки отключены',
                    ErrorTypes.CONFIGURATION,
                    'Заявки в настоящее время отключены на этом сервере.',
                    { guildId: data.guildId }
                );
            }

            const userApps = await getUserApplications(client, data.guildId, data.userId);
            const pendingApp = userApps.find(app => app.status === 'pending');

            if (pendingApp) {
                throw createError(
                    'У пользователя уже есть активная заявка',
                    ErrorTypes.VALIDATION,
                    'У вас уже есть заявка на рассмотрении. Пожалуйста, дождитесь её проверки.',
                    { userId: data.userId, pendingAppId: pendingApp.id }
                );
            }

            const sanitizedData = {
                ...data,
                answers: data.answers.map(answer => ({
                    question: this.sanitizeApplicationText(answer.question, 200),
                    answer: this.sanitizeApplicationText(answer.answer, 1000)
                }))
            };

            const application = await createApplication(client, sanitizedData);

            logger.info('Заявка отправлена', {
                applicationId: application.id,
                userId: data.userId,
                guildId: data.guildId,
                roleId: data.roleId,
                roleName: data.roleName
            });

            return application;
        } catch (error) {
            logger.error('Ошибка при отправке заявки', {
                error: error.message,
                userId: data.userId,
                guildId: data.guildId,
                stack: error.stack
            });

            throw error;
        }
    }

    // Проверяет заявку и принимает или отклоняет её
    static async reviewApplication(client, guildId, applicationId, reviewData) {
        try {
            const { action, reason, reviewerId } = reviewData;

            if (!['approve', 'deny'].includes(action)) {
                throw createError(
                    'Некорректное действие при проверке',
                    ErrorTypes.VALIDATION,
                    'Действие при проверке должно быть либо approve, либо deny.',
                    { action }
                );
            }

            const application = await getApplication(client, guildId, applicationId);

            if (!application) {
                throw createError(
                    'Заявка не найдена',
                    ErrorTypes.CONFIGURATION,
                    'Заявка, которую вы пытаетесь проверить, не существует.',
                    { applicationId, guildId }
                );
            }

            if (application.status !== 'pending') {
                throw createError(
                    'Заявка уже обработана',
                    ErrorTypes.VALIDATION,
                    'Эта заявка уже была проверена.',
                    { applicationId, status: application.status }
                );
            }

            const status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = reason
                ? reason.trim().substring(0, 500)
                : 'Причина не указана.';

            const updatedApplication = await updateApplication(
                client,
                guildId,
                applicationId,
                {
                    status,
                    reviewer: reviewerId,
                    reviewMessage: sanitizedReason,
                    reviewedAt: new Date().toISOString()
                }
            );

            logger.info('Заявка проверена', {
                applicationId,
                guildId,
                status,
                reviewerId,
                userId: application.userId
            });

            return updatedApplication;
        } catch (error) {
            logger.error('Ошибка при проверке заявки', {
                error: error.message,
                applicationId,
                guildId,
                stack: error.stack
            });

            throw error;
        }
    }

    // Получает список заявок
    static async getApplicationsList(client, guildId, filters = {}) {
        try {
            const applications = await getApplications(client, guildId, filters);

            logger.debug('Заявки получены', {
                guildId,
                count: applications.length,
                filters
            });

            return applications;
        } catch (error) {
            logger.error('Ошибка при получении списка заявок', {
                error: error.message,
                guildId,
                filters,
                stack: error.stack
            });

            throw createError(
                'Не удалось получить заявки',
                ErrorTypes.DATABASE,
                'Произошла ошибка при получении заявок.',
                { guildId, filters }
            );
        }
    }

    // Обновляет настройки системы заявок
    static async updateSettings(client, guildId, updates) {
        try {

            if (updates.logChannelId && typeof updates.logChannelId !== 'string') {
                throw createError(
                    'Некорректный ID канала для логов',
                    ErrorTypes.VALIDATION,
                    'Указан некорректный ID канала.',
                    { logChannelId: updates.logChannelId }
                );
            }

            if (updates.managerRoles && !Array.isArray(updates.managerRoles)) {
                throw createError(
                    'Некорректный формат ролей менеджеров',
                    ErrorTypes.VALIDATION,
                    'Роли менеджеров должны быть указаны в виде массива.',
                    { managerRoles: updates.managerRoles }
                );
            }

            if (updates.questions) {
                if (!Array.isArray(updates.questions) || updates.questions.length === 0) {
                    throw createError(
                        'Некорректный формат вопросов',
                        ErrorTypes.VALIDATION,
                        'Вопросы должны быть указаны в виде непустого массива.',
                        { questions: updates.questions }
                    );
                }

                updates.questions = updates.questions.map(q =>
                    typeof q === 'string'
                        ? q.trim().substring(0, 100)
                        : q
                );
            }

            await saveApplicationSettings(client, guildId, updates);
            const updatedSettings = await getApplicationSettings(client, guildId);

            logger.info('Настройки заявок обновлены', {
                guildId,
                updates: Object.keys(updates)
            });

            return updatedSettings;
        } catch (error) {
            logger.error('Ошибка при обновлении настроек заявок', {
                error: error.message,
                guildId,
                updates,
                stack: error.stack
            });

            throw error;
        }
    }

    // Управляет ролями, связанными с заявками
    static async manageApplicationRoles(client, guildId, data) {
        try {
            const { action, roleId, name } = data;

            const currentRoles = await getApplicationRoles(client, guildId);

            if (action === 'add') {
                if (!roleId) {
                    throw createError(
                        'Отсутствует ID роли',
                        ErrorTypes.VALIDATION,
                        'Вы должны указать роль для добавления.',
                        { action }
                    );
                }

                if (currentRoles.some(appRole => appRole.roleId === roleId)) {
                    throw createError(
                        'Роль уже настроена',
                        ErrorTypes.VALIDATION,
                        'Эта роль уже настроена для системы заявок.',
                        { roleId }
                    );
                }

                currentRoles.push({
                    roleId,
                    name: name
                        ? name.trim().substring(0, 50)
                        : 'Роль для заявок'
                });

                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Роль для заявок добавлена', {
                    guildId,
                    roleId,
                    name
                });
            } else if (action === 'remove') {
                if (!roleId) {
                    throw createError(
                        'Отсутствует ID роли',
                        ErrorTypes.VALIDATION,
                        'Вы должны указать роль для удаления.',
                        { action }
                    );
                }

                const roleIndex = currentRoles.findIndex(
                    appRole => appRole.roleId === roleId
                );

                if (roleIndex === -1) {
                    throw createError(
                        'Роль не настроена',
                        ErrorTypes.VALIDATION,
                        'Эта роль не настроена для системы заявок.',
                        { roleId }
                    );
                }

                currentRoles.splice(roleIndex, 1);
                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Роль для заявок удалена', {
                    guildId,
                    roleId
                });
            }

            return currentRoles;
        } catch (error) {
            logger.error('Ошибка при управлении ролями заявок', {
                error: error.message,
                guildId,
                data,
                stack: error.stack
            });

            throw error;
        }
    }

    // Получает заявки конкретного пользователя
    static async getUserApplications(client, guildId, userId) {
        try {
            const applications = await getUserApplications(client, guildId, userId);

            logger.debug('Заявки пользователя получены', {
                guildId,
                userId,
                count: applications.length
            });

            return applications;
        } catch (error) {
            logger.error('Ошибка при получении заявок пользователя', {
                error: error.message,
                guildId,
                userId,
                stack: error.stack
            });

            throw createError(
                'Не удалось получить ваши заявки',
                ErrorTypes.DATABASE,
                'Произошла ошибка при получении ваших заявок.',
                { guildId, userId }
            );
        }
    }

    // Получает одну конкретную заявку
    static async getSingleApplication(client, guildId, applicationId) {
        try {
            const application = await getApplication(
                client,
                guildId,
                applicationId
            );

            if (!application) {
                throw createError(
                    'Заявка не найдена',
                    ErrorTypes.CONFIGURATION,
                    'Заявка, которую вы ищете, не существует.',
                    { applicationId, guildId }
                );
            }

            return application;
        } catch (error) {
            logger.error('Ошибка при получении заявки', {
                error: error.message,
                applicationId,
                guildId,
                stack: error.stack
            });

            throw error;
        }
    }
}

export default ApplicationService;
