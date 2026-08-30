/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT CHECKER
 * ============================================================
 *
 * Центральная точка автоматической проверки достижений.
 *
 * ВАЖНО:
 * Этот файл НЕ импортируется из economy.js.
 * Это позволяет избежать циклических зависимостей.
 */

import {
    getAllAchievements,
    unlockAchievement,
    userHasAchievement,
} from './achievementService.js';

import {
    buildAchievementContext,
} from './achievementContext.js';

import { logger } from '../../utils/logger.js';

/**
 * Проверяет все достижения пользователя и выдаёт
 * те, условия которых уже выполнены.
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
        const context = await buildAchievementContext({
            client,
            guild,
            userId,
        });

        const achievements = getAllAchievements();

        const unlockedAchievements = [];

        for (const achievement of achievements) {
            if (!achievement?.id) {
                continue;
            }

            const alreadyUnlocked = await userHasAchievement(
                client,
                guild.id,
                userId,
                achievement.id
            );

            if (alreadyUnlocked) {
                continue;
            }

            const completed = checkRequirement(
                achievement,
                context
            );

            if (!completed) {
                continue;
            }

            const result = await unlockAchievement(
                client,
                guild.id,
                userId,
                achievement.id
            );

            if (result?.unlocked) {
                unlockedAchievements.push(
                    result.achievement
                );

                logger.info(
                    `[ACHIEVEMENT] ${userId} получил достижение ${achievement.id} на сервере ${guild.id}`
                );
            }
        }

        return unlockedAchievements;
    } catch (error) {
        logger.error(
            `[ACHIEVEMENT] Ошибка проверки достижений пользователя ${userId}:`,
            error
        );

        return [];
    }
}

/**
 * Проверяет условие конкретного достижения.
 */
function checkRequirement(
    achievement,
    context
) {
    const requirement =
        achievement?.requirement;

    if (!requirement) {
        return false;
    }

    const value =
        Number(requirement.value);

    switch (requirement.type) {
        /**
         * Уровень
         */
        case 'level':
            return (
                Number(context.level) >= value
            );

        /**
         * Общее количество XP
         */
        case 'totalXp':
            return (
                Number(context.totalXp) >= value
            );

        /**
         * Общий баланс:
         * кошелёк + банк.
         */
        case 'balance':
            return (
                Number(context.balance) >= value
            );

        /**
         * Количество дней на сервере.
         */
        case 'daysOnServer':
            return (
                Number(context.daysOnServer) >= value
            );

        /**
         * Ранний участник.
         */
        case 'earlyMember':
            return (
                requirement.value === true &&
                context.earlyMember === true
            );

        /**
         * Буст сервера.
         */
        case 'serverBooster':
            return (
                requirement.value === true &&
                context.serverBooster === true
            );

        default:
            return false;
    }
}

/**
 * Проверяет одно конкретное достижение.
 *
 * Удобно использовать там, где мы точно знаем,
 * какое событие произошло.
 */
export async function checkSingleAchievement({
    client,
    guild,
    userId,
    achievementId,
}) {
    if (
        !client ||
        !guild ||
        !userId ||
        !achievementId
    ) {
        return null;
    }

    try {
        const achievements =
            getAllAchievements();

        const achievement =
            achievements.find(
                item =>
                    item.id === achievementId
            );

        if (!achievement) {
            return null;
        }

        const alreadyUnlocked =
            await userHasAchievement(
                client,
                guild.id,
                userId,
                achievementId
            );

        if (alreadyUnlocked) {
            return null;
        }

        const context =
            await buildAchievementContext({
                client,
                guild,
                userId,
            });

        if (
            !checkRequirement(
                achievement,
                context
            )
        ) {
            return null;
        }

        const result =
            await unlockAchievement(
                client,
                guild.id,
                userId,
                achievementId
            );

        if (
            result?.unlocked
        ) {
            logger.info(
                `[ACHIEVEMENT] ${userId} получил ${achievementId}`
            );

            return result.achievement;
        }

        return null;
    } catch (error) {
        logger.error(
            `[ACHIEVEMENT] Ошибка проверки достижения ${achievementId}:`,
            error
        );

        return null;
    }
}

/**
 * Проверяет достижения после изменения экономики.
 *
 * Это отдельная функция для daily/work/rob/crime/shop
 * и других экономических действий.
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
