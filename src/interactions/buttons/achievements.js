import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';

import {
    getUserAchievementProfile,
} from '../../services/achievements/achievementService.js';

const PAGE_SIZE = 6;

const CATEGORY_ORDER = [
    'progression',
    'activity',
    'economy',
    'social',
    'special',
];

const CATEGORY_INFO = {
    progression: {
        name: 'Прогресс',
        emoji: '📈',
        color: '#5865F2',
    },

    activity: {
        name: 'Активность',
        emoji: '⚡',
        color: '#3498DB',
    },

    economy: {
        name: 'Экономика',
        emoji: '💰',
        color: '#F1C40F',
    },

    social: {
        name: 'Общение',
        emoji: '💬',
        color: '#2ECC71',
    },

    special: {
        name: 'Особые',
        emoji: '✨',
        color: '#9B59B6',
    },
};

const RARITY_INFO = {
    common: {
        name: 'Обычное',
        emoji: '⚪',
        color: '#95A5A6',
    },

    uncommon: {
        name: 'Необычное',
        emoji: '🟢',
        color: '#2ECC71',
    },

    rare: {
        name: 'Редкое',
        emoji: '🔵',
        color: '#3498DB',
    },

    epic: {
        name: 'Эпическое',
        emoji: '🟣',
        color: '#9B59B6',
    },

    legendary: {
        name: 'Легендарное',
        emoji: '🟡',
        color: '#F1C40F',
    },
};

function chunk(array, size) {
    const result = [];

    for (
        let i = 0;
        i < array.length;
        i += size
    ) {
        result.push(
            array.slice(
                i,
                i + size
            )
        );
    }

    return result;
}

function getCategoryInfo(category) {
    return (
        CATEGORY_INFO[category] || {
            name: 'Другое',
            emoji: '📁',
            color: '#5865F2',
        }
    );
}

function getRarityInfo(rarity) {
    return (
        RARITY_INFO[rarity] ||
        RARITY_INFO.common
    );
}

function buildProgressBar(
    current,
    total,
    size = 18
) {
    if (!total) {
        return '░'.repeat(size);
    }

    const percentage = Math.max(
        0,
        Math.min(
            100,
            (current / total) * 100
        )
    );

    const filled = Math.round(
        (percentage / 100) * size
    );

    return (
        '▰'.repeat(filled) +
        '▱'.repeat(size - filled)
    );
}

function formatNumber(value) {
    return Number(
        value || 0
    ).toLocaleString('ru-RU');
}

function buildAchievementField(
    achievement
) {
    const rarity = getRarityInfo(
        achievement.rarity
    );

    const category =
        getCategoryInfo(
            achievement.category
        );

    if (achievement.unlocked) {
        const lines = [
            `${achievement.emoji || '🏆'} **${achievement.name}**`,
            `${rarity.emoji} ${rarity.name}  •  ${category.emoji} ${category.name}`,
        ];

        if (achievement.description) {
            lines.push(
                achievement.description
            );
        }

        if (achievement.unlockedAt) {
            lines.push(
                `└ Получено <t:${Math.floor(
                    achievement.unlockedAt / 1000
                )}:R>`
            );
        }

        return {
            name: '‎',
            value: lines.join('\n'),
            inline: false,
        };
    }

    if (achievement.secret) {
        return {
            name: '‎',
            value: [
                '❔ **Секретное достижение**',
                `${rarity.emoji} ${rarity.name}  •  ${category.emoji} ${category.name}`,
                'Условия этого достижения скрыты.',
            ].join('\n'),
            inline: false,
        };
    }

    return {
        name: '‎',
        value: [
            `🔒 **${achievement.name}**`,
            `${rarity.emoji} ${rarity.name}  •  ${category.emoji} ${category.name}`,
            achievement.description ||
                'Достижение ещё не получено.',
            achievement.requirementText
                ? `└ Требование: **${achievement.requirementText}**`
                : null,
        ]
            .filter(Boolean)
            .join('\n'),
        inline: false,
    };
}

function buildPages(profile) {
    const grouped = new Map(
        CATEGORY_ORDER.map(
            category => [
                category,
                [],
            ]
        )
    );

    for (
        const achievement of
            profile.achievements || []
    ) {
        if (
            !grouped.has(
                achievement.category
            )
        ) {
            grouped.set(
                achievement.category,
                []
            );
        }

        grouped
            .get(
                achievement.category
            )
            .push(achievement);
    }

    const pages = [];

    for (
        const category of CATEGORY_ORDER
    ) {
        const achievements =
            grouped.get(category) || [];

        if (
            achievements.length === 0
        ) {
            continue;
        }

        pages.push(
            ...chunk(
                achievements,
                PAGE_SIZE
            )
        );
    }

    return pages;
}

function getPageCategory(
    achievements
) {
    if (
        !achievements ||
        achievements.length === 0
    ) {
        return null;
    }

    const categories =
        achievements.map(
            achievement =>
                achievement.category
        );

    const unique =
        [...new Set(categories)];

    if (
        unique.length === 1
    ) {
        return getCategoryInfo(
            unique[0]
        );
    }

    return {
        name: 'Достижения',
        emoji: '🏆',
        color: '#5865F2',
    };
}

