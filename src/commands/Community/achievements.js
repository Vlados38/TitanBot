import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
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

function createProgressBar(value, total, size = 14) {
    if (!total) {
        return '░'.repeat(size);
    }

    const percentage = Math.max(
        0,
        Math.min(
            100,
            (value / total) * 100
        )
    );

    const filled = Math.round(
        (percentage / 100) * size
    );

    return (
        '█'.repeat(filled) +
        '░'.repeat(size - filled)
    );
}

function getRarityInfo(achievement) {
    const rarities = {
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
    };

    return (
        rarities[achievement.rarity] ||
        rarities.common
    );
}

function getCategoryInfo(achievement) {
    const categories = {
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
    };

    return (
        categories[achievement.category] || {
            name: 'Другое',
            emoji: '📁',
        }
    );
}

function formatAchievement(achievement) {
    const rarity =
        getRarityInfo(achievement);

    const category =
        getCategoryInfo(achievement);

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
        ordered.push(
            ...achievements
        );
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
    const achievements =
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
            .setTitle(
                '🏆 Коллекция достижений'
            )
            .setDescription(
                [
                    `**Прогресс:** ${unlocked}/${total} • **${percentage}%**`,
                    `\`${createProgressBar(
                        unlocked,
                        total
                    )}\``,
                    '',
                    `🏆 Получено: **${unlocked}**`,
                    `🔒 Осталось: **${remaining}**`,
                ].join('\n')
            );

    for (
        const achievement of
            achievements
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
    userId,
    page,
    totalPages
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `achievements:prev:${userId}:${page}`
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
                    `achievements:page:${userId}:${page}`
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
                    `achievements:next:${userId}:${page}`
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
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription(
            'Посмотреть достижения'
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription(
                    'Пользователь'
                )
                .setRequired(false)
        ),

    async execute(
        interaction,
        guildConfig,
        client
    ) {
        if (!interaction.guildId) {
            return interaction.reply({
                content:
                    '❌ Команда доступна только на сервере.',
                flags:
                    MessageFlags.Ephemeral,
            });
        }

        const targetUser =
            interaction.options.getUser(
                'user'
            ) || interaction.user;

        await interaction.deferReply();

        const profile =
            await getUserAchievementProfile(
                client,
                interaction.guildId,
                targetUser.id
            );

        const pages =
            buildPages(profile);

        if (!pages.length) {
            return interaction.editReply({
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
            });
        }

        await interaction.editReply({
            embeds: [
                buildEmbed({
                    targetUser,
                    profile,
                    pages,
                    page: 0,
                }),
            ],

            components: [
                buildButtons(
                    targetUser.id,
                    0,
                    pages.length
                ),
            ],
        });
    },
};
