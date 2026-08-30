/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT CHECKER
 * ============================================================
 *
 * Проверяет достижения пользователя и после успешной выдачи
 * передаёт их в систему уведомлений.
 */

import {
    checkAndUnlockAchievements,
} from './achievementService.js';

import {
    buildAchievementContext,
} from './achievementContext.js';

import {
    notifyAchievements,
} from './achievementNotifier.js';

import { logger } from '../../utils/logger.js';

/**
 * Проверить все достижения пользователя.
 *
 * @param {Object} options
 * @param {Object} options.client
 * @param {Object} options.guild
 * @param {string} options.userId
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

        if (
            !Array.isArray(unlocked) ||
            unlocked.length === 0
        ) {
            return [];
        }

        logger.info(
            `[ACHIEVEMENT] Пользователь ${userId} получил ${unlocked.length} новых достижений на сервере ${guild.id}`
        );

        /*
         * Получаем участника сервера.
         */
        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        /*
         * Отправляем уведомление.
         *
         * Если участника уже нет на сервере —
         * достижение всё равно остаётся выданным.
         */
        if (member) {
            await notifyAchievements({
                client,
                guild,
                member,
                achievements: unlocked,
            });
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
 * Проверка после экономических операций.
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
 * Проверка после получения XP / повышения уровня.
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
