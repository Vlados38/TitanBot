// joinToCreateService.js

import {
    getJoinToCreateConfig,
    saveJoinToCreateConfig,
    updateJoinToCreateConfig,
    getTemporaryChannelInfo,
    formatChannelName as formatChannelNameUtil
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const CHANNEL_NAME_MAX_LENGTH = 100;
const CHANNEL_VARIABLE_MAX_LENGTH = 32;
const CONTROL_AND_INVISIBLE_CHARS_REGEX = /[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g;
const ALLOWED_TEMPLATE_PLACEHOLDERS = new Set([
    '{username}',
    '{user_tag}',
    '{displayName}',
    '{display_name}',
    '{guildName}',
    '{guild_name}',
    '{channelName}',
    '{channel_name}'
]);

export function validateChannelNameTemplate(template) {
    if (!template || typeof template !== 'string') {
        throw new TitanBotError(
            'Некорректный шаблон канала: должно быть непустое значение',
            ErrorTypes.VALIDATION,
            'Шаблон названия канала должен содержать корректный текст.'
        );
    }

    const normalizedTemplate = template.normalize('NFKC').replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '').trim();

    if (normalizedTemplate.length > CHANNEL_NAME_MAX_LENGTH) {
        throw new TitanBotError(
            'Шаблон названия канала превышает максимальную длину',
            ErrorTypes.VALIDATION,
            `Шаблон названия канала не может содержать более ${CHANNEL_NAME_MAX_LENGTH} символов.`
        );
    }

    if (/[@#:`]/.test(normalizedTemplate)) {
        throw new TitanBotError(
            'Шаблон названия канала содержит запрещённые символы',
            ErrorTypes.VALIDATION,
            'Шаблон названия канала не может содержать символы @, #, : или обратный апостроф.'
        );
    }

    const placeholders = normalizedTemplate.match(/\{[^}]+\}/g) || [];
    for (const placeholder of placeholders) {
        if (!ALLOWED_TEMPLATE_PLACEHOLDERS.has(placeholder)) {
            throw new TitanBotError(
                'Шаблон названия канала содержит неизвестные плейсхолдеры',
                ErrorTypes.VALIDATION,
                `Неизвестный плейсхолдер: ${placeholder}. Разрешённые плейсхолдеры: ${Array.from(ALLOWED_TEMPLATE_PLACEHOLDERS).join(', ')}`
            );
        }
    }

    return true;
}

export function validateBitrate(bitrate) {
    const bitrateNum = parseInt(bitrate);

    if (isNaN(bitrateNum)) {
        throw new TitanBotError(
            'Битрейт должен быть корректным числом',
            ErrorTypes.VALIDATION,
            'Пожалуйста, введите корректное значение битрейта.'
        );
    }

    if (bitrateNum < 8 || bitrateNum > 384) {
        throw new TitanBotError(
            'Битрейт находится вне допустимого диапазона',
            ErrorTypes.VALIDATION,
            'Битрейт должен быть от 8 до 384 кбит/с.'
        );
    }

    return true;
}

export function validateUserLimit(limit) {
    const limitNum = parseInt(limit);

    if (isNaN(limitNum)) {
        throw new TitanBotError(
            'Лимит пользователей должен быть корректным числом',
            ErrorTypes.VALIDATION,
            'Пожалуйста, введите корректное значение лимита пользователей.'
        );
    }

    if (limitNum < 0 || limitNum > 99) {
        throw new TitanBotError(
            'Лимит пользователей находится вне допустимого диапазона',
            ErrorTypes.VALIDATION,
            'Лимит пользователей должен быть от 0 (без ограничений) до 99.'
        );
    }

    return true;
}

export function formatChannelName(template, variables) {
    try {
        const safeTemplate = template.normalize('NFKC').replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '').trim();
        validateChannelNameTemplate(safeTemplate);

        if (!variables || typeof variables !== 'object') {
            throw new TitanBotError(
                'Некорректный объект переменных для форматирования названия канала',
                ErrorTypes.VALIDATION
            );
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(variables)) {
            if (value === null || value === undefined) {
                sanitized[key] = 'Неизвестно';
            } else {
                sanitized[key] = String(value)
                    .normalize('NFKC')
                    .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
                    .replace(/[@#:`\n\r\t]/g, '')
                    .trim()
                    .substring(0, CHANNEL_VARIABLE_MAX_LENGTH);
            }
        }

        const replacements = {
            '{username}': sanitized.username || 'Пользователь',
            '{user_tag}': sanitized.userTag || 'Пользователь#0000',
            '{displayName}': sanitized.displayName || 'Пользователь',
            '{display_name}': sanitized.displayName || 'Пользователь',
            '{guildName}': sanitized.guildName || 'Сервер',
            '{guild_name}': sanitized.guildName || 'Сервер',
            '{channelName}': sanitized.channelName || 'Голосовой канал',
            '{channel_name}': sanitized.channelName || 'Голосовой канал',
        };

        let formatted = safeTemplate;
        for (const [placeholder, value] of Object.entries(replacements)) {
            formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }

        formatted = formatted
            .normalize('NFKC')
            .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
            .replace(/[@#:`\n\r\t]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (formatted.length === 0) {
            formatted = 'Голосовой канал';
        } else if (formatted.length > CHANNEL_NAME_MAX_LENGTH) {
            formatted = formatted.substring(0, CHANNEL_NAME_MAX_LENGTH);
        }

        logger.debug(`Сформировано название канала: "${formatted}" из шаблона "${template}"`);
        return formatted;

    } catch (error) {
        logger.error('Ошибка при форматировании названия канала:', error);
        throw error;
    }
}

export async function initializeJoinToCreate(client, guildId, channelId, options = {}) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Сервис базы данных недоступен',
                ErrorTypes.DATABASE,
                'Произошла системная ошибка. Пожалуйста, попробуйте ещё раз.'
            );
        }

        if (!guildId || !channelId) {
            throw new TitanBotError(
                'Отсутствует обязательный ID сервера или канала',
                ErrorTypes.VALIDATION,
                'Предоставлена некорректная информация о сервере или канале.'
            );
        }

        if (options.nameTemplate) {
            validateChannelNameTemplate(options.nameTemplate);
        }
        if (options.bitrate) {
            validateBitrate(options.bitrate / 1000);
        }
        if (options.userLimit !== undefined) {
            validateUserLimit(options.userLimit);
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Канал уже настроен как триггер Join to Create',
                ErrorTypes.VALIDATION,
                'Этот канал уже настроен как триггер Join to Create.'
            );
        }

        if (Array.isArray(config.triggerChannels) && config.triggerChannels.length > 0) {
            throw new TitanBotError(
                'На сервере уже настроен триггер Join to Create',
                ErrorTypes.VALIDATION,
                'На этом сервере уже настроен канал Join to Create. Используйте `/jointocreate dashboard`, чтобы изменить его, или удалите существующий канал перед созданием нового.',
                {
                    guildId,
                    existingTriggerChannelId: config.triggerChannels[0],
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        config.triggerChannels.push(channelId);
        config.enabled = true;

        if (Object.keys(options).length > 0) {
            if (!config.channelOptions) {
                config.channelOptions = {};
            }
            config.channelOptions[channelId] = {
                nameTemplate: options.nameTemplate || config.channelNameTemplate,
                userLimit: options.userLimit !== undefined ? options.userLimit : config.userLimit,
                bitrate: options.bitrate || config.bitrate,
                categoryId: options.categoryId || null,
                createdAt: Date.now()
            };
        }

        const saveResult = await saveJoinToCreateConfig(client, guildId, config);
        if (!saveResult) {
            throw new TitanBotError(
                'Не удалось сохранить конфигурацию Join to Create',
                ErrorTypes.DATABASE,
                'Не удалось настроить систему Join to Create. Пожалуйста, попробуйте ещё раз.'
            );
        }

        logger.info(`Инициализирован Join to Create для сервера ${guildId} с каналом-триггером ${channelId}`);

        return config;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Не удалось инициализировать Join to Create: ${error.message}`,
            ErrorTypes.DATABASE,
            'Не удалось настроить систему Join to Create.'
        );
    }
}

export async function updateChannelConfig(client, guildId, channelId, updates) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Сервис базы данных недоступен',
                ErrorTypes.DATABASE,
                'Сервис базы данных сейчас недоступен. Пожалуйста, попробуйте позже.'
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (!config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Канал не настроен как триггер Join to Create',
                ErrorTypes.VALIDATION,
                'Этот канал не настроен как триггер Join to Create.'
            );
        }

        if (updates.nameTemplate) {
            validateChannelNameTemplate(updates.nameTemplate);
        }
        if (updates.bitrate !== undefined) {
            validateBitrate(updates.bitrate / 1000);
        }
        if (updates.userLimit !== undefined) {
            validateUserLimit(updates.userLimit);
        }

        if (!config.channelOptions) {
            config.channelOptions = {};
        }

        config.channelOptions[channelId] = {
            ...config.channelOptions[channelId],
            ...updates,
            updatedAt: Date.now()
        };

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Обновлена конфигурация Join to Create для канала ${channelId} на сервере ${guildId}`, {
            updates: Object.keys(updates)
        });

        return config.channelOptions[channelId];

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Не удалось обновить конфигурацию канала: ${error.message}`,
            ErrorTypes.DATABASE,
            'Не удалось обновить конфигурацию.'
        );
    }
}

export async function removeTriggerChannel(client, guildId, channelId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Сервис базы данных недоступен',
                ErrorTypes.DATABASE,
                'Сервис базы данных сейчас недоступен. Пожалуйста, попробуйте позже.'
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        const index = config.triggerChannels.indexOf(channelId);
        if (index === -1) {
            throw new TitanBotError(
                'Канал не найден среди триггеров Join to Create',
                ErrorTypes.VALIDATION,
                'Этот канал не настроен как триггер Join to Create.'
            );
        }

        config.triggerChannels.splice(index, 1);
        config.enabled = config.triggerChannels.length > 0;

        if (config.channelOptions && config.channelOptions[channelId]) {
            delete config.channelOptions[channelId];
        }

        if (config.temporaryChannels) {
            for (const [tempChannelId, tempInfo] of Object.entries(config.temporaryChannels)) {
                if (tempInfo.triggerChannelId === channelId) {
                    delete config.temporaryChannels[tempChannelId];
                }
            }
        }

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Удалён канал-триггер Join to Create ${channelId} с сервера ${guildId}`);

        return true;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Не удалось удалить канал-триггер: ${error.message}`,
            ErrorTypes.DATABASE,
            'Не удалось удалить канал-триггер.'
        );
    }
}

export async function getConfiguration(client, guildId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Сервис базы данных недоступен',
                ErrorTypes.DATABASE,
                'Сервис базы данных сейчас недоступен. Пожалуйста, попробуйте позже.'
            );
        }

        return await getJoinToCreateConfig(client, guildId);

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Не удалось получить конфигурацию: ${error.message}`,
            ErrorTypes.DATABASE,
            'Не удалось получить настройки.'
        );
    }
}

