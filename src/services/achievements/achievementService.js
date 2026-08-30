/**
 * Achievement Service
 *
 * Центральный сервис системы достижений TitanBot.
 *
 * Отвечает за:
 * - реестр достижений;
 * - получение информации о достижении;
 * - получение всех достижений;
 * - проверку полученных достижений;
 * - выдачу новых достижений;
 * - расчёт прогресса;
 *
 * Сам сервис не занимается Discord-уведомлениями.
 * Уведомления будут подключены отдельно через AchievementNotifier.
 */

import {
    getUserAchievements,
    hasUserAchievement,
    unlockUserAchievement,
} from '../../utils/database.js';


/**
 * ============================================================
 * ACHIEVEMENT DEFINITIONS
 * ============================================================
 *
 * Все достижения проекта находятся здесь.
 *
 * В будущем сюда можно добавить:
 * - reward;
 * - hidden;
 * - progress;
 * - category;
 * - rarity;
 * - season;
 *
 * ID достижения никогда не следует менять после релиза,
 * поскольку именно ID хранится в базе данных.
 */

export const ACHIEVEMENTS = {
    first_step: {
        id: 'first_step',

        name: 'Первый шаг',
        description: 'Отправить своё первое сообщение на сервере.',

        emoji: '🌱',
        rarity: 'common',
        category: 'social',

        hidden: false,

        reward: {
            xp: 0,
            coins: 0,
        },
    },

    level_5: {
        id: 'level_5',

        name: 'Осваиваюсь',
        description: 'Достичь 5 уровня.',

        emoji: '⭐',
        rarity: 'common',
        category: 'leveling',

        hidden: false,

        reward: {
            xp: 0,
            coins: 0,
        },

        requirement: {
            type: 'level',
            value: 5,
        },
    },

    level_10: {
        id: 'level_10',

        name: 'Свой человек',
        description: 'Достичь 10 уровня.',

        emoji: '🔥',
        rarity: 'rare',
        category: 'leveling',

        hidden: false,

        reward: {
            xp: 0,
            coins: 0,
        },

        requirement: {
            type: 'level',
            value: 10,
        },
    },
};


/**
 * ============================================================
 * RARITY
 * ============================================================
 */

export const ACHIEVEMENT_RARITIES = {
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
};


/**
 * ============================================================
 * CATEGORY
 * ============================================================
 */

