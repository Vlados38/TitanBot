/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT EVENTS
 * ============================================================
 *
 * Центральная точка запуска проверки достижений
 * после игровых событий.
 *
 * Этот файл:
 *
 * 1. Собирает актуальный context пользователя.
 * 2. Проверяет все достижения.
 * 3. Сохраняет новые достижения через AchievementService.
 * 4. Отправляет уведомления в тот же канал,
 *    который используется для Level Up.
 *
 * ВАЖНО:
 * Ошибка достижений никогда не должна ломать
 * основную команду или экономическую операцию.
 * ============================================================
 */

import {
    EmbedBuilder,
} from 'discord.js';

import {
    getLevelingConfig,
} from '../leveling/leveling.js';

import {
    buildAchievementContext,
} from './achievementContext.js';

import {
    checkAndUnlockAchievements,
    getAchievementRarity,
} from './achievementService.js';

import {
    logger,
} from '../../utils/logger.js';


/**
 * ============================================================
 * PUBLIC API
 * ============================================================
 */

/**
 * Проверяет достижения пользователя после игрового события.
 *
 * Пример:
 *
 * await processAchievementEvent({
 *     client,
 *     guild,
 *     userId,
 * });
 *
 * Возвращает массив только что полученных достижений.
 */
export async function processAchievementEvent({
    client,
    guild,
    userId,
    channel = null,
} = {}) {
    try {
        if (
            !client ||
            !guild ||
            !userId
        ) {
            return [];
        }

        /*
         * ======================================================
         * BUILD CONTEXT
         * ======================================================
         */

        const context =
            await buildAchievementContext({
                client,
                guild,
                userId,
            });

        /*
         * ======================================================
         * CHECK ACHIEVEMENTS
         * ======================================================
         */

        const unlockedAchievements =
            await checkAndUnlockAchievements(
                client,
                guild.id,
                userId,
                context
            );

        /*
         * Ничего нового не получено.
         */

        if (
            !Array.isArray(
                unlockedAchievements
            ) ||
            unlockedAchievements.length === 0
        ) {
            return [];
        }

        /*
         * ======================================================
         * NOTIFICATION CHANNEL
         * ======================================================
         *
         * Сначала пытаемся использовать канал,
         * который был передан событием.
         *
         * Если его нет — используем levelUpChannel.
         */

        let notificationChannel =
            channel;

        if (
            !notificationChannel
        ) {
            notificationChannel =
                await getAchievementNotificationChannel(
                    guild,
                    client
                );
        }

        /*
         * Если канал не найден,
         * достижения всё равно уже сохранены.
         */

        if (
            !notificationChannel ||
            !notificationChannel.isTextBased()
        ) {
            logger.warn(
                `[ACHIEVEMENTS] Notification channel not found for guild ${guild.id}`
            );

            return unlockedAchievements;
        }

        /*
         * ======================================================
         * SEND NOTIFICATIONS
         * ======================================================
         */

        for (
            const achievement of
                unlockedAchievements
        ) {
            await sendAchievementNotification({
                channel:
                    notificationChannel,

                guild,

                userId,

                achievement,
            });
        }

        return unlockedAchievements;

    } catch (error) {
        /*
         * Система достижений не должна ломать
         * основную игровую механику.
         */

        logger.error(
            `[ACHIEVEMENTS] Failed to process achievement event for ${userId}:`,
            error
        );

        return [];
    }
}


/**
 * ============================================================
 * NOTIFICATION CHANNEL
 * ============================================================
 */

