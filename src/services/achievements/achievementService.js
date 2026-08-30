import {
  ACHIEVEMENTS,
  getAchievementById,
} from './achievementDefinitions.js';

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function getRequirementValue(context, type) {
  switch (type) {
    case 'level':
      return toNumber(context.level);

    case 'totalXp':
      return toNumber(context.totalXp);

    case 'balance':
      return toNumber(context.balance);

    case 'daysOnServer':
      return toNumber(context.daysOnServer);

    case 'earlyMember':
      return Boolean(context.earlyMember);

    case 'serverBooster':
      return Boolean(context.serverBooster);

    default:
      return undefined;
  }
}

function checkRequirement(achievement, context) {
  const { requirement } = achievement;

  if (!requirement) {
    return false;
  }

  const currentValue = getRequirementValue(
    context,
    requirement.type
  );

  if (currentValue === undefined) {
    return false;
  }

  if (typeof requirement.value === 'boolean') {
    return currentValue === requirement.value;
  }

  return currentValue >= requirement.value;
}

/**
 * Проверяет одно достижение.
 */
export function isAchievementUnlocked(achievement, context) {
  return checkRequirement(achievement, context);
}

/**
 * Возвращает состояние всех достижений.
 */
export function getAchievementProgress(context) {
  return ACHIEVEMENTS.map((achievement) => {
    const unlocked = checkRequirement(achievement, context);

    return {
      ...achievement,
      unlocked,
    };
  });
}

/**
 * Только открытые достижения.
 */
export function getUnlockedAchievements(context) {
  return getAchievementProgress(context).filter(
    (achievement) => achievement.unlocked
  );
}

/**
 * Только закрытые достижения.
 */
export function getLockedAchievements(context) {
  return getAchievementProgress(context).filter(
    (achievement) => !achievement.unlocked
  );
}

/**
 * Получить конкретное достижение вместе с его состоянием.
 */
export function getAchievementState(id, context) {
  const achievement = getAchievementById(id);

  if (!achievement) {
    return null;
  }

  return {
    ...achievement,
    unlocked: checkRequirement(achievement, context),
  };
}

/**
 * Сводка для профиля.
 */
export function getAchievementSummary(context) {
  const achievements = getAchievementProgress(context);

  const unlocked = achievements.filter(
    (achievement) => achievement.unlocked
  );

  return {
    total: achievements.length,
    unlocked: unlocked.length,
    locked: achievements.length - unlocked.length,
    achievements,
  };
}

/**
 * Возвращает достижения категории.
 */
export function getCategoryProgress(category, context) {
  return getAchievementProgress(context).filter(
    (achievement) => achievement.category === category
  );
}

/**
 * Форматирует прогресс конкретного достижения.
 *
 * Используется в UI.
 */
export function getAchievementProgressText(achievement, context) {
  if (achievement.unlocked) {
    return '✅ Открыто';
  }

  const { requirement } = achievement;

  const currentValue = getRequirementValue(
    context,
    requirement.type
  );

  if (currentValue === undefined) {
    return achievement.secret
      ? '🔒 Секретное достижение'
      : `🔒 ${achievement.requirementText}`;
  }

  if (typeof requirement.value === 'boolean') {
    return `🔒 ${achievement.requirementText}`;
  }

  const current = Math.max(0, currentValue);
  const target = Math.max(0, Number(requirement.value));

  return `▰ ${current.toLocaleString('ru-RU')} / ${target.toLocaleString('ru-RU')}`;
}
