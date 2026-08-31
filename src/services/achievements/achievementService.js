/**
 * Achievement Service
 *
 * Центральный сервис системы достижений TitanBot.
 *
 * Отвечает за:
 * - реестр достижений;
 * - получение информации о достижении;
 * - получение всех достижений;
 * - проверку требований;
 * - выдачу новых достижений;
 * - расчёт прогресса;
 * - работу с данными пользователя;
 * - уведомления о получении достижений.
 *
 * Discord-уведомления отправляются в тот же канал,
 * который используется для уведомлений о повышении уровня.
 */

import {
    EmbedBuilder,
} from 'discord.js';

import {
    getUserAchievements,
    hasUserAchievement,
    unlockUserAchievement,
} from '../../utils/database.js';

import {
    ACHIEVEMENTS,
    ACHIEVEMENT_CATEGORIES,
} from './achievementDefinitions.js';

import {
    getLevelingConfig,
} from '../leveling/leveling.js';

import {
    logger,
} from '../../utils/logger.js';

/**
 * ============================================================
 * INTERNAL MAP
 * ============================================================
 */

const ACHIEVEMENT_MAP = Object.freeze(
    Object.fromEntries(
        ACHIEVEMENTS.map((achievement) => [
            achievement.id,
            achievement,
        ])
    )
);

/**
 * ============================================================
 * RARITY
 * ============================================================
 */

export const ACHIEVEMENT_RARITIES = Object.freeze({
    common: {
        id: 'common',
        name: 'Обычное',
        color: '#95A5A6',
        emoji: '⚪',
    },

    uncommon: {
        id: 'uncommon',
        name: 'Необычное',
        color: '#2ECC71',
        emoji: '🟢',
    },

    rare: {
        id: 'rare',
        name: 'Редкое',
        color: '#3498DB',
        emoji: '🔵',
    },

    epic: {
        id: 'epic',
        name: 'Эпическое',
        color: '#9B59B6',
        emoji: '🟣',
    },

    legendary: {
        id: 'legendary',
        name: 'Легендарное',
        color: '#F1C40F',
        emoji: '🟡',
    },
});

/**
 * ============================================================
 * CATEGORY
 * ============================================================
 */

export const ACHIEVEMENT_CATEGORY_INFO = Object.freeze({
    progression: {
        id: 'progression',
        name: 'Прогресс',
        emoji: '📈',
    },

    activity: {
        id: 'activity',
        name: 'Активность',
        emoji: '⚡',
    },

    economy: {
        id: 'economy',
        name: 'Экономика',
        emoji: '💰',
    },

    social: {
        id: 'social',
        name: 'Общение',
        emoji: '💬',
    },

    special: {
        id: 'special',
        name: 'Особые',
        emoji: '✨',
    },
});

/**
 * ============================================================
 * INTERNAL HELPERS
 * ============================================================
 */

function normalizeAchievementId(achievementId) {
    if (typeof achievementId !== 'string') {
        return null;
    }

    const normalized = achievementId.trim();

    return normalized || null;
}

/**
 * Нормализует запись полученного достижения.
 */
function normalizeUnlockedAchievement(achievement) {
    if (
        !achievement ||
        typeof achievement !== 'object'
    ) {
        return null;
    }

    if (!achievement.id) {
        return null;
    }

    return {
        id: achievement.id,

        unlockedAt:
            Number(achievement.unlockedAt) || null,

        ...(achievement.metadata
            ? {
                  metadata: achievement.metadata,
              }
            : {}),
    };
}

/**
 * Безопасная копия определения достижения.
 */
function cloneAchievement(achievement) {
    if (!achievement) {
        return null;
    }

    return {
        ...achievement,

        reward: achievement.reward
            ? {
                  ...achievement.reward,
              }
            : undefined,

        requirement:
            achievement.requirement
                ? {
                      ...achievement.requirement,
                  }
                : undefined,
    };
}

/**
 * ============================================================
 * ACHIEVEMENT NOTIFICATION
 * ============================================================
 *
 * Использует тот же канал, что и level-up:
 *
 * config.levelUpChannel
 *
 * Если канал не настроен:
 *
 * guild.systemChannel
 *
 * Уведомления достижений НЕ зависят от
 * config.announceLevelUp.
 */

/**
 * Получить канал уведомлений.
 */
