/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT CHECKER
 * ============================================================
 *
 * Дополнительный слой над AchievementService.
 *
 * Здесь собирается актуальный контекст пользователя,
 * после чего AchievementService проверяет все достижения.
 *
 * ВАЖНО:
 * Этот файл не импортируется из economy.js.
 * Это предотвращает циклические зависимости.
 */

import {
    checkAndUnlockAchievements,
} from './achievementService.js';

import {
    buildAchievementContext,
} from './achievementContext.js';

import { logger } from '../../utils/logger.js';

/**
 * Проверить все автоматические достижения пользователя.
 *
 * Возвращает массив только тех достижений,
 * которые были получены прямо сейчас.
 *
 * @param {Object} options
 * @param {Object} options.client
 * @param {Object} options.guild
 * @param {string} options.userId
 *
 * @returns {Promise<Array>}
 */
export async function checkAchievements({
    client,
    guild,
    userId,
}) {
    if (!client || !guild || !userId) {
        return [];
    }

    try {
        const context =
            await buildAchievementContext({
                client,
                guild,
                userId,
            });

        const unlocked =
            await checkAndUnlockAchievements(
                client,
                guild.id,
                userId,
                context
            );

        if (unlocked.length > 0) {
            logger.info(
                `[ACHIEVEMENT] Пользователь ${userId} получил ${unlocked.length} новых достижений на сервере ${guild.id}`
            );
        }

        return unlocked;
    } catch (error) {
        logger.error(
            `[ACHIEVEMENT] Ошибка проверки достижений пользователя ${userId}:`,
            error
        );

        return [];
    }
}

/**
 * Проверка достижений после экономической операции.
 *
 * Используется после:
 *
 * - daily
 * - work
 * - crime
 * - rob
 * - покупки
 * - продажи
 * - других изменений баланса
 */
export async function checkEconomyAchievements({
    client,
    guild,
    userId,
}) {
    return checkAchievements({
        client,
        guild,
        userId,
    });
}

/**
 * Проверка достижений после получения XP
 * или повышения уровня.
 */
export async function checkProgressionAchievements({
    client,
    guild,
    userId,
}) {
    return checkAchievements({
        client,
        guild,
        userId,
    });
}
