// verificationService.js

import { PermissionFlagsBits } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { insertVerificationAudit } from '../utils/database.js';
import { ensureTypedServiceError } from '../utils/serviceErrorBoundary.js';

const verificationCooldowns = new Map();
const attemptTracker = new Map();

const verificationDefaults = botConfig?.verification || {};
const autoVerifyDefaults = verificationDefaults.autoVerify || {};
const minAutoVerifyAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAutoVerifyAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const serverSizeThreshold = autoVerifyDefaults.serverSizeThreshold ?? 1000;
const defaultCooldownMs = verificationDefaults.verificationCooldown ?? 5000;
const defaultMaxAttempts = verificationDefaults.maxVerificationAttempts ?? 3;
const defaultAttemptWindowMs = verificationDefaults.attemptWindow ?? 60000;
const maxCooldownEntries = verificationDefaults.maxCooldownEntries ?? 10000;
const maxAttemptEntries = verificationDefaults.maxAttemptEntries ?? 10000;
const cooldownCleanupIntervalMs = verificationDefaults.cooldownCleanupInterval ?? 300000;
const maxAuditMetadataBytes = verificationDefaults.maxAuditMetadataBytes ?? 4096;
const shouldSendAutoVerifyDm = autoVerifyDefaults.sendDMNotification ?? true;
const shouldLogVerifications = verificationDefaults.logAllVerifications ?? true;
const shouldKeepAuditTrail = verificationDefaults.keepAuditTrail ?? false;
let lastCleanupAt = 0;

export async function verifyUser(client, guildId, userId, options = {}) {
    const { source = 'manual', moderatorId = null } = options;
    
    try {
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                `Сервер ${guildId} не найден`,
                ErrorTypes.CONFIGURATION,
                "Сервер не найден в кэше бота.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw createError(
                `Участник ${userId} не найден на сервере`,
                ErrorTypes.USER_INPUT,
                "Пользователь не находится на этом сервере.",
                { userId, guildId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw createError(
                "Система верификации отключена",
                ErrorTypes.CONFIGURATION,
                "Система верификации не включена на этом сервере.",
                { guildId }
            );
        }

        await validateVerificationSetup(guild, guildConfig.verification);

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        const canAssignRole = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssignRole) {
            throw createError(
                'Бот не может выдать роль верифицированного пользователя',
                ErrorTypes.PERMISSION,
                "Я не могу выдать роль верифицированного пользователя. Проверьте моё право **Управление ролями** и иерархию ролей.",
                { guildId, roleId: verifiedRole.id }
            );
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                status: 'already_verified',
                userId,
                roleId: verifiedRole.id,
                roleName: verifiedRole.name,
            };
        }

        await checkVerificationCooldown(userId, guildId, defaultCooldownMs);
        await trackVerificationAttempt(userId, guildId, defaultMaxAttempts, defaultAttemptWindowMs);

        await member.roles.add(verifiedRole.id, `Пользователь верифицирован (${source})`);

        logVerificationAction(client, guildId, userId, 'verified', {
            source,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            moderatorId
        });

        logger.info('Пользователь успешно верифицирован', {
            guildId,
            userId,
            roleId: verifiedRole.id,
            source,
            moderatorId
        });

        return {
            status: 'verified',
            userId,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'verifyUser',
            type: ErrorTypes.UNKNOWN,
            message: 'Операция верификации завершилась ошибкой: verifyUser',
            userMessage: 'Не удалось выполнить верификацию. Попробуйте ещё раз через некоторое время.',
            context: { guildId, userId, source: options.source }
        });
        logger.error('Ошибка при верификации пользователя', {
            guildId,
            userId,
            source: options.source,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        throw typedError;
    }
}

function pruneVerificationTrackers(now = Date.now()) {
    if (now - lastCleanupAt < cooldownCleanupIntervalMs) {
        return;
    }

    lastCleanupAt = now;

    for (const [key, timestamp] of verificationCooldowns.entries()) {
        if (now - timestamp > Math.max(defaultCooldownMs * 2, 60000)) {
            verificationCooldowns.delete(key);
        }
    }

    for (const [key, attempts] of attemptTracker.entries()) {
        const recentAttempts = (attempts || []).filter(ts => now - ts < defaultAttemptWindowMs);
        if (recentAttempts.length === 0) {
            attemptTracker.delete(key);
            continue;
        }
        attemptTracker.set(key, recentAttempts);
    }

    while (verificationCooldowns.size > maxCooldownEntries) {
        const firstKey = verificationCooldowns.keys().next().value;
        if (!firstKey) {
            break;
        }
        verificationCooldowns.delete(firstKey);
    }

    while (attemptTracker.size > maxAttemptEntries) {
        const firstKey = attemptTracker.keys().next().value;
        if (!firstKey) {
            break;
        }
        attemptTracker.delete(firstKey);
    }
}