async function getAchievementNotificationChannel(
    client,
    guildId
) {
    try {
        if (
            !client ||
            !guildId
        ) {
            return null;
        }

        const guild =
            client.guilds.cache.get(
                guildId
            );

        if (!guild) {
            logger.warn(
                `[ACHIEVEMENTS] Сервер ${guildId} не найден в кэше`
            );

            return null;
        }

        const config =
            await getLevelingConfig(
                client,
                guildId
            );

        const channelId =
            config?.levelUpChannel;

        const channel =
            channelId
                ? guild.channels.cache.get(
                      channelId
                  )
                : guild.systemChannel;

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            logger.debug(
                `[ACHIEVEMENTS] Не найден канал уведомлений для сервера ${guildId}`
            );

            return null;
        }

        return channel;
    } catch (error) {
        logger.error(
            `[ACHIEVEMENTS] Ошибка получения канала уведомлений для ${guildId}:`,
            error
        );

        return null;
    }
}

/**
 * Проверка прав бота.
 */
function canSendAchievementNotification(
    channel,
    guild
) {
    try {
        if (
            !channel ||
            !guild
        ) {
            return false;
        }

        const botMember =
            guild.members.me;

        if (!botMember) {
            return false;
        }

        const permissions =
            channel.permissionsFor(
                botMember
            );

        if (!permissions) {
            return false;
        }

        return permissions.has([
            'SendMessages',
            'EmbedLinks',
        ]);
    } catch {
        return false;
    }
}

/**
 * Отправить уведомление о получении
 * одного или нескольких достижений.
 */
async function sendAchievementNotification(
    client,
    guildId,
    userId,
    achievements
) {
    try {
        if (
            !Array.isArray(
                achievements
            ) ||
            achievements.length === 0
        ) {
            return false;
        }

        const guild =
            client.guilds.cache.get(
                guildId
            );

        if (!guild) {
            return false;
        }

        const channel =
            await getAchievementNotificationChannel(
                client,
                guildId
            );

        if (!channel) {
            return false;
        }

        if (
            !canSendAchievementNotification(
                channel,
                guild
            )
        ) {
            logger.warn(
                `[ACHIEVEMENTS] Недостаточно прав для отправки уведомления в канал ${channel.id}`
            );

            return false;
        }

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        const user =
            member?.user ||
            client.users.cache.get(
                userId
            );

        if (!user) {
            return false;
        }

        const primaryAchievement =
            achievements[0];

        const rarity =
            getAchievementRarity(
                primaryAchievement?.rarity
            );

        const embed =
            new EmbedBuilder()
                .setColor(
                    rarity.color
                )
                .setAuthor({
                    name:
                        achievements.length === 1
                            ? '🏆 Достижение получено!'
                            : `🏆 Получено достижений: ${achievements.length}`,
                    iconURL:
                        user.displayAvatarURL({
                            extension: 'png',
                            size: 128,
                        }),
                })
                .setDescription(
                    `${user} **получает награду за свои достижения!** 🎉`
                )
                .setThumbnail(
                    user.displayAvatarURL({
                        extension: 'png',
                        size: 256,
                    })
                );

        for (
            const achievement of
                achievements.slice(0, 10)
        ) {
            const achievementRarity =
                getAchievementRarity(
                    achievement.rarity
                );

            embed.addFields({
                name:
                    `${achievement.emoji || '🏆'} ${achievement.name}`,
                value:
                    [
                        achievement.description ||
                            'Новое достижение разблокировано!',
                        '',
                        `${achievementRarity.emoji} **${achievementRarity.name}**`,
                    ].join('\n'),
                inline:
                    achievements.length <= 2,
            });
        }

        if (
            achievements.length > 10
        ) {
            embed.addFields({
                name: '📋 Остальные',
                value:
                    `И ещё **${achievements.length - 10}** достижений.`,
                inline: false,
            });
        }

        embed
            .setFooter({
                text:
                    `${guild.name} •`,
                iconURL:
                    guild.iconURL({
                        extension: 'png',
                        size: 64,
                    }) || undefined,
            })
            .setTimestamp();

        await channel.send({
            embeds: [embed],
        });

        logger.info(
            `[ACHIEVEMENTS] Отправлено уведомление о получении ${achievements.length} достижений пользователем ${userId} на сервере ${guildId}`
        );

        return true;
    } catch (error) {
        /*
         * Ошибка уведомления не должна ломать
         * выдачу самого достижения.
         */
        logger.error(
            `[ACHIEVEMENTS] Ошибка отправки уведомления для ${userId}:`,
            error
        );

        return false;
    }
}

/**
 * ============================================================
 * PUBLIC API — DEFINITIONS
 * ============================================================
 */

/**
 * Получить конкретное достижение.
 */
export function getAchievement(achievementId) {
    const id =
        normalizeAchievementId(
            achievementId
        );

    if (!id) {
        return null;
    }

    return cloneAchievement(
        ACHIEVEMENT_MAP[id]
    );
}

