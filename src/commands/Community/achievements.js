import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

import {
    getUserAchievementProfile,
    getAchievementRarity,
    getAchievementCategory,
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

function createProgressBar(value, total, size = 12) {
    if (!total) {
        return '░'.repeat(size);
    }

    const percentage = Math.max(
        0,
        Math.min(100, (value / total) * 100)
    );

    const filled = Math.round(
        (percentage / 100) * size
    );

    return (
        '█'.repeat(filled) +
        '░'.repeat(size - filled)
    );
}

function formatAchievement(achievement) {
    const rarity = getAchievementRarity(
        achievement.rarity
    );

    const category = getAchievementCategory(
        achievement.category
    );

    if (achievement.unlocked) {
        return [
            `${achievement.emoji || '🏆'} **${achievement.name}**`,
            `${rarity.emoji} ${rarity.name} • ${category?.emoji || '📁'} ${category?.name || 'Другое'}`,
            achievement.description ||
                'Достижение разблокировано.',
            achievement.unlockedAt
                ? `> Получено: <t:${Math.floor(
                      achievement.unlockedAt / 1000
                  )}:d>`
                : '',
        ]
            .filter(Boolean)
            .join('\n');
    }

    if (achievement.secret) {
        return [
            '❔ **Секретное достижение**',
            `${rarity.emoji} ${rarity.name}`,
            'Условия этого достижения скрыты.',
        ].join('\n');
    }

    return [
        '🔒 **' + achievement.name + '**',
        `${rarity.emoji} ${rarity.name} • ${category?.emoji || '📁'} ${category?.name || 'Другое'}`,
        achievement.description ||
            'Достижение ещё не получено.',
        achievement.requirementText
            ? `> Требование: ${achievement.requirementText}`
            : '',
    ]
        .filter(Boolean)
        .join('\n');
}

function buildPages(profile) {
    const grouped = new Map();

    for (const category of CATEGORY_ORDER) {
        grouped.set(category, []);
    }

    for (const achievement of profile.achievements) {
        if (!grouped.has(achievement.category)) {
            grouped.set(achievement.category, []);
        }

        grouped
            .get(achievement.category)
            .push(achievement);
    }

    const ordered = [];

    for (const [, achievements] of grouped) {
        ordered.push(...achievements);
    }

    return chunk(ordered, PAGE_SIZE);
}

function buildEmbed({
    interaction,
    profile,
    pages,
    page,
}) {
    const currentPage = pages[page] || [];

    const {
        total,
        unlocked,
        remaining,
        percentage,
    } = profile.progress;

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({
            name: 'Система достижений',
            iconURL: interaction.user.displayAvatarURL({
                extension: 'png',
                size: 128,
            }),
        })
        .setTitle('🏆 Достижения')
        .setDescription(
            [
                `### ${interaction.user}`,
                '',
                `**Прогресс:** ${unlocked}/${total} • **${percentage}%**`,
                `\`${createProgressBar(unlocked, total)}\``,
                '',
                `🏆 Получено: **${unlocked}**`,
                `🔒 Осталось: **${remaining}**`,
            ].join('\n')
        );

    for (const achievement of currentPage) {
        embed.addFields({
            name: '\u200B',
            value: formatAchievement(achievement),
            inline: false,
        });
    }

    embed.setFooter({
        text: `Страница ${page + 1}/${pages.length} • TitanBot`,
    });

    embed.setTimestamp();

    return embed;
}

function buildButtons(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`achievements:prev:${page}`)
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),

        new ButtonBuilder()
            .setCustomId(`achievements:page:${page}`)
            .setLabel(`${page + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(`achievements:next:${page}`)
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
}

async function renderAchievements(
    interaction,
    profile,
    pages,
    page
) {
    return {
        embeds: [
            buildEmbed({
                interaction,
                profile,
                pages,
                page,
            }),
        ],
        components: [
            buildButtons(
                page,
                pages.length
            ),
        ],
    };
}

export default {
    name: 'achievements',
    category: 'Community',

    async execute(interaction, guildConfig, client) {
        const targetUser =
            interaction.options?.getUser?.('user') ||
            interaction.user;

        if (!interaction.guildId) {
            return interaction.reply({
                content:
                    '❌ Команда доступна только на сервере.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        const profile =
            await getUserAchievementProfile(
                client,
                interaction.guildId,
                targetUser.id
            );

        const pages = buildPages(profile);

        if (!pages.length) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🏆 Достижения')
                        .setDescription(
                            'На сервере пока нет доступных достижений.'
                        ),
                ],
                components: [],
            });
        }

        let currentPage = 0;

        const message =
            await interaction.editReply(
                await renderAchievements(
                    {
                        ...interaction,
                        user: targetUser,
                    },
                    profile,
                    pages,
                    currentPage
                )
            );

        const collector =
            message.createMessageComponentCollector({
                time: 10 * 60 * 1000,
            });

        collector.on('collect', async buttonInteraction => {
            if (
                buttonInteraction.user.id !==
                interaction.user.id
            ) {
                await buttonInteraction.reply({
                    content:
                        '❌ Эта панель принадлежит другому пользователю.',
                    flags: MessageFlags.Ephemeral,
                });

                return;
            }

            const [, action, pageValue] =
                buttonInteraction.customId.split(':');

            if (action === 'prev') {
                currentPage = Math.max(
                    0,
                    currentPage - 1
                );
            }

            if (action === 'next') {
                currentPage = Math.min(
                    pages.length - 1,
                    currentPage + 1
                );
            }

            await buttonInteraction.update(
                await renderAchievements(
                    {
                        ...interaction,
                        user: targetUser,
                    },
                    profile,
                    pages,
                    currentPage
                )
            );
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({
                    components: [
                        buildButtons(
                            currentPage,
                            pages.length
                        ),
                    ],
                });
            } catch {
                // Сообщение могло быть удалено.
            }
        });
    },
};
