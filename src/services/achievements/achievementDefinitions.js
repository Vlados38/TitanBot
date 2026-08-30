/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT DEFINITIONS
 * ============================================================
 *
 * Единственный реестр достижений TitanBot.
 *
 * ВАЖНО:
 * ID достижения нельзя менять после того, как бот начал
 * работать на сервере, потому что именно ID хранится в БД.
 */

export const ACHIEVEMENT_CATEGORIES = Object.freeze({
    PROGRESSION: 'progression',
    ACTIVITY: 'activity',
    ECONOMY: 'economy',
    SOCIAL: 'social',
    SPECIAL: 'special',
});

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

export const ACHIEVEMENTS = Object.freeze([
    /* ========================================================
     * PROGRESSION
     * ====================================================== */

    {
        id: 'first_level',
        category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
        rarity: 'common',
        emoji: '🌱',
        name: 'Первый шаг',
        description: 'Достичь 1 уровня.',
        requirementText: '1 уровень',

        requirement: {
            type: 'level',
            value: 1,
        },
    },

    {
        id: 'level_5',
        category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
        rarity: 'common',
        emoji: '⭐',
        name: 'Новичок',
        description: 'Достичь 5 уровня.',
        requirementText: '5 уровень',

        requirement: {
            type: 'level',
            value: 5,
        },
    },

    {
        id: 'level_10',
        category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
        rarity: 'uncommon',
        emoji: '✨',
        name: 'Освоился',
        description: 'Достичь 10 уровня.',
        requirementText: '10 уровень',

        requirement: {
            type: 'level',
            value: 10,
        },
    },

    {
        id: 'level_25',
        category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
        rarity: 'rare',
        emoji: '🔥',
        name: 'Активист',
        description: 'Достичь 25 уровня.',
        requirementText: '25 уровень',

        requirement: {
            type: 'level',
            value: 25,
        },
    },

    {
        id: 'level_50',
        category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
        rarity: 'epic',
        emoji: '💎',
        name: 'Ветеран',
        description: 'Достичь 50 уровня.',
        requirementText: '50 уровень',

        requirement: {
            type: 'level',
            value: 50,
        },
    },

    {
        id: 'level_100',
        category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
        rarity: 'legendary',
        emoji: '👑',
        name: 'Легенда',
        description: 'Достичь 100 уровня.',
        requirementText: '100 уровень',

        requirement: {
            type: 'level',
            value: 100,
        },
    },

    /* ========================================================
     * XP
     * ====================================================== */

    {
        id: 'xp_1000',
        category: ACHIEVEMENT_CATEGORIES.ACTIVITY,
        rarity: 'common',
        emoji: '⚡',
        name: 'Первый опыт',
        description: 'Получить 1 000 XP.',
        requirementText: '1 000 XP',

        requirement: {
            type: 'totalXp',
            value: 1_000,
        },
    },

    {
        id: 'xp_10000',
        category: ACHIEVEMENT_CATEGORIES.ACTIVITY,
        rarity: 'uncommon',
        emoji: '🚀',
        name: 'Разгон',
        description: 'Получить 10 000 XP.',
        requirementText: '10 000 XP',

        requirement: {
            type: 'totalXp',
            value: 10_000,
        },
    },

    {
        id: 'xp_50000',
        category: ACHIEVEMENT_CATEGORIES.ACTIVITY,
        rarity: 'rare',
        emoji: '🌟',
        name: 'Опытный игрок',
        description: 'Получить 50 000 XP.',
        requirementText: '50 000 XP',

        requirement: {
            type: 'totalXp',
            value: 50_000,
        },
    },

    {
        id: 'xp_100000',
        category: ACHIEVEMENT_CATEGORIES.ACTIVITY,
        rarity: 'epic',
        emoji: '💫',
        name: 'Мастер XP',
        description: 'Получить 100 000 XP.',
        requirementText: '100 000 XP',

        requirement: {
            type: 'totalXp',
            value: 100_000,
        },
    },

    {
        id: 'xp_500000',
        category: ACHIEVEMENT_CATEGORIES.ACTIVITY,
        rarity: 'legendary',
        emoji: '🌌',
        name: 'Повелитель опыта',
        description: 'Получить 500 000 XP.',
        requirementText: '500 000 XP',

        requirement: {
            type: 'totalXp',
            value: 500_000,
        },
    },

    /* ========================================================
     * ECONOMY
     * ====================================================== */

    {
        id: 'money_1000',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'common',
        emoji: '💰',
        name: 'Первая тысяча',
        description: 'Накопить 1 000 монет.',
        requirementText: '1 000 монет',

        requirement: {
            type: 'balance',
            value: 1_000,
        },
    },

    {
        id: 'money_10000',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'uncommon',
        emoji: '💵',
        name: 'Неплохой капитал',
        description: 'Накопить 10 000 монет.',
        requirementText: '10 000 монет',

        requirement: {
            type: 'balance',
            value: 10_000,
        },
    },

    {
        id: 'money_100000',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'rare',
        emoji: '💎',
        name: 'Богач',
        description: 'Накопить 100 000 монет.',
        requirementText: '100 000 монет',

        requirement: {
            type: 'balance',
            value: 100_000,
        },
    },

    {
        id: 'money_1000000',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'legendary',
        emoji: '🏦',
        name: 'Миллионер',
        description: 'Накопить 1 000 000 монет.',
        requirementText: '1 000 000 монет',

        requirement: {
            type: 'balance',
            value: 1_000_000,
        },
    },

    /* ========================================================
     * ROB / CRIME
     * ====================================================== */

    {
        id: 'rob_first',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'common',
        emoji: '😈',
        name: 'Первое дело',
        description: 'Совершить первое ограбление.',
        requirementText: '1 ограбление',

        requirement: {
            type: 'robCount',
            value: 1,
        },
    },

    {
        id: 'rob_10',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'uncommon',
        emoji: '🥷',
        name: 'Опытный грабитель',
        description: 'Совершить 10 ограблений.',
        requirementText: '10 ограблений',

        requirement: {
            type: 'robCount',
            value: 10,
        },
    },

    {
        id: 'rob_50',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'rare',
        emoji: '💀',
        name: 'Криминальный авторитет',
        description: 'Совершить 50 ограблений.',
        requirementText: '50 ограблений',

        requirement: {
            type: 'robCount',
            value: 50,
        },
    },

    {
        id: 'rob_100',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'epic',
        emoji: '👑',
        name: 'Король преступности',
        description: 'Совершить 100 ограблений.',
        requirementText: '100 ограблений',

        requirement: {
            type: 'robCount',
            value: 100,
        },
    },

    {
        id: 'rob_500',
        category: ACHIEVEMENT_CATEGORIES.ECONOMY,
        rarity: 'legendary',
        emoji: '☠️',
        name: 'Легенда криминала',
        description: 'Совершить 500 ограблений.',
        requirementText: '500 ограблений',

        requirement: {
            type: 'robCount',
            value: 500,
        },
    },

    /* ========================================================
     * SOCIAL / MEMBERSHIP
     * ====================================================== */

    {
        id: 'member_7_days',
        category: ACHIEVEMENT_CATEGORIES.SOCIAL,
        rarity: 'common',
        emoji: '📅',
        name: 'Первая неделя',
        description: 'Провести на сервере 7 дней.',
        requirementText: '7 дней на сервере',

        requirement: {
            type: 'daysOnServer',
            value: 7,
        },
    },

    {
        id: 'member_30_days',
        category: ACHIEVEMENT_CATEGORIES.SOCIAL,
        rarity: 'uncommon',
        emoji: '🛡️',
        name: 'Свой человек',
        description: 'Провести на сервере 30 дней.',
        requirementText: '30 дней на сервере',

        requirement: {
            type: 'daysOnServer',
            value: 30,
        },
    },

    {
        id: 'member_90_days',
        category: ACHIEVEMENT_CATEGORIES.SOCIAL,
        rarity: 'rare',
        emoji: '🏠',
        name: 'Постоянный житель',
        description: 'Провести на сервере 90 дней.',
        requirementText: '90 дней на сервере',

        requirement: {
            type: 'daysOnServer',
            value: 90,
        },
    },

    {
        id: 'member_365_days',
        category: ACHIEVEMENT_CATEGORIES.SOCIAL,
        rarity: 'legendary',
        emoji: '🎂',
        name: 'Год вместе',
        description: 'Провести на сервере целый год.',
        requirementText: '365 дней на сервере',

        requirement: {
            type: 'daysOnServer',
            value: 365,
        },
    },

    /* ========================================================
     * SPECIAL
     * ====================================================== */

    {
        id: 'early_member',
        category: ACHIEVEMENT_CATEGORIES.SPECIAL,
        rarity: 'legendary',
        emoji: '🌟',
        name: 'Ранний участник',
        description: 'Один из первых участников сервера.',
        requirementText: 'Специальное достижение',
        secret: true,

        requirement: {
            type: 'earlyMember',
            value: true,
        },
    },

    {
        id: 'server_booster',
        category: ACHIEVEMENT_CATEGORIES.SPECIAL,
        rarity: 'epic',
        emoji: '🚀',
        name: 'Поддержка сервера',
        description: 'Поддержать сервер бустом.',
        requirementText: 'Бустить сервер',

        requirement: {
            type: 'serverBooster',
            value: true,
        },
    },
]);

export function getAchievementById(id) {
    return ACHIEVEMENTS.find(
        (achievement) =>
            achievement.id === id
    ) ?? null;
}

export function getAchievementsByCategory(category) {
    return ACHIEVEMENTS.filter(
        (achievement) =>
            achievement.category === category
    );
}

export function getAchievementsByRarity(rarity) {
    return ACHIEVEMENTS.filter(
        (achievement) =>
            achievement.rarity === rarity
    );
}
