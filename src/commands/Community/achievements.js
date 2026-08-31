import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import {
    getUserAchievementProfile,
    getAchievementRarity,
    getAchievementCategory,
} from '../../services/achievements/achievementService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('Посмотреть достижения пользователя')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Пользователь')
                .setRequired(false)
        )
        .setDMPermission(false),

    category: 'Community',

    async execute(
        interaction,
        config,
        client
    ) {
        await interaction.deferReply();

        const targetUser =
            interaction.options.getUser('user') ??
            interaction.user;

        const guild =
            interaction.guild;

        if (!guild) {
            return interaction.editReply({
                content:
                    '❌ Эта команда доступна только на сервере.',
            });
        }

        try {
            const member =
                await guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);

            if (!member) {
                return interaction.editReply({
                    content:
                        '❌ Пользователь не найден на этом сервере.',
                });
            }

            const profile =
                await getUserAchievementProfile(
                    client,
                    guild.id,
                    targetUser.id
                );

            const achievements =
                Array.isArray(
                    profile?.achievements
                )
                    ? profile.achievements
                    : [];

            const progress =
                profile?.progress ?? {
                    total: achievements.length,
                    unlocked: 0,
                    remaining: achievements.length,
                    percentage: 0,
                };

            const unlocked =
                achievements.filter(
                    achievement =>
                        achievement.unlocked
                );

            const locked =
                achievements.filter(
                    achievement =>
                        !achievement.unlocked
                );

            const embed =
                new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({
                        name:
                            `🏆 Достижения — ${targetUser.username}`,
                        iconURL:
                            targetUser.displayAvatarURL({
                                extension: 'png',
                                size: 128,
                            }),
                    })
                    .setThumbnail(
                        targetUser.displayAvatarURL({
                            extension: 'png',
                            size: 256,
                        })
                    )
                    .setDescription(
                        [
                            `**Прогресс:** ${progress.unlocked}/${progress.total} (${progress.percentage}%)`,
                            `🔓 Получено: **${progress.unlocked}**`,
                            `🔒 Осталось: **${progress.remaining}**`,
                        ].join('\n')
                    );

            /*
             * =====================================================
             * ПОЛУЧЕННЫЕ ДОСТИЖЕНИЯ
             * =====================================================
             */

            if (unlocked.length > 0) {
                const unlockedText =
                    unlocked
                        .map((achievement) => {
                            const rarity =
                                getAchievementRarity(
                                    achievement.rarity
                                );

                            const category =
                                getAchievementCategory(
                                    achievement.category
                                );

                            return [
                                `${achievement.emoji || '🏆'} **${achievement.name}**`,
                                `> ${achievement.description || 'Достижение получено.'}`,
                                `> ${rarity.emoji} ${rarity.name} • ${category?.emoji || '📁'} ${category?.name || achievement.category}`,
                            ].join('\n');
                        })
                        .join('\n\n');

                /*
                 * Discord ограничивает значение field
                 * 1024 символами, поэтому разбиваем
                 * достижения на несколько полей.
                 */

                const chunks = [];
                let currentChunk = '';

                for (
                    const achievementText
                    of unlockedText.split('\n\n')
                ) {
                    if (
                        currentChunk &&
                        (
                            currentChunk.length +
                            achievementText.length +
                            2
                        ) > 1000
                    ) {
                        chunks.push(
                            currentChunk
                        );

                        currentChunk =
                            achievementText;
                    } else {
                        currentChunk =
                            currentChunk
                                ? `${currentChunk}\n\n${achievementText}`
                                : achievementText;
                    }
                }

                if (currentChunk) {
                    chunks.push(
                        currentChunk
                    );
                }

                chunks
                    .slice(0, 25)
                    .forEach(
                        (chunk, index) => {
                            embed.addFields({
                                name:
                                    index === 0
                                        ? '🔓 Полученные достижения'
                                        : '🏆 Продолжение',
                                value:
                                    chunk,
                                inline:
                                    false,
                            });
                        }
                    );
            } else {
                embed.addFields({
                    name:
                        '🔓 Полученные достижения',
                    value:
                        'Пока нет полученных достижений.',
                    inline:
                        false,
                });
            }

            /*
             * =====================================================
             * СЕКРЕТНЫЕ / НЕПОЛУЧЕННЫЕ
             * =====================================================
             *
             * Секретные достижения не раскрываем
             * до получения.
             */

            if (locked.length > 0) {
                const lockedText =
                    locked
                        .map((achievement) => {
                            if (
                                achievement.secret
                            ) {
                                return (
                                    '❔ **Секретное достижение**\n' +
                                    '> Требования скрыты.'
                                );
                            }

                            const rarity =
                                getAchievementRarity(
                                    achievement.rarity
                                );

                            const category =
                                getAchievementCategory(
                                    achievement.category
                                );

                            return [
                                `🔒 **${achievement.name}**`,
                                `> ${achievement.description || 'Достижение ещё не получено.'}`,
                                `> Требование: **${achievement.requirementText || 'Не указано'}**`,
                                `> ${rarity.emoji} ${rarity.name} • ${category?.emoji || '📁'} ${category?.name || achievement.category}`,
                            ].join('\n');
                        })
                        .join('\n\n');

                const chunks = [];
                let currentChunk = '';

                for (
                    const achievementText
                    of lockedText.split('\n\n')
                ) {
                    if (
                        currentChunk &&
                        (
                            currentChunk.length +
                            achievementText.length +
                            2
                        ) > 1000
                    ) {
                        chunks.push(
                            currentChunk
                        );

                        currentChunk =
                            achievementText;
                    } else {
                        currentChunk =
                            currentChunk
                                ? `${currentChunk}\n\n${achievementText}`
                                : achievementText;
                    }
                }

                if (currentChunk) {
                    chunks.push(
                        currentChunk
                    );
                }

                chunks
                    .slice(0, 25)
                    .forEach(
                        (chunk, index) => {
                            embed.addFields({
                                name:
                                    index === 0
                                        ? '🔒 Неполученные достижения'
                                        : '📋 Продолжение',
                                value:
                                    chunk,
                                inline:
                                    false,
                            });
                        }
                    );
            }

            embed
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

            return interaction.editReply({
                embeds: [embed],
            });

        } catch (error) {
            console.error(
                '[ACHIEVEMENTS COMMAND] Failed:',
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось загрузить достижения пользователя.',
            });
        }
    },
};
