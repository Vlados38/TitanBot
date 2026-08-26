// leveling.js

import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { addXp } from './xpSystem.js';
import { getUserLevelKey } from '../../utils/database/keys.js';

const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;
const MAX_LEVEL = 1000;
const MIN_LEVEL = 0;

export function getXpForLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    throw new TitanBotError(
      `Недопустимый уровень: ${level}. Уровень должен быть от ${MIN_LEVEL} до ${MAX_LEVEL}`,
      ErrorTypes.VALIDATION,
      'Уровень должен быть допустимым числом.'
    );
  }
  return 5 * Math.pow(level, 2) + 50 * level + 50;
}

export function getLevelFromXp(xp) {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new TitanBotError(
      `Недопустимое количество XP: ${xp}`,
      ErrorTypes.VALIDATION,
      'Количество XP должно быть неотрицательным числом.'
    );
  }

  let level = 0;
  let xpNeeded = 0;
  
  while (xp >= getXpForLevel(level) && level < MAX_LEVEL) {
    xpNeeded = getXpForLevel(level);
    xp -= xpNeeded;
    level++;
  }
  
  return {
    level: Math.min(level, MAX_LEVEL),
    currentXp: xp,
    xpNeeded: getXpForLevel(Math.min(level, MAX_LEVEL))
  };
}

export function calculateTotalXp(level, currentXp = 0) {
  let total = currentXp;
  for (let i = 0; i < level; i++) {
    total += getXpForLevel(i);
  }
  return total;
}

export async function getLeaderboard(client, guildId, limit = 10) {
  try {
    
    if (!guildId || typeof guildId !== 'string') {
      throw new TitanBotError(
        'Недопустимый ID сервера',
        ErrorTypes.VALIDATION,
        'Требуется ID сервера.'
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      limit = Math.min(Math.max(limit, 1), 100);
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`Сервер ${guildId} не найден в кэше`);
      return [];
    }
    
    const members = await guild.members.fetch().catch(error => {
      logger.error(`Не удалось получить участников сервера ${guildId}:`, error);
      return new Map();
    });

    const leaderboard = [];
    
    for (const [userId, member] of members) {
      if (member.user.bot) continue;
      
      const data = await getUserLevelData(client, guildId, userId);
      if (data && (data.totalXp > 0 || data.level > 0)) {
        leaderboard.push({
          userId,
          username: member.user.username,
          discriminator: member.user.discriminator,
          ...data
        });
      }
    }
    
    leaderboard.sort((a, b) => b.totalXp - a.totalXp);
    
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return leaderboard.slice(0, limit);
    
  } catch (error) {
    logger.error('Ошибка при получении таблицы лидеров:', error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось получить таблицу лидеров: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось получить таблицу лидеров в данный момент.'
    );
  }
}

export function createLeaderboardEmbed(leaderboard, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Таблица лидеров ${guild.name}`)
    .setColor('#2ecc71')
    .setTimestamp();
    
  if (!leaderboard || leaderboard.length === 0) {
    embed.setDescription('В таблице лидеров пока нет пользователей!');
    return embed;
  }
  
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  
  const top3Text = top3.map((user, index) => {
    const medal = ['🥇', '🥈', '🥉'][index];
    return `${medal} **#${user.rank}** ${user.username} — Уровень ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  const restText = rest.map(user => {
    return `**#${user.rank}** ${user.username} — Уровень ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  embed.setDescription(
    `**Лучшие участники**\n${top3Text}${restText ? '\n\n' + restText : ''}`
  );
  
  return embed;
}

export async function getLevelingConfig(client, guildId) {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    return guildConfig.leveling || {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 20,
      levelUpMessage: '{user} достиг нового уровня: {level}!',
      levelUpChannel: null,
      ignoredChannels: [],
      ignoredRoles: [],
      blacklistedUsers: [],
      roleRewards: {},
      announceLevelUp: true,
      xpMultiplier: 1
    };
  } catch (error) {
    logger.error(`Ошибка при получении конфигурации системы уровней для сервера ${guildId}:`, error);
    return {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 20,
      levelUpMessage: '{user} достиг нового уровня: {level}!',
      levelUpChannel: null,
      ignoredChannels: [],
      ignoredRoles: [],
      blacklistedUsers: [],
      roleRewards: {},
      announceLevelUp: true,
      xpMultiplier: 1
    };
  }
}

export async function getUserLevelData(client, guildId, userId) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotError(
        'Требуются ID сервера и пользователя',
        ErrorTypes.VALIDATION
      );
    }

    const key = getUserLevelKey(guildId, userId);
    const data = await client.db.get(key);
    
    if (!data) {
      return {
        xp: 0,
        level: 0,
        totalXp: 0,
        lastMessage: 0,
        rank: 0
      };
    }
    
    return {
      xp: Math.max(0, data.xp || 0),
      level: Math.max(0, Math.min(data.level || 0, MAX_LEVEL)),
      totalXp: Math.max(0, data.totalXp || 0),
      lastMessage: data.lastMessage || 0,
      rank: data.rank || 0
    };
  } catch (error) {
    logger.error(`Ошибка при получении данных об уровне пользователя ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось получить данные пользователя: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось получить данные об уровне в данный момент.'
    );
  }
}