/**
 * Проверить существование достижения.
 */
export function achievementExists(achievementId) {
    const id =
        normalizeAchievementId(
            achievementId
        );

    return Boolean(
        id &&
            ACHIEVEMENT_MAP[id]
    );
}

/**
 * Получить все достижения.
 */
export function getAllAchievements() {
    return ACHIEVEMENTS.map(
        cloneAchievement
    );
}

/**
 * Получить достижения категории.
 */
export function getAchievementsByCategory(category) {
    if (
        !category ||
        !ACHIEVEMENT_CATEGORIES[
            String(category).toUpperCase()
        ]
    ) {
        /*
         * Дополнительная проверка не нужна.
         * Просто возвращаем совпадения ниже.
         */
    }

    return ACHIEVEMENTS.filter(
        (achievement) =>
            achievement.category ===
            category
    ).map(cloneAchievement);
}

/**
 * Получить достижения определённой редкости.
 */
export function getAchievementsByRarity(rarity) {
    if (
        !rarity ||
        !ACHIEVEMENT_RARITIES[rarity]
    ) {
        return [];
    }

    return ACHIEVEMENTS.filter(
        (achievement) =>
            (achievement.rarity ||
                'common') ===
            rarity
    ).map(cloneAchievement);
}

/**
 * ============================================================
 * PUBLIC API — USER ACHIEVEMENTS
 * ============================================================
 */

/**
 * Получить все достижения пользователя.
 */
export async function getUserAchievementData(
    client,
    guildId,
    userId
) {
    if (
        !client ||
        !guildId ||
        !userId
    ) {
        return [];
    }

    const achievements =
        await getUserAchievements(
            client,
            guildId,
            userId
        );

    if (
        !Array.isArray(
            achievements
        )
    ) {
        return [];
    }

    return achievements
        .map(
            normalizeUnlockedAchievement
        )
        .filter(Boolean);
}

/**
 * Получить только ID полученных достижений.
 */
export async function getUserAchievementIds(
    client,
    guildId,
    userId
) {
    const achievements =
        await getUserAchievementData(
            client,
            guildId,
            userId
        );

    return achievements.map(
        (achievement) =>
            achievement.id
    );
}

/**
 * Проверить, получил ли пользователь достижение.
 */
export async function userHasAchievement(
    client,
    guildId,
    userId,
    achievementId
) {
    const id =
        normalizeAchievementId(
            achievementId
        );

    if (!id) {
        return false;
    }

    if (!achievementExists(id)) {
        return false;
    }

    return hasUserAchievement(
        client,
        guildId,
        userId,
        id
    );
}

/**
 * Получить конкретное достижение пользователя
 * вместе с его определением.
 */
export async function getUserAchievement(
    client,
    guildId,
    userId,
    achievementId
) {
    const id =
        normalizeAchievementId(
            achievementId
        );

    if (
        !id ||
        !achievementExists(id)
    ) {
        return null;
    }

    const userAchievements =
        await getUserAchievementData(
            client,
            guildId,
            userId
        );

    const unlocked =
        userAchievements.find(
            (achievement) =>
                achievement.id === id
        );

    if (!unlocked) {
        return null;
    }

    const definition =
        getAchievement(id);

    if (!definition) {
        return null;
    }

    return {
        ...definition,

        unlockedAt:
            unlocked.unlockedAt,

        ...(unlocked.metadata
            ? {
                  metadata:
                      unlocked.metadata,
              }
            : {}),
    };
}

/**
 * ============================================================
 * PUBLIC API — UNLOCK
 * ============================================================
 */

/**
 * Выдать достижение пользователю.
 *
 * options:
 *
 * {
 *     notify: true
 * }
 *
 * notify можно отключить для массовой проверки,
 * чтобы потом отправить одно общее уведомление.
 */
export async function unlockAchievement(
    client,
    guildId,
    userId,
    achievementId,
    metadata = null,
    options = {}
) {
    const id =
        normalizeAchievementId(
            achievementId
        );

    if (!id) {
        return {
            unlocked: false,
            achievement: null,
            reason: 'invalid_id',
        };
    }

    const achievement =
        getAchievement(id);

    if (!achievement) {
        return {
            unlocked: false,
            achievement: null,
            reason: 'not_found',
        };
    }

    const alreadyUnlocked =
        await userHasAchievement(
            client,
            guildId,
            userId,
            id
        );

    if (alreadyUnlocked) {
        const existing =
            await getUserAchievement(
                client,
                guildId,
                userId,
                id
            );

        return {
            unlocked: false,
            achievement:
                existing ||
                achievement,
            reason:
                'already_unlocked',
        };
    }

    const unlocked =
        await unlockUserAchievement(
            client,
            guildId,
            userId,
            id
        );

    if (!unlocked) {
        return {
            unlocked: false,
            achievement,
            reason:
                'database_error',
        };
    }

    const unlockedAchievement = {
        ...achievement,

        unlockedAt:
            Date.now(),

        ...(metadata
            ? {
                  metadata,
              }
            : {}),
    };

    /*
     * По умолчанию уведомление отправляется.
     */
    if (
        options?.notify !== false
    ) {
        await sendAchievementNotification(
            client,
            guildId,
            userId,
            [unlockedAchievement]
        );
    }

    return {
        unlocked: true,
        achievement:
            unlockedAchievement,
    };
}