export const ACHIEVEMENT_CATEGORIES = {
    social: {
        id: 'social',
        name: 'Общение',
        emoji: '💬',
    },

    leveling: {
        id: 'leveling',
        name: 'Уровни',
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

    special: {
        id: 'special',
        name: 'Особые',
        emoji: '✨',
    },
};


/**
 * ============================================================
 * INTERNAL HELPERS
 * ============================================================
 */

/**
 * Нормализует ID достижения.
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
    if (!achievement || typeof achievement !== 'object') {
        return null;
    }

    if (!achievement.id) {
        return null;
    }

    return {
        id: achievement.id,
        unlockedAt: Number(achievement.unlockedAt) || null,
        ...(achievement.metadata
            ? { metadata: achievement.metadata }
            : {}),
    };
}


/**
 * Возвращает безопасную копию объекта достижения.
 *
 * Это предотвращает случайное изменение глобального
 * ACHIEVEMENTS из другого места приложения.
 */
function cloneAchievement(achievement) {
    if (!achievement) {
        return null;
    }

    return {
        ...achievement,

        reward: achievement.reward
            ? { ...achievement.reward }
            : undefined,

        requirement: achievement.requirement
            ? { ...achievement.requirement }
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
export function getAchievement(achievementId) {
    const id = normalizeAchievementId(achievementId);

    if (!id) {
        return null;
    }

    return cloneAchievement(
        ACHIEVEMENTS[id]
    );
}


/**
 * Проверить, существует ли достижение.
 */
export function achievementExists(achievementId) {
    const id = normalizeAchievementId(achievementId);

    return Boolean(
        id &&
        ACHIEVEMENTS[id]
    );
}


/**
 * Получить все достижения.
 */
export function getAllAchievements() {
    return Object.values(ACHIEVEMENTS)
        .map(cloneAchievement);
}


/**
 * Получить достижения определённой категории.
 */
export function getAchievementsByCategory(category) {
    if (!category || !ACHIEVEMENT_CATEGORIES[category]) {
        return [];
    }

    return Object.values(ACHIEVEMENTS)
        .filter(achievement => achievement.category === category)
        .map(cloneAchievement);
}


/**
 * Получить достижения определённой редкости.
 */
export function getAchievementsByRarity(rarity) {
    if (!rarity || !ACHIEVEMENT_RARITIES[rarity]) {
        return [];
    }

    return Object.values(ACHIEVEMENTS)
        .filter(achievement => achievement.rarity === rarity)
        .map(cloneAchievement);
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
    if (!client || !guildId || !userId) {
        return [];
    }

    const achievements = await getUserAchievements(
        client,
        guildId,
        userId
    );

    return achievements
        .map(normalizeUnlockedAchievement)
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
    const achievements = await getUserAchievementData(
        client,
        guildId,
        userId
    );

    return achievements.map(
        achievement => achievement.id
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
    const id = normalizeAchievementId(achievementId);

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
 * вместе с его описанием.
 *
 * Возвращает:
 *
 * {
 *     id,
 *     name,
 *     description,
 *     emoji,
 *     rarity,
 *     category,
 *     unlockedAt
 * }
 *
 * либо null.
 */
export async function getUserAchievement(
    client,
    guildId,
    userId,
    achievementId
) {
    const id = normalizeAchievementId(achievementId);

    if (!id || !achievementExists(id)) {
        return null;
    }

    const userAchievements =
        await getUserAchievementData(
            client,
            guildId,
            userId
        );

    const unlocked = userAchievements.find(
        achievement => achievement.id === id
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
        unlockedAt: unlocked.unlockedAt,
        ...(unlocked.metadata
            ? { metadata: unlocked.metadata }
            : {}),
    };
}


/**
 ============================================================
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
 *
 * Если оно уже получено:
 *
 * {
 *     unlocked: false,
 *     achievement: {...},
 *     reason: 'already_unlocked'
 * }
 */
export async function unlockAchievement(
    client,
    guildId,
    userId,
    achievementId,
    metadata = null
) {
    const id = normalizeAchievementId(achievementId);

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
            achievement: existing || achievement,
            reason: 'already_unlocked',
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
            reason: 'database_error',
        };
    }

    return {
        unlocked: true,

        achievement: {
            ...achievement,

            unlockedAt: Date.now(),

            ...(metadata
                ? { metadata }
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
 *
 * Например:
 *
 * {
 *     total: 3,
 *     unlocked: 1,
 *     percentage: 33
 * }
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
                achievement => achievement.id
            )
        );

    const total =
        allAchievements.length;

    const unlocked =
        allAchievements.filter(
            achievement =>
                unlockedIds.has(achievement.id)
        ).length;

    const percentage =
        total > 0
            ? Math.round((unlocked / total) * 100)
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
 * Получить полностью подготовленные данные
 * достижений пользователя для /profile.
 *
 * Здесь мы объединяем:
 *
 * - список всех достижений;
 * - полученные достижения;
 * - прогресс;
 * - информацию о дате получения.
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
                achievement => [
                    achievement.id,
                    achievement,
                ]
            )
        );

    const achievements =
        allAchievements.map(
            achievement => {
                const unlocked =
                    unlockedMap.get(
                        achievement.id
                    );

                return {
                    ...achievement,

                    unlocked: Boolean(unlocked),

                    unlockedAt:
                        unlocked?.unlockedAt || null,

                    metadata:
                        unlocked?.metadata || null,
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
 * Проверяет простое требование достижения.
 *
 * Пока поддерживаются:
 *
 * level
 *
 * В будущем сюда можно добавить:
 *
 * messages
 * voice_minutes
 * invites
 * coins
 * warnings
 * giveaways
 * reactions
 * birthdays
 * etc.
 */
export function checkAchievementRequirement(
    achievement,
    context = {}
) {
    if (!achievement?.requirement) {
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
                Number(context.level) || 0;

            return level >= Number(value);
        }

        default:
            return false;
    }
}


/**
 * Проверить одно достижение по текущему контексту
 * и при необходимости выдать его.
 *
 * Возвращает null, если достижение не требует
 * проверки через context.
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
        getAchievement(achievementId);

    if (!achievement) {
        return null;
    }

    /*
     * Если достижение уже получено,
     * ничего не делаем.
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
            reason: 'already_unlocked',
        };
    }

    /*
     * Достижение без requirement означает,
     * что оно должно быть выдано напрямую.
     */
    if (!achievement.requirement) {
        return unlockAchievement(
            client,
            guildId,
            userId,
            achievement.id,
            metadata
        );
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
            reason: 'requirement_not_met',
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
 * Проверить несколько достижений одновременно.
 *
 * Например, после повышения уровня:
 *
 * checkAndUnlockAchievements(client, guildId, userId, {
 *     level: 10
 * });
 *
 * Вернётся массив только реально новых достижений.
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

    for (const achievement of achievements) {
        const result =
            await checkAndUnlockAchievement(
                client,
                guildId,
                userId,
                achievement.id,
                context
            );

        if (result?.unlocked) {
            unlocked.push(
                result.achievement
            );
        }
    }

    return unlocked;
}


/**
 * ============================================================
 * PUBLIC API — UTILITY
 * ============================================================
 */

/**
 * Форматирует дату получения достижения.
 *
 * Возвращает Date, чтобы Discord-слой сам решал,
 * как её показывать.
 */
export function getAchievementUnlockDate(
    unlockedAt
) {
    if (!unlockedAt) {
        return null;
    }

    const timestamp =
        Number(unlockedAt);

    if (!Number.isFinite(timestamp)) {
        return null;
    }

    const date =
        new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
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
    return ACHIEVEMENT_RARITIES[rarity]
        || ACHIEVEMENT_RARITIES.common;
}


/**
 * Получить информацию о категории.
 */
export function getAchievementCategory(
    category
) {
    return ACHIEVEMENT_CATEGORIES[category]
        || null;
}


/**
 * Получить цвет достижения.
 */
export function getAchievementColor(
    achievement
) {
    return getAchievementRarity(
        achievement?.rarity
    ).color;
}
