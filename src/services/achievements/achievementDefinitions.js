export const ACHIEVEMENT_CATEGORIES = Object.freeze({
  PROGRESSION: 'progression',
  ACTIVITY: 'activity',
  ECONOMY: 'economy',
  SOCIAL: 'social',
  SPECIAL: 'special',
});

export const ACHIEVEMENTS = Object.freeze([
  // ─────────────────────────────────────────────
  // PROGRESSION
  // ─────────────────────────────────────────────

  {
    id: 'first_level',
    category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
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
    emoji: '👑',
    name: 'Легенда',
    description: 'Достичь 100 уровня.',
    requirementText: '100 уровень',
    requirement: {
      type: 'level',
      value: 100,
    },
  },

  // ─────────────────────────────────────────────
  // XP
  // ─────────────────────────────────────────────

  {
    id: 'xp_1000',
    category: ACHIEVEMENT_CATEGORIES.ACTIVITY,
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
    emoji: '🌟',
    name: 'Опытный игрок',
    description: 'Получить 50 000 XP.',
    requirementText: '50 000 XP',
    requirement: {
      type: 'totalXp',
      value: 50_000,
    },
  },

  // ─────────────────────────────────────────────
  // ECONOMY
  // ─────────────────────────────────────────────

  {
    id: 'money_1000',
    category: ACHIEVEMENT_CATEGORIES.ECONOMY,
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
    emoji: '💎',
    name: 'Богач',
    description: 'Накопить 100 000 монет.',
    requirementText: '100 000 монет',
    requirement: {
      type: 'balance',
      value: 100_000,
    },
  },

  // ─────────────────────────────────────────────
  // MEMBERSHIP
  // ─────────────────────────────────────────────

  {
    id: 'member_7_days',
    category: ACHIEVEMENT_CATEGORIES.SOCIAL,
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
    emoji: '🎂',
    name: 'Год вместе',
    description: 'Провести на сервере целый год.',
    requirementText: '365 дней на сервере',
    requirement: {
      type: 'daysOnServer',
      value: 365,
    },
  },

  // ─────────────────────────────────────────────
  // SPECIAL
  // ─────────────────────────────────────────────

  {
    id: 'early_member',
    category: ACHIEVEMENT_CATEGORIES.SPECIAL,
    emoji: '🌟',
    name: 'Ранний участник',
    description: 'Один из первых участников сервера.',
    requirementText: 'Специальное достижение',
    requirement: {
      type: 'earlyMember',
      value: true,
    },
    secret: true,
  },

  {
    id: 'server_booster',
    category: ACHIEVEMENT_CATEGORIES.SPECIAL,
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
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}

export function getAchievementsByCategory(category) {
  return ACHIEVEMENTS.filter(
    (achievement) => achievement.category === category
  );
}