export async function autoVerifyOnJoin(client, guild, member, verificationConfig) {
    try {
        
        if (!verificationConfig.autoVerify?.enabled) {
            return {
                autoVerified: false,
                reason: 'auto_verify_disabled'
            };
        }

        const autoVerifyRoleId = verificationConfig.autoVerify?.roleId || verificationConfig.roleId;
        if (!autoVerifyRoleId) {
            return {
                autoVerified: false,
                reason: 'auto_verify_role_not_configured'
            };
        }

        const effectiveVerificationConfig = {
            ...verificationConfig,
            roleId: autoVerifyRoleId
        };

        await validateVerificationSetup(guild, effectiveVerificationConfig);

        const shouldVerify = evaluateAutoVerifyCriteria(
            member,
            verificationConfig.autoVerify
        );

        if (!shouldVerify) {
            return {
                autoVerified: false,
                reason: 'criteria_not_met',
                criteria: verificationConfig.autoVerify.criteria
            };
        }

        const verifiedRole = guild.roles.cache.get(autoVerifyRoleId);

        const canAssign = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssign) {
            logger.warn('Невозможно выполнить автоматическую верификацию: бот не может выдать роль', {
                guildId: guild.id,
                userId: member.id,
                roleId: verifiedRole.id
            });
            return {
                autoVerified: false,
                reason: 'bot_cannot_assign_role'
            };
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                autoVerified: false,
                reason: 'already_verified',
                alreadyHasRole: true
            };
        }

        await member.roles.add(verifiedRole.id, 'Автоматическая верификация при входе');

        logVerificationAction(client, guild.id, member.id, 'auto_verified', {
            criteria: verificationConfig.autoVerify.criteria,
            accountAge: Date.now() - member.user.createdTimestamp,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('Пользователь автоматически верифицирован при входе', {
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            criteria: verificationConfig.autoVerify.criteria,
            accountAge: Date.now() - member.user.createdTimestamp
        });

        if (shouldSendAutoVerifyDm) {
            await sendAutoVerifyNotification(member, verifiedRole, guild);
        }

        return {
            autoVerified: true,
            userId: member.id,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            criteria: verificationConfig.autoVerify.criteria
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'autoVerifyOnJoin',
            type: ErrorTypes.UNKNOWN,
            message: 'Операция верификации завершилась ошибкой: autoVerifyOnJoin',
            userMessage: 'Не удалось выполнить автоматическую верификацию. Пожалуйста, выполните верификацию вручную.',
            context: { guildId: guild.id, userId: member.id }
        });
        logger.error('Ошибка автоматической верификации при входе', {
            guildId: guild.id,
            userId: member.id,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        
        return {
            autoVerified: false,
            reason: 'auto_verify_error',
            error: typedError.userMessage || typedError.message,
            errorCode: typedError.context?.errorCode
        };
    }
}

export async function removeVerification(client, guildId, userId, options = {}) {
    const { moderatorId = null, reason = 'admin_removal' } = options;
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                `Сервер ${guildId} не найден`,
                ErrorTypes.CONFIGURATION,
                "Сервер не найден.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw createError(
                `Участник ${userId} не найден`,
                ErrorTypes.USER_INPUT,
                "Пользователь не находится на этом сервере.",
                { userId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw createError(
                "Система верификации отключена",
                ErrorTypes.CONFIGURATION,
                "Система верификации не включена.",
                { guildId }
            );
        }

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        if (!verifiedRole) {
            throw createError(
                "Роль верифицированного пользователя не найдена",
                ErrorTypes.CONFIGURATION,
                "Роль верифицированного пользователя больше не существует.",
                { roleId: guildConfig.verification.roleId }
            );
        }

        const canAssignRole = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssignRole) {
            throw createError(
                'Бот не может управлять ролью верифицированного пользователя',
                ErrorTypes.PERMISSION,
                "Я не могу снять роль верифицированного пользователя. Проверьте моё право **Управление ролями** и иерархию ролей.",
                { guildId, roleId: verifiedRole.id }
            );
        }

        if (!member.roles.cache.has(verifiedRole.id)) {
            return {
                status: 'not_verified',
                userId,
            };
        }

        await member.roles.remove(
            verifiedRole.id, 
            `Верификация снята пользователем ${moderatorId || 'системой'}: ${reason}`
        );

        logVerificationAction(client, guildId, userId, 'removed', {
            removedBy: moderatorId,
            reason,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('Верификация пользователя снята', {
            guildId,
            userId,
            removedBy: moderatorId,
            reason
        });

        return {
            status: 'removed',
            userId,
            roleId: verifiedRole.id,
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'removeVerification',
            type: ErrorTypes.UNKNOWN,
            message: 'Операция верификации завершилась ошибкой: removeVerification',
            userMessage: 'Не удалось снять верификацию. Попробуйте ещё раз через некоторое время.',
            context: { guildId, userId, reason }
        });
        logger.error('Ошибка при снятии верификации', {
            guildId,
            userId,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        throw typedError;
    }
}

export async function validateVerificationSetup(guild, verificationConfig) {
    const botMember = guild.members.me;
    if (!botMember) {
        throw createError(
            'Участник-бот недоступен в кэше сервера',
            ErrorTypes.CONFIGURATION,
            "Не удалось проверить права бота на сервере. Попробуйте ещё раз.",
            { guildId: guild.id }
        );
    }

    const verifiedRole = guild.roles.cache.get(verificationConfig.roleId);
    if (!verifiedRole) {
        throw createError(
            "Роль верифицированного пользователя не найдена",
            ErrorTypes.CONFIGURATION,
            "Роль верифицированного пользователя была удалена. Пожалуйста, снова выполните `/verification setup`.",
            { roleId: verificationConfig.roleId, guildId: guild.id }
        );
    }

    if (verificationConfig.channelId) {
        const channel = guild.channels.cache.get(verificationConfig.channelId);
        if (!channel) {
            throw createError(
                "Канал верификации не найден",
                ErrorTypes.CONFIGURATION,
                "Канал верификации был удалён.",
                { channelId: verificationConfig.channelId, guildId: guild.id }
            );
        }

        const botPerms = channel.permissionsFor(botMember);
        const requiredPerms = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
        const missingPerms = requiredPerms.filter(perm => !botPerms.has(perm));

        if (missingPerms.length > 0) {
            throw createError(
                "У бота отсутствуют необходимые права в канале верификации",
                ErrorTypes.PERMISSION,
                `В канале верификации мне не хватает следующих прав: ${missingPerms.join(', ')}`,
                { missingPerms, channelId: channel.id }
            );
        }
    }

    return true;
}

export async function validateBotCanAssignRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
        logger.warn('Невозможно выдать роль — роль не найдена', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botMember = guild.members.me;
    if (!botMember) {
        logger.warn('Невозможно выдать роль — бот не найден в кэше участников сервера', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn('Невозможно выдать роль — отсутствует право ManageRoles', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botHighest = botMember.roles.highest;
    if (role.position >= botHighest.position) {
        logger.warn('Невозможно выдать роль — проблема с иерархией ролей', {
            guildId: guild.id,
            roleId,
            rolePosition: role.position,
            botHighestPosition: botHighest.position
        });
        return false;
    }

    return true;
}

function evaluateAutoVerifyCriteria(member, autoVerifyConfig) {
    const { criteria, accountAgeDays } = autoVerifyConfig;

    switch (criteria) {
        case 'account_age': {
            const accountAge = Date.now() - member.user.createdTimestamp;
            const requiredAge = accountAgeDays * 24 * 60 * 60 * 1000;
            return accountAge >= requiredAge;
        }

        case 'server_size':
            return member.guild.memberCount < serverSizeThreshold;

        case 'none':
            return true;

        default:
            logger.warn('Неизвестный критерий автоматической верификации', { criteria });
            return false;
    }
}

export async function checkVerificationCooldown(userId, guildId, cooldownMs = defaultCooldownMs) {
    pruneVerificationTrackers();

    const key = `${guildId}:${userId}`;
    const lastVerified = verificationCooldowns.get(key);
    
    if (lastVerified && Date.now() - lastVerified < cooldownMs) {
        const remaining = cooldownMs - (Date.now() - lastVerified);
        throw createError(
            "Пользователь находится на кулдауне верификации",
            ErrorTypes.RATE_LIMIT,
            `Пожалуйста, подождите ${Math.ceil(remaining / 1000)} секунд перед повторной верификацией.`,
            { userId, guildId, cooldownRemaining: remaining }
        );
    }
    
    verificationCooldowns.set(key, Date.now());
}

export async function trackVerificationAttempt(
    userId,
    guildId,
    maxAttempts = defaultMaxAttempts,
    windowMs = defaultAttemptWindowMs
) {
    pruneVerificationTrackers();

    const key = `${guildId}:${userId}`;
    const attempts = attemptTracker.get(key) || [];
    const now = Date.now();

    const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    if (recentAttempts.length >= maxAttempts) {
        throw createError(
            "Слишком много попыток верификации",
            ErrorTypes.RATE_LIMIT,
            "Вы выполнили слишком много попыток. Пожалуйста, немного подождите.",
            { attempts: recentAttempts.length, maxAttempts }
        );
    }

    recentAttempts.push(now);
    attemptTracker.set(key, recentAttempts);
}

async function sendAutoVerifyNotification(member, role, guild) {
    try {
        const { createEmbed } = await import('../utils/embeds.js');
        
        const embed = createEmbed({
            title: "🎉 Добро пожаловать на сервер!",
            description: `Вы были автоматически верифицированы на сервере **${guild.name}**!`,
            fields: [
                {
                    name: "✅ Роль выдана",
                    value: `Теперь у вас есть роль ${role}!`,
                    inline: false
                },
                {
                    name: "📖 Что дальше?",
                    value: "Теперь вам доступны все каналы и функции сервера. Добро пожаловать!",
                    inline: false
                }
            ],
            color: 'success'
        });

        await member.send({ embeds: [embed] });
    } catch (error) {
        logger.debug('Не удалось отправить уведомление об автоматической верификации в ЛС', {
            userId: member.id,
            guildId: guild.id,
            reason: error.message
        });
        
    }
}

function logVerificationAction(client, guildId, userId, action, metadata = {}) {
    if (!shouldLogVerifications) {
        return;
    }

    const sanitizedMetadata = sanitizeAuditMetadata(metadata);

    logger.info('Действие верификации', {
        guildId,
        userId,
        action,
        timestamp: new Date().toISOString(),
        metadata: sanitizedMetadata
    });

    if (!shouldKeepAuditTrail) {
        return;
    }

    const moderatorId = metadata.moderatorId || metadata.removedBy || null;
    const source = metadata.source || null;

    void insertVerificationAudit({
        guildId,
        userId,
        action,
        source,
        moderatorId,
        metadata: sanitizedMetadata,
        createdAt: new Date().toISOString()
    });
}

function sanitizeAuditMetadata(metadata = {}) {
    try {
        const payload = metadata && typeof metadata === 'object' ? metadata : { value: metadata };
        const json = JSON.stringify(payload);

        if (!json) {
            return {};
        }

        if (Buffer.byteLength(json, 'utf8') <= maxAuditMetadataBytes) {
            return payload;
        }

        return {
            truncated: true,
            originalBytes: Buffer.byteLength(json, 'utf8'),
            preview: json.slice(0, Math.max(0, maxAuditMetadataBytes - 32))
        };
    } catch {
        return {
            invalidMetadata: true,
            reason: 'Не удалось сериализовать метаданные'
        };
    }
}

export function validateAutoVerifyCriteria(criteria, accountAgeDays) {
    const validCriteria = ['account_age', 'server_size', 'none'];
    
    if (!validCriteria.includes(criteria)) {
        throw createError(
            `Недопустимый критерий автоматической верификации: ${criteria}`,
            ErrorTypes.VALIDATION,
            "Пожалуйста, выберите допустимый вариант критерия.",
            { criteria, validCriteria }
        );
    }
    
    if (criteria === 'account_age') {
        if (!accountAgeDays || accountAgeDays < minAutoVerifyAccountAgeDays || accountAgeDays > maxAutoVerifyAccountAgeDays) {
            throw createError(
                "Недопустимое количество дней существования аккаунта",
                ErrorTypes.VALIDATION,
                `Возраст аккаунта должен составлять от ${minAutoVerifyAccountAgeDays} до ${maxAutoVerifyAccountAgeDays} дней.`,
                { accountAgeDays, minAutoVerifyAccountAgeDays, maxAutoVerifyAccountAgeDays }
            );
        }
    }
    
    return { criteria, accountAgeDays };
}

export default {
    verifyUser,
    autoVerifyOnJoin,
    removeVerification,
    validateVerificationSetup,
    validateBotCanAssignRole,
    checkVerificationCooldown,
    trackVerificationAttempt,
    validateAutoVerifyCriteria
};
