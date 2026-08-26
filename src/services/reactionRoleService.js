// reactionRoleService.js

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { getReactionRoleKey, getReactionRolesPrefix } from '../utils/database/keys.js';

const MAX_ROLES_PER_MESSAGE = 25;

const DANGEROUS_PERMISSIONS = [
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageWebhooks',
    'BanMembers',
    'KickMembers'
];

function validateGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string' || !/^\d{17,19}$/.test(guildId)) {
        throw createError(
            `Недействительный ID сервера: ${guildId}`,
            ErrorTypes.VALIDATION,
            'Указан недействительный ID сервера.',
            { guildId }
        );
    }
}

function validateMessageId(messageId) {
    if (!messageId || typeof messageId !== 'string' || !/^\d{17,19}$/.test(messageId)) {
        throw createError(
            `Недействительный ID сообщения: ${messageId}`,
            ErrorTypes.VALIDATION,
            'Указан недействительный ID сообщения.',
            { messageId }
        );
    }
}

function validateRoleId(roleId) {
    if (!roleId || typeof roleId !== 'string' || !/^\d{17,19}$/.test(roleId)) {
        throw createError(
            `Недействительный ID роли: ${roleId}`,
            ErrorTypes.VALIDATION,
            'Указан недействительный ID роли.',
            { roleId }
        );
    }
}

export function hasDangerousPermissions(role) {
    if (!role || !role.permissions) return false;
    
    for (const permission of DANGEROUS_PERMISSIONS) {
        if (role.permissions.has(permission)) {
            return true;
        }
    }
    return false;
}

async function validateRoleSafety(client, guildId, roleId) {
    const guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId).catch(() => null);
    if (!guild) {
        throw createError(
            `Сервер не найден при проверке роли: ${guildId}`,
            ErrorTypes.VALIDATION,
            'Сервер не найден во время проверки ролей реакций.',
            { guildId, roleId }
        );
    }

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw createError(
            `Роль не найдена: ${roleId}`,
            ErrorTypes.VALIDATION,
            'Одна или несколько выбранных ролей больше не существуют.',
            { guildId, roleId }
        );
    }

    if (hasDangerousPermissions(role)) {
        throw createError(
            `Обнаружены опасные разрешения у роли: ${roleId}`,
            ErrorTypes.PERMISSION,
            'В целях безопасности роли с высоким уровнем привилегий нельзя назначать через роли реакций.',
            { guildId, roleId, roleName: role.name, dangerousPermissions: DANGEROUS_PERMISSIONS }
        );
    }

    const botHighestRole = guild.members.me?.roles?.highest;
    if (!botHighestRole || role.position >= botHighestRole.position) {
        throw createError(
            `Роль находится выше бота в иерархии: ${roleId}`,
            ErrorTypes.PERMISSION,
            'Я не могу назначить эту роль, потому что она находится на уровне моей высшей роли или выше неё.',
            { guildId, roleId, rolePosition: role.position, botRolePosition: botHighestRole?.position }
        );
    }
}

export async function getReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await client.db.get(key);
        return data || null;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка получения сообщения роли реакции ${messageId} на сервере ${guildId}:`, error);
        throw createError(
            'Ошибка базы данных при получении сообщения роли реакции',
            ErrorTypes.DATABASE,
            'Не удалось получить данные роли реакции. Пожалуйста, попробуйте ещё раз.',
            { guildId, messageId, originalError: error.message }
        );
    }
}

export async function createReactionRoleMessage(client, guildId, channelId, messageId, roleIds) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createError(
                `Недействительный ID канала: ${channelId}`,
                ErrorTypes.VALIDATION,
                'Указан недействительный ID канала.',
                { channelId }
            );
        }
        
        if (!Array.isArray(roleIds) || roleIds.length === 0) {
            throw createError(
                'Роли не указаны',
                ErrorTypes.VALIDATION,
                'Необходимо указать хотя бы одну роль.',
                { roleIds }
            );
        }
        
        if (roleIds.length > MAX_ROLES_PER_MESSAGE) {
            throw createError(
                `Слишком много ролей: ${roleIds.length}`,
                ErrorTypes.VALIDATION,
                `В одном сообщении с ролями реакций можно добавить не более ${MAX_ROLES_PER_MESSAGE} ролей.`,
                { roleIds, limit: MAX_ROLES_PER_MESSAGE }
            );
        }

        for (const roleId of roleIds) {
            validateRoleId(roleId);
            await validateRoleSafety(client, guildId, roleId);
        }
        
        const reactionRoleData = {
            guildId,
            channelId,
            messageId,
            roles: roleIds,
            createdAt: new Date().toISOString()
        };
        
        const key = getReactionRoleKey(guildId, messageId);
        await client.db.set(key, reactionRoleData);
        
        logger.info(`Создано сообщение ролей реакций ${messageId} на сервере ${guildId} с ${roleIds.length} ролями`);
        return reactionRoleData;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка создания сообщения роли реакции на сервере ${guildId}:`, error);
        throw createError(
            'Ошибка базы данных при создании сообщения роли реакции',
            ErrorTypes.DATABASE,
            'Не удалось сохранить данные роли реакции. Пожалуйста, попробуйте ещё раз.',
            { guildId, messageId, originalError: error.message }
        );
    }
}