function buildEmbed({
    targetUser,
    profile,
    pages,
    page,
}) {
    const currentPage =
        pages[page] || [];

    const total =
        Number(
            profile.progress?.total
        ) || 0;

    const unlocked =
        Number(
            profile.progress?.unlocked
        ) || 0;

    const remaining =
        Math.max(
            total - unlocked,
            0
        );

    const percentage =
        total > 0
            ? Math.round(
                  (unlocked / total) *
                      100
              )
            : 0;

    const category =
        getPageCategory(
            currentPage
        );

    const embed =
        new EmbedBuilder()
            .setColor(
                category?.color ||
                    '#5865F2'
            )
            .setAuthor({
                name:
                    `Профиль достижений • ${
                        targetUser.username
                    }`,
                iconURL:
                    targetUser.displayAvatarURL(
                        {
                            extension:
                                'png',
                            size: 128,
                        }
                    ),
            })
            .setTitle(
                `${category?.emoji || '🏆'} Достижения`
            )
            .setDescription(
                [
                    `> **Коллекция достижений пользователя**`,
                    '',
                    `**${formatNumber(
                        unlocked
                    )}** из **${formatNumber(
                        total
                    )}** получено  •  **${percentage}%**`,
                    `\`${buildProgressBar(
                        unlocked,
                        total
                    )}\``,
                    '',
                    `🏆 Получено: **${formatNumber(
                        unlocked
                    )}**`,
                    `🔒 Осталось: **${formatNumber(
                        remaining
                    )}**`,
                ].join('\n')
            );

    for (
        const achievement of
            currentPage
    ) {
        embed.addFields(
            buildAchievementField(
                achievement
            )
        );
    }

    embed.setFooter({
        text:
            `${category?.name || 'Достижения'} • Страница ${
                page + 1
            }/${pages.length} • TitanBot`,
    });

    embed.setTimestamp();

    return embed;
}

function buildButtons(
    page,
    totalPages
) {
    const previousButton =
        new ButtonBuilder()
            .setCustomId(
                `achievements:prev:${page}`
            )
            .setEmoji('◀️')
            .setLabel('Назад')
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                page <= 0
            );

    const pageButton =
        new ButtonBuilder()
            .setCustomId(
                `achievements:page:${page}`
            )
            .setLabel(
                `${page + 1} / ${totalPages}`
            )
            .setStyle(
                ButtonStyle.Primary
            )
            .setDisabled(true);

    const nextButton =
        new ButtonBuilder()
            .setCustomId(
                `achievements:next:${page}`
            )
            .setEmoji('▶️')
            .setLabel('Далее')
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                page >=
                    totalPages - 1
            );

    return new ActionRowBuilder()
        .addComponents(
            previousButton,
            pageButton,
            nextButton
        );
}

export default {
    customId: 'achievements',

    async execute(
        interaction,
        client,
        args
    ) {
        const action =
            args?.[0];

        const parsedPage =
            Number(args?.[1]);

        const page =
            Number.isFinite(
                parsedPage
            )
                ? parsedPage
                : 0;

        /*
         * -----------------------------------------------------
         * USER ID
         * -----------------------------------------------------
         *
         * Сохраняем ID пользователя в footer.
         * Это позволяет кнопкам продолжать работать
         * даже если сообщение было создано для другого
         * пользователя.
         */

        const footer =
            interaction.message
                ?.embeds?.[0]
                ?.footer?.text || '';

        const footerUserId =
            footer.match(
                /user:(\d+)/
            )?.[1];

        const targetUserId =
            footerUserId ||
            interaction.user.id;

        const targetUser =
            await client.users
                .fetch(
                    targetUserId
                )
                .catch(
                    () =>
                        interaction.user
                );

        /*
         * -----------------------------------------------------
         * LOAD PROFILE
         * -----------------------------------------------------
         */

        const profile =
            await getUserAchievementProfile(
                client,
                interaction.guildId,
                targetUser.id
            );

        const pages =
            buildPages(profile);

        /*
         * -----------------------------------------------------
         * EMPTY
         * -----------------------------------------------------
         */

        if (
            !pages.length
        ) {
            const embed =
                new EmbedBuilder()
                    .setColor(
                        '#5865F2'
                    )
                    .setAuthor({
                        name:
                            `Профиль достижений • ${
                                targetUser.username
                            }`,
                        iconURL:
                            targetUser.displayAvatarURL(
                                {
                                    extension:
                                        'png',
                                    size: 128,
                                }
                            ),
                    })
                    .setTitle(
                        '🏆 Достижения'
                    )
                    .setDescription(
                        [
                            '> **Коллекция достижений**',
                            '',
                            'На сервере пока нет доступных достижений.',
                        ].join('\n')
                    )
                    .setFooter({
                        text:
                            'TitanBot • Achievements',
                    })
                    .setTimestamp();

            return interaction.update({
                embeds: [embed],
                components: [],
            });
        }

        /*
         * -----------------------------------------------------
         * PAGE
         * -----------------------------------------------------
         */

        let currentPage =
            page;

        if (
            action === 'prev'
        ) {
            currentPage--;
        }

        if (
            action === 'next'
        ) {
            currentPage++;
        }

        currentPage =
            Math.max(
                0,
                Math.min(
                    pages.length - 1,
                    currentPage
                )
            );

        /*
         * -----------------------------------------------------
         * EMBED
         * -----------------------------------------------------
         */

        const embed =
            buildEmbed({
                targetUser,
                profile,
                pages,
                page: currentPage,
            });

        /*
         * -----------------------------------------------------
         * UPDATE
         * -----------------------------------------------------
         *
         * Footer дополнительно содержит user:<id>,
         * чтобы не потерять пользователя при перелистывании.
         */

        const footerText =
            embed.data.footer?.text ||
            'TitanBot • Achievements';

        embed.setFooter({
            text:
                `${footerText} • user:${targetUser.id}`,
        });

        await interaction.update({
            embeds: [embed],
            components: [
                buildButtons(
                    currentPage,
                    pages.length
                ),
            ],
        });
    },
};
