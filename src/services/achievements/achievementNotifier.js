/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT NOTIFIER
 * ============================================================
 *
 * Отправляет уведомления о полученных достижениях
 * в тот же канал, который используется системой Level Up.
 *
 * Использует:
 *   leveling.levelUpChannel
 *
 * Если отдельный канал не настроен:
 *   guild.systemChannel
 */

import { EmbedBuilder } from 'discord.js';

import {
    getLevelingConfig,
} from '../leveling/leveling.js';

import {
    getAchievementColor,
} from './achievementService.js';

import { logger } from '../../utils/logger.js';

/**
 * Отправляет уведомление о полученных достижениях.
 *
 * Если пользователь получил несколько достижений
 * одновременно, отправляется одно сообщение.
 *
 * @param {Object} options
 * @param {Object} options.client
 * @param {Object} options.guild
 * @param {Object} options.member
 * @param {Array} options.achievements
 *
 * @returns {Promise<boolean>}
 */
export async function notifyAchievements({
    client,
    guild,
    member,
    achievements = [],
}) {
    if (
        !client ||
        !guild ||
        !member ||
        !Array.isArray(achievements) ||
        achievements.length === 0
    ) {
        return false;
    }

    try {
        const config =
            await getLevelingConfig(
                client,
                guild.id
            );

        /*
         * Используем тот же канал,
         * что и уведомления Level Up.
         */
        const channel = config?.levelUpChannel
            ? guild.channels.cache.get(
                config.levelUpChannel
            )
            : guild.systemChannel;

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            logger.debug(
                `[ACHIEVEMENT] Не найден канал уведомлений на сервере ${guild.id}`
            );

            return false;
        }

        /*
         * Проверяем права бота.
         */
        const permissions =
            channel.permissionsFor(
                guild.members.me
            );

        if (
            !permissions ||
            !permissions.has([
                'SendMessages',
                'EmbedLinks',
            ])
        ) {
            logger.warn(
                `[ACHIEVEMENT] Недостаточно прав для отправки уведомления в канал ${channel.id}`
            );

            return false;
        }

        /*
         * Защита от некорректных объектов.
         */
        const validAchievements =
            achievements.filter(
                achievement =>
                    achievement &&
                    achievement.id
            );

        if (
            validAchievements.length === 0
        ) {
            return false;
        }

        /*
         * Берём цвет самого редкого достижения.
         */
        const embedColor =
            getAchievementsColor(
                validAchievements
            );

        const embed =
            new EmbedBuilder()
                .setColor(embedColor)

                .setAuthor({
                    name:
                        '🏆 Новое достижение!',
                    iconURL:
                        member.user.displayAvatarURL({
                            extension: 'png',
                            size: 128,
                        }),
                })

                .setDescription(
                    `Поздравляем, ${member}!\n\n` +
                    `Ты получил ${
                        validAchievements.length === 1
                            ? '**новое достижение**'
                            : `**${validAchievements.length} новых достижения**`
                    }! 🎉`
                );

        /*
         * Добавляем каждое полученное достижение.
         */
        for (
            const achievement
            of validAchievements
        ) {
            const rarity =
                getRarityName(
                    achievement.rarity
                );

            const rarityEmoji =
                getRarityEmoji(
                    achievement.rarity
                );

            const requirement =
                achievement.requirementText
                ? `\n📌 ${achievement.requirementText}`
                : '';

            embed.addFields({
                name:
                    `${achievement.emoji || '🏆'} ${achievement.name || 'Достижение'}`,

                value:
                    `${achievement.description || 'Достижение получено!'}\n` +
                    `${rarityEmoji} **${rarity}**${requirement}`,

                inline:
                    validAchievements.length > 1,
            });
        }

        embed
            .setThumbnail(
                member.user.displayAvatarURL({
                    extension: 'png',
                    size: 256,
                })
            )

            .setFooter({
                text:
                    `${guild.name} • TitanBot Achievements`,
                iconURL:
                    guild.iconURL({
                        extension: 'png',
                        size: 64,
                    }) || undefined,
            })

            .setTimestamp();

        await channel.send({
            content: member.toString(),
            embeds: [embed],
        });

        logger.info(
            `[ACHIEVEMENT] Отправлено уведомление для ${member.user.tag}: ` +
            `${validAchievements.map(a => a.id).join(', ')}`
        );

        return true;
    } catch (error) {
        logger.error(
            `[ACHIEVEMENT] Ошибка отправки уведомления на сервере ${guild.id}:`,
            error
        );

        return false;
    }
}

/**
 * Выбирает цвет по самому редкому достижению.
 */
function getAchievementsColor(
    achievements
) {
    const rarityPriority = {
        legendary: 5,
        epic: 4,
        rare: 3,
        uncommon: 2,
        common: 1,
    };

    const sorted =
        [...achievements].sort(
            (a, b) =>
                (rarityPriority[b.rarity] || 0) -
                (rarityPriority[a.rarity] || 0)
        );

    const achievement =
        sorted[0];

    try {
        return getAchievementColor(
            achievement
        );
    } catch {
        return '#5865F2';
    }
}

/**
 * Название редкости.
 */
function getRarityName(
    rarity
) {
    const names = {
        common: 'Обычное',
        uncommon: 'Необычное',
        rare: 'Редкое',
        epic: 'Эпическое',
        legendary: 'Легендарное',
    };

    return (
        names[rarity] ||
        'Обычное'
    );
}

/**
 * Emoji редкости.
 */
function getRarityEmoji(
    rarity
) {
    const emojis = {
        common: '⚪',
        uncommon: '🟢',
        rare: '🔵',
        epic: '🟣',
        legendary: '🟡',
    };

    return (
        emojis[rarity] ||
        '⚪'
    );
}