export async function addReactionRole(client, guildId, messageId, emoji, roleId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        validateRoleId(roleId);
        await validateRoleSafety(client, guildId, roleId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.roles[emoji] = roleId;
        
        await client.db.set(key, data);
        logger.info(`Добавлена роль реакции для эмодзи ${emoji} в сообщение ${messageId} на сервере ${guildId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка добавления роли реакции на сервере ${guildId}:`, error);
        throw createError(
            'Ошибка базы данных при добавлении роли реакции',
            ErrorTypes.DATABASE,
            'Не удалось добавить роль реакции. Пожалуйста, попробуйте ещё раз.',
            { guildId, messageId, originalError: error.message }
        );
    }
}

export async function deleteReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data) {
            logger.debug(`Сообщение роли реакции ${messageId} не существует на сервере ${guildId}, удаление не требуется`);
            return true;
        }
        
        await client.db.delete(key);
        logger.info(`Удалено сообщение роли реакции ${messageId} на сервере ${guildId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка удаления сообщения роли реакции на сервере ${guildId}:`, error);
        throw createError(
            'Ошибка базы данных при удалении сообщения роли реакции',
            ErrorTypes.DATABASE,
            'Не удалось удалить сообщение роли реакции. Пожалуйста, попробуйте ещё раз.',
            { guildId, messageId, originalError: error.message }
        );
    }
}

export async function removeReactionRole(client, guildId, messageId, emoji) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data || !data.roles[emoji]) {
            return false;
        }

        delete data.roles[emoji];

        if (Object.keys(data.roles).length === 0) {
            await client.db.delete(key);
            logger.info(`Из сообщения ${messageId} удалена последняя роль реакции, данные сообщения удалены`);
        } else {
            await client.db.set(key, data);
            logger.info(`Роль реакции для эмодзи ${emoji} удалена из сообщения ${messageId}`);
        }
        
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка удаления роли реакции на сервере ${guildId}:`, error);
        throw createError(
            'Ошибка базы данных при удалении роли реакции',
            ErrorTypes.DATABASE,
            'Не удалось удалить роль реакции. Пожалуйста, попробуйте ещё раз.',
            { guildId, messageId, originalError: error.message }
        );
    }
}

export async function getAllReactionRoleMessages(client, guildId) {
    try {
        validateGuildId(guildId);
        
        const prefix = getReactionRolesPrefix(guildId);
        
        let keys;
        try {
            keys = await client.db.list(prefix);
            
            if (keys && typeof keys === 'object') {
                if (Array.isArray(keys)) {
                    
                } else if (keys.value && Array.isArray(keys.value)) {
                    keys = keys.value;
                } else {
                    const allKeys = await client.db.list();
                    
                    if (Array.isArray(allKeys)) {
                        keys = allKeys.filter(key => key.startsWith(prefix));
                    } else if (allKeys.value && Array.isArray(allKeys.value)) {
                        keys = allKeys.value.filter(key => key.startsWith(prefix));
                    } else {
                        return [];
                    }
                }
            } else {
                return [];
            }
        } catch (listError) {
            logger.error(`Ошибка получения ключей ролей реакций для сервера ${guildId}:`, listError);
            throw createError(
                'Ошибка базы данных при получении списка ролей реакций',
                ErrorTypes.DATABASE,
                'Не удалось получить список ролей реакций. Пожалуйста, попробуйте ещё раз.',
                { guildId, originalError: listError.message }
            );
        }
        
        if (!keys || keys.length === 0) {
            return [];
        }

        const messages = [];
        
        for (const key of keys) {
            try {
                const data = await client.db.get(key);
                
                if (data) {
                    let actualData;
                    if (data && data.ok && data.value) {
                        actualData = data.value;
                    } else if (data && data.value) {
                        actualData = data.value;
                    } else {
                        actualData = data;
                    }
                    
                    if (actualData && actualData.messageId && actualData.channelId) {
                        messages.push(actualData);
                    } else if (actualData) {
                        logger.warn(`Пропущены повреждённые данные роли реакции для сервера ${guildId}:`, actualData);
                    }
                }
            } catch (dataError) {
                logger.warn(`Ошибка получения данных для ключа роли реакции ${key}:`, dataError);
            }
        }

        return messages;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка получения всех сообщений ролей реакций для сервера ${guildId}:`, error);
        throw createError(
            'Ошибка базы данных при получении ролей реакций',
            ErrorTypes.DATABASE,
            'Не удалось получить сообщения ролей реакций. Пожалуйста, попробуйте ещё раз.',
            { guildId, originalError: error.message }
        );
    }
}