/**
 * ============================================================
 * PUBLIC API — PROGRESS
 * ============================================================
 */

/**
 * Получить общий прогресс пользователя.
 */
export async function getUserAchievementProgress(
    client,
    guildId,
    userId
) {
    const allAchievements =
        getAllAchievements();

    const userAchievements =
        await getUserAchievementData(
            client,
            guildId,
            userId
        );

    const unlockedIds =
        new Set(
            userAchievements.map(
                (achievement) =>
                    achievement.id
            )
        );

    const total =
        allAchievements.length;

    const unlocked =
        allAchievements.filter(
            (achievement) =>
                unlockedIds.has(
                    achievement.id
                )
        ).length;

    const percentage =
        total > 0
            ? Math.round(
                  (unlocked /
                      total) *
                      100
              )
            : 0;

    return {
        total,
        unlocked,
        remaining: Math.max(
            total - unlocked,
            0
        ),
        percentage,
    };
}

/**
 * ============================================================
 * PUBLIC API — PROFILE DATA
 * ============================================================
 */

/**
 * Подготовить достижения для /profile.
 */
export async function getUserAchievementProfile(
    client,
    guildId,
    userId
) {
    const allAchievements =
        getAllAchievements();

    const userAchievements =
        await getUserAchievementData(
            client,
            guildId,
            userId
        );

    const unlockedMap =
        new Map(
            userAchievements.map(
                (achievement) => [
                    achievement.id,
                    achievement,
                ]
            )
        );

    const achievements =
        allAchievements.map(
            (achievement) => {
                const unlocked =
                    unlockedMap.get(
                        achievement.id
                    );

                return {
                    ...achievement,

                    rarity:
                        achievement.rarity ||
                        'common',

                    unlocked:
                        Boolean(
                            unlocked
                        ),

                    unlockedAt:
                        unlocked
                            ?.unlockedAt ||
                        null,

                    metadata:
                        unlocked
                            ?.metadata ||
                        null,
                };
            }
        );

    const progress =
        await getUserAchievementProgress(
            client,
            guildId,
            userId
        );

    return {
        achievements,
        progress,
    };
}

/**
 * ============================================================
 * PUBLIC API — REQUIREMENTS
 * ============================================================
 *
 * Поддерживаемые типы:
 *
 * level
 * totalXp
 * balance
 * robCount
 * daysOnServer
 * earlyMember
 * serverBooster
 */

/**
 * Проверяет требование достижения.
 */
export function checkAchievementRequirement(
    achievement,
    context = {}
) {
    if (
        !achievement?.requirement
    ) {
        return false;
    }

    const {
        type,
        value,
    } = achievement.requirement;

    if (!type) {
        return false;
    }

    switch (type) {
        case 'level': {
            const level =
                Number(
                    context.level
                ) || 0;

            return (
                level >=
                Number(value)
            );
        }

        case 'totalXp': {
            const totalXp =
                Number(
                    context.totalXp
                ) || 0;

            return (
                totalXp >=
                Number(value)
            );
        }

        case 'balance': {
            const balance =
                Number(
                    context.balance
                ) || 0;

            return (
                balance >=
                Number(value)
            );
        }

        case 'robCount': {
            const robCount =
                Number(
                    context.robCount
                ) || 0;

            return (
                robCount >=
                Number(value)
            );
        }

        case 'daysOnServer': {
            const daysOnServer =
                Number(
                    context.daysOnServer
                ) || 0;

            return (
                daysOnServer >=
                Number(value)
            );
        }

        case 'earlyMember': {
            return (
                Boolean(
                    context.earlyMember
                ) ===
                Boolean(value)
            );
        }

        case 'serverBooster': {
            return (
                Boolean(
                    context.serverBooster
                ) ===
                Boolean(value)
            );
        }

        default:
            return false;
    }
}

