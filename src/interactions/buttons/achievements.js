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

function chunk(array, size) {
    const result = [];

    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }

    return result;
}

function progressBar(
    value,
    total,
    size = 14
) {
    if (!total) {
        return '░'.repeat(size);
    }

    const percentage =
        Math.max(
            0,
            Math.min(
                100,
                value / total * 100
            )
        );

    const filled =
        Math.round(
            percentage / 100 * size
        );

    return (
        '█'.repeat(filled) +
        '░'.repeat(size - filled)
    );
}

function rarityInfo(rarity) {
    return {
        common: {
            name: 'Обычное',
            emoji: '⚪',
        },
        uncommon: {
            name: 'Необычное',
            emoji: '🟢',
        },
        rare: {
            name: 'Редкое',
            emoji: '🔵',
        },
        epic: {
            name: 'Эпическое',
            emoji: '🟣',
        },
        legendary: {
            name: 'Легендарное',
            emoji: '🟡',
        },
    }[rarity] || {
        name: 'Обычное',
        emoji: '⚪',
    };
}

function categoryInfo(category) {
    return {
        progression: {
            name: 'Прогресс',
            emoji: '📈',
        },
        activity: {
            name: 'Активность',
            emoji: '⚡',
        },
        economy: {
            name: 'Экономика',
            emoji: '💰',
        },
        social: {
            name: 'Общение',
            emoji: '💬',
        },
        special: {
            name: 'Особые',
            emoji: '✨',
        },
    }[category] || {
        name: 'Другое',
        emoji: '📁',
    };
}

function formatAchievement(
    achievement
) {
    const rarity =
        rarityInfo(
            achievement.rarity
        );

    const category =
        categoryInfo(
            achievement.category
        );

    if (achievement.unlocked) {
        return [
            `${achievement.emoji || '🏆'} **${achievement.name}**`,
            `${rarity.emoji} ${rarity.name} • ${category.emoji} ${category.name}`,
            achievement.description ||
                'Достижение разблокировано.',
            achievement.unlockedAt
                ? `> Получено <t:${Math.floor(
                      achievement.unlockedAt / 1000
                  )}:R>`
                : null,
        ]
            .filter(Boolean)
            .join('\n');
    }

    if (achievement.secret) {
        return [
            '❔ **Секретное достижение**',
            `${rarity.emoji} ${rarity.name} • ${category.emoji} ${category.name}`,
            'Условия этого достижения скрыты.',
        ].join('\n');
    }

    return [
        `🔒 **${achievement.name}**`,
        `${rarity.emoji} ${rarity.name} • ${category.emoji} ${category.name}`,
        achievement.description ||
            'Достижение ещё не получено.',
        achievement.requirementText
            ? `> Требование: ${achievement.requirementText}`
            : null,
    ]
        .filter(Boolean)
        .join('\n');
}

function buildPages(profile) {
    const grouped =
        new Map(
            CATEGORY_ORDER.map(
                category => [
                    category,
                    [],
                ]
            )
        );

    for (
        const achievement of
            profile.achievements
    ) {
        if (!grouped.has(achievement.category)) {
            grouped.set(
                achievement.category,
                []
            );
        }

        grouped
            .get(achievement.category)
            .push(achievement);
    }

    const ordered = [];

    for (
        const achievements of
            grouped.values()
    ) {
        ordered.push(...achievements);
    }

    return chunk(
        ordered,
        PAGE_SIZE
    );
}

function buildEmbed({
    targetUser,
    profile,
    pages,
    page,
}) {
    const current =
        pages[page] || [];

    const {
        total,
        unlocked,
        remaining,
        percentage,
    } = profile.progress;

    const embed =
        new EmbedBuilder()
            .setColor('#5865F2')
            .setAuthor({
                name:
                    `Достижения • ${targetUser.username}`,
                iconURL:
                    targetUser.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })
            .setTitle('🏆 Коллекция достижений')
            .setDescription(
                [
                    `**Прогресс:** ${unlocked}/${total} • **${percentage}%**`,
                    `\`${progressBar(
                        unlocked,
                        total
                    )}\``,
                    '',
                    `🏆 Получено: **${unlocked}**`,
                    `🔒 Осталось: **${remaining}**`,
                ].join('\n')
            );

    for (
        const achievement of current
    ) {
        embed.addFields({
            name: '\u200B',
            value:
                formatAchievement(
                    achievement
                ),
            inline: false,
        });
    }

    embed.setFooter({
        text:
            `Страница ${page + 1}/${pages.length} • TitanBot`,
    });

    embed.setTimestamp();

    return embed;
}

function buildButtons(
    page,
    totalPages
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `achievements:prev:${page}`
                )
                .setEmoji('◀️')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    page <= 0
                ),

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
                .setDisabled(true),

            new ButtonBuilder()
                .setCustomId(
                    `achievements:next:${page}`
                )
                .setEmoji('▶️')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    page >= totalPages - 1
                )
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

        const oldPage =
            Number(args?.[1]);

        const page =
            Number.isFinite(oldPage)
                ? oldPage
                : 0;

        const userId =
            interaction.message?.embeds?.[0]
                ?.footer?.text
                ?.match(/user:(\d+)/)?.[1];

        /*
         * Если ID пользователя не был сохранён
         * в footer, используем автора сообщения.
         */
        const targetUserId =
            userId ||
            interaction.user.id;

        const targetUser =
            await client.users
                .fetch(targetUserId)
                .catch(() =>
                    interaction.user
                );

        const profile =
            await getUserAchievementProfile(
                client,
                interaction.guildId,
                targetUser.id
            );

        const pages =
            buildPages(profile);

        if (!pages.length) {
            return interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle(
                            '🏆 Достижения'
                        )
                        .setDescription(
                            'На сервере пока нет доступных достижений.'
                        ),
                ],
                components: [],
            });
        }

        let currentPage = page;

        if (action === 'prev') {
            currentPage--;
        }

        if (action === 'next') {
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

        await interaction.update({
            embeds: [
                buildEmbed({
                    targetUser,
                    profile,
                    pages,
                    page: currentPage,
                }),
            ],
            components: [
                buildButtons(
                    currentPage,
                    pages.length
                ),
            ],
        });
    },
};