export async function setReactionRoleChannel(client, guildId, messageId, channelId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createError(
                `Недействительный ID канала: ${channelId}`,
                ErrorTypes.VALIDATION,
                'Указан недействительный ID канала.',
                { channelId }
            );
        }
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.channelId = channelId;
        await client.db.set(key, data);
        logger.info(`Установлен канал ${channelId} для сообщения роли реакции ${messageId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Ошибка установки канала для сообщения роли реакции ${messageId}:`, error);
        throw createError(
            'Ошибка базы данных при установке канала роли реакции',
            ErrorTypes.DATABASE,
            'Не удалось обновить канал роли реакции. Пожалуйста, попробуйте ещё раз.',
            { guildId, messageId, channelId, originalError: error.message }
        );
    }
}

export async function reconcileReactionRoleMessages(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        scannedMessages: 0,
        removedMessages: 0,
        errors: 0
    };

    try {
        const targetGuildIds = guildId
            ? [guildId]
            : Array.from(client.guilds.cache.keys());

        for (const targetGuildId of targetGuildIds) {
            summary.scannedGuilds += 1;

            let reactionRoleMessages = [];
            try {
                reactionRoleMessages = await getAllReactionRoleMessages(client, targetGuildId);
            } catch (error) {
                summary.errors += 1;
                logger.warn(
                    `Не удалось получить сообщения ролей реакций для проверки на сервере ${targetGuildId}:`,
                    error
                );
                continue;
            }

            if (!reactionRoleMessages.length) {
                continue;
            }

            const guild = client.guilds.cache.get(targetGuildId)
                || await client.guilds.fetch(targetGuildId).catch(() => null);

            if (!guild) {
                for (const reactionRoleMessage of reactionRoleMessages) {
                    summary.scannedMessages += 1;
                    await client.db.delete(
                        getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId)
                    );
                    summary.removedMessages += 1;
                }

                logger.info(
                    `Удалено ${reactionRoleMessages.length} устаревших сообщений ролей реакций для недоступного сервера ${targetGuildId}`
                );
                continue;
            }

            for (const reactionRoleMessage of reactionRoleMessages) {
                summary.scannedMessages += 1;

                try {
                    const channel = guild.channels.cache.get(reactionRoleMessage.channelId)
                        || await guild.channels.fetch(reactionRoleMessage.channelId).catch(() => null);

                    if (!channel || !channel.isTextBased?.()) {
                        await client.db.delete(
                            getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId)
                        );
                        summary.removedMessages += 1;
                        continue;
                    }

                    const message = await channel.messages
                        .fetch(reactionRoleMessage.messageId)
                        .catch(() => null);

                    if (!message) {
                        await client.db.delete(
                            getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId)
                        );
                        summary.removedMessages += 1;
                    }
                } catch (messageCheckError) {
                    summary.errors += 1;
                    logger.warn(
                        `Не удалось проверить сообщение роли реакции ${reactionRoleMessage.messageId} во время проверки:`,
                        messageCheckError
                    );
                }
            }
        }

        logger.info(
            `Проверка ролей реакций завершена: проверено ${summary.scannedMessages} сообщений на ${summary.scannedGuilds} серверах, удалено ${summary.removedMessages}, ошибок ${summary.errors}`
        );

        return summary;
    } catch (error) {
        logger.error('Непредвиденная ошибка во время проверки ролей реакций:', error);
        summary.errors += 1;
        return summary;
    }
}