async function getAchievementNotificationChannel(
    guild,
    client
) {
    try {
        const levelingConfig =
            await getLevelingConfig(
                client,
                guild.id
            );

        /*
         * Используем тот же канал,
         * который используется Level Up.
         */

        if (
            levelingConfig?.levelUpChannel
        ) {
            const configuredChannel =
                guild.channels.cache.get(
                    levelingConfig.levelUpChannel
                );

            if (
                configuredChannel
            ) {
                return configuredChannel;
            }

            /*
             * Канала нет в кэше —
             * пробуем получить его напрямую.
             */

            const fetchedChannel =
                await guild.channels
                    .fetch(
                        levelingConfig.levelUpChannel
                    )
                    .catch(() => null);

            if (
                fetchedChannel
            ) {
                return fetchedChannel;
            }
        }

        /*
         * Если отдельный канал Level Up
         * не настроен — используем системный.
         */

        return guild.systemChannel || null;

    } catch (error) {
        logger.error(
            `[ACHIEVEMENTS] Failed to resolve notification channel for guild ${guild.id}:`,
            error
        );

        return guild.systemChannel || null;
    }
}


/**
 * ============================================================
 * SEND NOTIFICATION
 * ============================================================
 */

async function sendAchievementNotification({
    channel,
    guild,
    userId,
    achievement,
}) {
    try {
        if (
            !channel ||
            !channel.isTextBased() ||
            !achievement
        ) {
            return false;
        }

        /*
         * ======================================================
         * RARITY
         * ======================================================
         */

        const rarity =
            getAchievementRarity(
                achievement.rarity
            );

        const rarityName =
            rarity?.name ||
            'Обычное';

        const rarityEmoji =
            rarity?.emoji ||
            '⚪';

        const rarityColor =
            rarity?.color ||
            '#95A5A6';

        /*
         * ======================================================
         * USER MENTION
         * ======================================================
         */

        const userMention =
            `<@${userId}>`;

        /*
         * ======================================================
         * EMBED
         * ======================================================
         */

        const embed =
            new EmbedBuilder()

                .setColor(
                    rarityColor
                )

                .setAuthor({
                    name:
                        '🏆 Новое достижение!',
                })

                .setTitle(
                    `${achievement.emoji || '🏆'} ${achievement.name || 'Новое достижение'}`
                )

                .setDescription(
                    [
                        `${userMention} получил новое достижение!`,

                        '',

                        `> ${achievement.description || 'Достижение разблокировано.'}`,

                        '',

                        `${rarityEmoji} **Редкость:** ${rarityName}`,
                    ].join('\n')
                )

                .setThumbnail(
                    `https://cdn.discordapp.com/embed/avatars/0.png`
                )

                .setFooter({
                    text:
                        `${guild.name} • TitanBot`,
                })

                .setTimestamp();

        /*
         * ======================================================
         * SEND
         * ======================================================
         */

        await channel.send({
            embeds: [
                embed,
            ],
        });

        return true;

    } catch (error) {
        logger.error(
            `[ACHIEVEMENTS] Failed to send notification for "${achievement?.id}":`,
            error
        );

        return false;
    }
}


/**
 * ============================================================
 * CONVENIENCE HELPERS
 * ============================================================
 */

/**
 * Проверить достижения после изменения экономики.
 *
 * Используется экономическими командами.
 */
export async function processEconomyAchievementEvent({
    client,
    guild,
    userId,
    channel = null,
} = {}) {
    return processAchievementEvent({
        client,
        guild,
        userId,
        channel,
    });
}


/**
 * Проверить достижения после изменения XP.
 *
 * Можно использовать leveling-системой.
 */
export async function processXpAchievementEvent({
    client,
    guild,
    userId,
    channel = null,
} = {}) {
    return processAchievementEvent({
        client,
        guild,
        userId,
        channel,
    });
}


/**
 * Проверить достижения после любого события.
 *
 * Универсальный алиас для будущих систем:
 *
 * - daily
 * - work
 * - crime
 * - rob
 * - fish
 * - mine
 * - gamble
 * - сообщения
 * - голосовая активность
 * - и т.д.
 */
export async function processGenericAchievementEvent({
    client,
    guild,
    userId,
    channel = null,
} = {}) {
    return processAchievementEvent({
        client,
        guild,
        userId,
        channel,
    });
}
