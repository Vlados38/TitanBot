// warningService.js

import { db, getFromDb, setInDb, getWarningsKey, getWarningsPrefix } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { createError, ErrorTypes, wrapServiceClassMethods } from '../../utils/errorHandler.js';

class WarningService {

  static async addWarning({
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp = Date.now()
  }) {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb(key, []);

    if (!Array.isArray(warnings)) {
      logger.warn(`Предупреждения пользователя ${userId} на сервере ${guildId} повреждены, выполняется сброс`);

      await setInDb(key, []);

      throw createError(
        'Повреждённые данные предупреждений',
        ErrorTypes.DATABASE,
        'Данные предупреждений были повреждены и сброшены. Пожалуйста, попробуйте снова.',
        {
          guildId,
          userId,
          service: 'warningService',
          operation: 'addWarning'
        }
      );
    }

    const warning = {
      id: Date.now(),
      guildId,
      userId,
      moderatorId,
      reason,
      timestamp,
      status: 'active'
    };

    warnings.push(warning);
    await setInDb(key, warnings);

    logger.info(`Добавлено предупреждение: ${userId} на сервере ${guildId} модератором ${moderatorId}`);

    return {
      id: warning.id,
      totalCount: warnings.length
    };
  }

  static async getWarnings(guildId, userId) {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb(key, []);

    return Array.isArray(warnings)
      ? warnings.filter(w => w && w.status !== 'deleted')
      : [];
  }

  static async getWarningCount(guildId, userId) {
    const warnings = await this.getWarnings(guildId, userId);
    return warnings.length;
  }

  static async removeWarning(guildId, userId, warningId) {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb(key, []);

    const index = warnings.findIndex(w => w.id === warningId);

    if (index === -1) {
      throw createError(
        'Предупреждение не найдено',
        ErrorTypes.USER_INPUT,
        'Это предупреждение не удалось найти. Возможно, оно уже было удалено.',
        {
          guildId,
          userId,
          warningId,
          service: 'warningService',
          operation: 'removeWarning'
        }
      );
    }

    warnings[index].status = 'deleted';
    await setInDb(key, warnings);

    logger.info(`Предупреждение ${warningId} удалено для пользователя ${userId} на сервере ${guildId}`);

    return { removed: true };
  }

  static async clearWarnings(guildId, userId) {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb(key, []);
    const count = warnings.length;

    await setInDb(key, []);

    logger.info(`Все предупреждения пользователя ${userId} на сервере ${guildId} очищены (${count} удалено)`);

    return { count };
  }

  static async getGuildWarnings(guildId, filters = {}) {
    const { moderatorId, limit = 100 } = filters;
    const prefix = getWarningsPrefix(guildId);

    const keys = await db.list(prefix);
    const allWarnings = [];

    for (const key of Array.isArray(keys) ? keys : []) {
      const warnings = await getFromDb(key, []);

      if (!Array.isArray(warnings)) continue;

      for (const warning of warnings) {
        if (!warning || warning.status === 'deleted') continue;
        if (moderatorId && warning.moderatorId !== moderatorId) continue;

        allWarnings.push(warning);
      }
    }

    allWarnings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    logger.debug(
      `Получены предупреждения сервера ${guildId}. Всего активных предупреждений: ${allWarnings.length}`
    );

    return allWarnings.slice(0, limit);
  }
}

wrapServiceClassMethods(WarningService);

export { WarningService };