export async function isTriggerChannel(client, guildId, channelId) {
    try {
        const config = await getConfiguration(client, guildId);
        return config.triggerChannels.includes(channelId);
    } catch (error) {
        logger.error(`Ошибка при проверке канала-триггера: ${error.message}`);
        return false;
    }
}

export async function getChannelConfiguration(client, guildId, channelId) {
    try {
        const config = await getConfiguration(client, guildId);

        if (!config.triggerChannels || !Array.isArray(config.triggerChannels) || !config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Канал не является корректным триггером Join to Create',
                ErrorTypes.VALIDATION,
                'Этот канал не настроен как триггер Join to Create.'
            );
        }

        return {
            ...config,
            channelConfig: config.channelOptions?.[channelId] || {}
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Не удалось получить конфигурацию канала: ${error.message}`,
            ErrorTypes.DATABASE,
            'Не удалось получить конфигурацию канала. Пожалуйста, попробуйте ещё раз.'
        );
    }
}

export function hasManageGuildPermission(member) {
    try {
        if (!member || !member.permissions) {
            return false;
        }
        return member.permissions.has(PermissionFlagsBits.ManageGuild);
    } catch (error) {
        logger.error('Ошибка при проверке разрешения ManageGuild:', error);
        return false;
    }
}

export async function logConfigurationChange(client, guildId, userId, action, details) {
    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.COUNTER_CONFIG,
            data: {
                title: 'Обновлён Join to Create',
                lines: [
                    formatLogLine('Действие', action),
                    formatLogLine('Подробности', typeof details === 'string' ? details : JSON.stringify(details)),
                ],
                userId,
            },
        });
    } catch (error) {
        logger.warn(`Не удалось записать изменение конфигурации Join to Create в журнал: ${error.message}`);
    }
}

export async function createTemporaryChannel(guild, member, options = {}) {
    try {
        if (!guild || !member) {
            throw new TitanBotError(
                'Некорректный сервер или участник',
                ErrorTypes.VALIDATION
            );
        }

        const {
            nameTemplate,
            userLimit,
            bitrate,
            parentId
        } = options;

        if (nameTemplate) {
            validateChannelNameTemplate(nameTemplate);
        }
        if (userLimit !== undefined) {
            validateUserLimit(userLimit);
        }
        if (bitrate !== undefined) {
            validateBitrate(bitrate / 1000);
        }

        const channelName = formatChannelName(nameTemplate || '{username}\'s Room', {
            username: member.user.username,
            displayName: member.displayName,
            userTag: member.user.tag,
            guildName: guild.name
        });

        const tempChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentId,
            userLimit: userLimit === 0 ? undefined : userLimit,
            bitrate: bitrate || 64000,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.MoveMembers]
                },
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                }
            ]
        });

        logger.info(`Создан временный голосовой канал ${tempChannel.name} (${tempChannel.id}) для пользователя ${member.user.tag}`);

        return {
            id: tempChannel.id,
            name: tempChannel.name,
            ownerId: member.id
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Не удалось создать временный канал: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Не удалось создать ваш временный голосовой канал. Пожалуйста, обратитесь к администратору.'
        );
    }
}

export default {
    validateChannelNameTemplate,
    validateBitrate,
    validateUserLimit,
    formatChannelName,
    initializeJoinToCreate,
    updateChannelConfig,
    removeTriggerChannel,
    getConfiguration,
    isTriggerChannel,
    getChannelConfiguration,
    hasManageGuildPermission,
    logConfigurationChange,
    createTemporaryChannel
};