/**
 * ============================================================
 * CHECK + UNLOCK ONE
 * ============================================================
 */

export async function checkAndUnlockAchievement(
    client,
    guildId,
    userId,
    achievementId,
    context = {},
    metadata = null
) {
    const achievement =
        getAchievement(
            achievementId
        );

    if (!achievement) {
        return null;
    }

    const alreadyUnlocked =
        await userHasAchievement(
            client,
            guildId,
            userId,
            achievement.id
        );

    if (alreadyUnlocked) {
        return {
            unlocked: false,
            achievement,
            reason:
                'already_unlocked',
        };
    }

    if (!achievement.requirement) {
        return {
            unlocked: false,
            achievement,
            reason:
                'no_requirement',
        };
    }

    const requirementMet =
        checkAchievementRequirement(
            achievement,
            context
        );

    if (!requirementMet) {
        return {
            unlocked: false,
            achievement,
            reason:
                'requirement_not_met',
        };
    }

    return unlockAchievement(
        client,
        guildId,
        userId,
        achievement.id,
        metadata
    );
}

/**
 * ============================================================
 * CHECK + UNLOCK ALL
 * ============================================================
 */

/**
 * Проверить все достижения пользователя.
 *
 * Возвращает только реально новые достижения.
 *
 * Если получено несколько достижений одновременно,
 * отправляется одно общее уведомление.
 */
export async function checkAndUnlockAchievements(
    client,
    guildId,
    userId,
    context = {}
) {
    const achievements =
        getAllAchievements();

    const unlocked = [];

    for (
        const achievement of
            achievements
    ) {
        try {
            const result =
                await checkAndUnlockAchievementInternal(
                    client,
                    guildId,
                    userId,
                    achievement.id,
                    context
                );

            if (
                result?.unlocked &&
                result.achievement
            ) {
                unlocked.push(
                    result.achievement
                );
            }
        } catch (error) {
            logger.error(
                `[ACHIEVEMENTS] Failed to check "${achievement.id}" for ${userId}:`,
                error
            );
        }
    }

    /*
     * Отправляем ОДНО сообщение,
     * если было получено несколько достижений.
     */
    if (
        unlocked.length > 0
    ) {
        await sendAchievementNotification(
            client,
            guildId,
            userId,
            unlocked
        );
    }

    return unlocked;
}

/**
 * Внутренняя версия проверки одного достижения.
 *
 * Отличается от публичной тем, что не отправляет
 * уведомление сразу.
 */
async function checkAndUnlockAchievementInternal(
    client,
    guildId,
    userId,
    achievementId,
    context = {},
    metadata = null
) {
    const achievement =
        getAchievement(
            achievementId
        );

    if (!achievement) {
        return null;
    }

    const alreadyUnlocked =
        await userHasAchievement(
            client,
            guildId,
            userId,
            achievement.id
        );

    if (alreadyUnlocked) {
        return {
            unlocked: false,
            achievement,
            reason:
                'already_unlocked',
        };
    }

    if (!achievement.requirement) {
        return {
            unlocked: false,
            achievement,
            reason:
                'no_requirement',
        };
    }

    const requirementMet =
        checkAchievementRequirement(
            achievement,
            context
        );

    if (!requirementMet) {
        return {
            unlocked: false,
            achievement,
            reason:
                'requirement_not_met',
        };
    }

    /*
     * notify: false — уведомление будет
     * отправлено после проверки всех достижений.
     */
    return unlockAchievement(
        client,
        guildId,
        userId,
        achievement.id,
        metadata,
        {
            notify: false,
        }
    );
}

/**
 * ============================================================
 * UTILITY
 * ============================================================
 */

/**
 * Форматирует дату получения достижения.
 */
export function getAchievementUnlockDate(
    unlockedAt
) {
    if (!unlockedAt) {
        return null;
    }

    const timestamp =
        Number(unlockedAt);

    if (
        !Number.isFinite(
            timestamp
        )
    ) {
        return null;
    }

    const date =
        new Date(timestamp);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date;
}

/**
 * Получить информацию о редкости.
 */
export function getAchievementRarity(
    rarity
) {
    return (
        ACHIEVEMENT_RARITIES[
            rarity
        ] ||
        ACHIEVEMENT_RARITIES.common
    );
}

/**
 * Получить информацию о категории.
 */
export function getAchievementCategory(
    category
) {
    return (
        ACHIEVEMENT_CATEGORY_INFO[
            category
        ] || null
    );
}

/**
 * Получить цвет достижения.
 */
export function getAchievementColor(
    achievement
) {
    return getAchievementRarity(
        achievement?.rarity ||
            'common'
    ).color;
}
