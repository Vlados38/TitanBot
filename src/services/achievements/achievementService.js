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
 * - работу с данными пользователя.
 *
 * Discord-уведомления здесь НЕ отправляются.
 */

import {
    getUserAchievements,
    hasUserAchievement,
    unlockUserAchievement,
} from '../../utils/database.js';

import {
    ACHIEVEMENTS,
    ACHIEVEMENT_CATEGORIES,
} from './achievementDefinitions.js';

/**
 * ============================================================
 * INTERNAL MAP
 * ============================================================
 *
 * achievementDefinitions.js хранит достижения в массиве.
 *
 * Для быстрого поиска по ID создаём отдельную Map/Object.
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
 *
 * achievementDefinitions.js хранит категории как строки.
 *
 * Здесь добавляем человекочитаемые данные для Discord/UI.
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

function normalizeAchievementId(
    achievementId
) {
    if (
        typeof achievementId !==
        'string'
    ) {
        return null;
    }

    const normalized =
        achievementId.trim();

    return normalized || null;
}

/**
 * Нормализует запись полученного достижения.
 */

function normalizeUnlockedAchievement(
    achievement
) {
    if (
        !achievement ||
        typeof achievement !==
            'object'
    ) {
        return null;
    }

    if (!achievement.id) {
        return null;
    }

    return {
        id: achievement.id,

        unlockedAt:
            Number(
                achievement.unlockedAt
            ) || null,

        ...(achievement.metadata
            ? {
                  metadata:
                      achievement.metadata,
              }
            : {}),
    };
}

/**
 * Безопасная копия определения достижения.
 */

function cloneAchievement(
    achievement
) {
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
 * PUBLIC API — DEFINITIONS
 * ============================================================
 */

/**
 * Получить конкретное достижение.
 */

export function getAchievement(
    achievementId
) {
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

export function achievementExists(
    achievementId
) {
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

export function getAchievementsByCategory(
    category
) {
    if (
        !category ||
        !ACHIEVEMENT_CATEGORIES[
            String(category).toUpperCase()
        ]
    ) {
        /*
         * ACHIEVEMENT_CATEGORIES содержит:
         *
         * PROGRESSION
         * ACTIVITY
         * ECONOMY
         * SOCIAL
         * SPECIAL
         *
         * Поэтому дополнительно проверяем
         * реальные значения категорий.
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

export function getAchievementsByRarity(
    rarity
) {
    if (
        !rarity ||
        !ACHIEVEMENT_RARITIES[rarity]
    ) {
        return [];
    }

    /*
     * Некоторые старые достижения могут
     * не иметь rarity.
     *
     * Для таких достижений считаем
     * редкость common.
     */

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

    if (
        !achievementExists(id)
    ) {
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
 * Возвращает:
 *
 * {
 *     unlocked: true,
 *     achievement: {...}
 * }
 *
 * если достижение новое.
 */

export async function unlockAchievement(
    client,
    guildId,
    userId,
    achievementId,
    metadata = null
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

    return {
        unlocked: true,

        achievement: {
            ...achievement,

            unlockedAt:
                Date.now(),

            ...(metadata
                ? {
                      metadata,
                  }
                : {}),
        },
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

                    /*
                     * Старые определения могут
                     * не иметь rarity.
                     *
                     * Для UI используем common.
                     */
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
 */

/**
 * Проверяет требование достижения.
 *
 * Поддерживаемые типы:
 *
 * level
 * totalXp
 * balance
 * daysOnServer
 * earlyMember
 * serverBooster
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

    /*
     * Уже получено?
     */

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

    /*
     * Если requirement отсутствует,
     * такое достижение можно выдать
     * напрямую через unlockAchievement().
     *
     * Автоматически здесь его НЕ выдаём.
     */

    if (!achievement.requirement) {
        return {
            unlocked: false,
            achievement,
            reason:
                'no_requirement',
        };
    }

    /*
     * Проверяем условие.
     */

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
     * Выдаём достижение.
     */

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
                await checkAndUnlockAchievement(
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
            console.error(
                `[ACHIEVEMENTS] Failed to check "${achievement.id}" for ${userId}:`,
                error
            );
        }
    }

    return unlocked;
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