export async function saveUserLevelData(client, guildId, userId, data) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotError(
        'Требуются ID сервера и пользователя',
        ErrorTypes.VALIDATION
      );
    }

    if (!data || typeof data !== 'object') {
      throw new TitanBotError(
        'Недопустимые данные уровня пользователя',
        ErrorTypes.VALIDATION
      );
    }

    const sanitizedData = {
      xp: Math.max(0, Number(data.xp) || 0),
      level: Math.max(0, Math.min(Number(data.level) || 0, MAX_LEVEL)),
      totalXp: Math.max(0, Number(data.totalXp) || 0),
      lastMessage: Number(data.lastMessage) || 0,
      rank: Number(data.rank) || 0
    };

    const key = getUserLevelKey(guildId, userId);
    await client.db.set(key, sanitizedData);
  } catch (error) {
    logger.error(`Ошибка при сохранении данных уровня пользователя ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось сохранить данные пользователя: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось сохранить данные об уровне в данный момент.'
    );
  }
}

export async function saveLevelingConfig(client, guildId, config) {
  try {
    if (!guildId || !config) {
      throw new TitanBotError(
        'Требуются ID сервера и конфигурация',
        ErrorTypes.VALIDATION
      );
    }

    const guildConfig = await getGuildConfig(client, guildId);

    if (config.xpCooldown && (config.xpCooldown < 0 || config.xpCooldown > 3600)) {
      throw new TitanBotError(
        'Задержка получения XP должна быть от 0 до 3600 секунд',
        ErrorTypes.VALIDATION,
        'Задержка должна быть от 0 до 3600 секунд.'
      );
    }

    if (config.xpRange && (config.xpRange.min < 1 || config.xpRange.max < 1 || config.xpRange.min > config.xpRange.max)) {
      throw new TitanBotError(
        'Недопустимая конфигурация диапазона XP',
        ErrorTypes.VALIDATION,
        'Минимальное количество XP должно быть меньше максимального, и оба значения должны быть положительными.'
      );
    }

    guildConfig.leveling = config;
    await setGuildConfig(client, guildId, guildConfig);
    
    logger.info(`Конфигурация системы уровней обновлена для сервера ${guildId}`);
  } catch (error) {
    logger.error(`Ошибка при сохранении конфигурации системы уровней для сервера ${guildId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось сохранить конфигурацию: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось сохранить конфигурацию в данный момент.'
    );
  }
}

export async function addLevels(client, guildId, userId, levels) {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new TitanBotError(
        'Система уровней отключена на этом сервере',
        ErrorTypes.CONFIGURATION,
        'Система уровней в настоящее время отключена на этом сервере.'
      );
    }

    if (!Number.isInteger(levels) || levels <= 0) {
      throw new TitanBotError(
        `Недопустимое количество уровней: ${levels}`,
        ErrorTypes.VALIDATION,
        'Необходимо добавить положительное количество уровней.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = userData.level + levels;

    if (newLevel > MAX_LEVEL) {
      throw new TitanBotError(
        `Уровень ${newLevel} превышает максимальный уровень ${MAX_LEVEL}`,
        ErrorTypes.VALIDATION,
        `Максимальный уровень — ${MAX_LEVEL}.`
      );
    }

    const newXp = 0;
    const newTotalXp = calculateTotalXp(newLevel, newXp);

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Пользователю ${userId} добавлено ${levels} уровней на сервере ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Ошибка при добавлении уровней пользователю ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось добавить уровни: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось добавить уровни в данный момент.'
    );
  }
}

export async function removeLevels(client, guildId, userId, levels) {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new TitanBotError(
        'Система уровней отключена на этом сервере',
        ErrorTypes.CONFIGURATION,
        'Система уровней в настоящее время отключена на этом сервере.'
      );
    }

    if (!Number.isInteger(levels) || levels <= 0) {
      throw new TitanBotError(
        `Недопустимое количество уровней: ${levels}`,
        ErrorTypes.VALIDATION,
        'Необходимо удалить положительное количество уровней.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = Math.max(MIN_LEVEL, userData.level - levels);

    const newXp = 0;
    const newTotalXp = calculateTotalXp(newLevel, newXp);

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`У пользователя ${userId} удалено ${levels} уровней на сервере ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Ошибка при удалении уровней у пользователя ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось удалить уровни: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось удалить уровни в данный момент.'
    );
  }
}

export async function setUserLevel(client, guildId, userId, level) {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new TitanBotError(
        'Система уровней отключена на этом сервере',
        ErrorTypes.CONFIGURATION,
        'Система уровней в настоящее время отключена на этом сервере.'
      );
    }

    if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
      throw new TitanBotError(
        `Недопустимый уровень: ${level}`,
        ErrorTypes.VALIDATION,
        `Уровень должен быть от ${MIN_LEVEL} до ${MAX_LEVEL}.`
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    
    const newXp = 0;
    const newTotalXp = calculateTotalXp(level, newXp);

    userData.level = level;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Уровень пользователя ${userId} установлен на ${level} на сервере ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Ошибка при установке уровня пользователя ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Не удалось установить уровень: ${error.message}`,
      ErrorTypes.DATABASE,
      'Не удалось установить уровень в данный момент.'
    );
  }
}

export async function deleteUserLevelData(client, guildId, userId) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotError(
        'Требуются ID сервера и пользователя',
        ErrorTypes.VALIDATION
      );
    }

    const key = getUserLevelKey(guildId, userId);
    await client.db.delete(key);
    
    logger.debug(`Данные уровня пользователя ${userId} удалены с сервера ${guildId}`);
  } catch (error) {
    logger.error(`Ошибка при удалении данных уровня пользователя ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    logger.warn(`Не удалось удалить данные уровня пользователя ${userId} на сервере ${guildId}`);
  }
}
