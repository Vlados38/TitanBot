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


/* =========================================================
 * HELPERS
 * ======================================================= */

function chunk(array, size) {
    const result = [];

    for (let i = 0; i < array.length; i += size) {
        result.push(
            array.slice(i, i + size)
        );
    }

    return result;
}


function createProgressBar(
    value,
    total,
    size = 20
) {
    if (!total) {
        return '░'.repeat(size);
    }

    const percentage =
        Math.max(
            0,
            Math.min(
                100,
                (value / total) * 100
            )
        );

    const filled =
        Math.round(
            (percentage / 100) * size
        );

    return (
        '█'.repeat(filled) +
        '░'.repeat(size - filled)
    );
}


/* =========================================================
 * RARITY
 * ======================================================= */

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


/* =========================================================
 * CATEGORY
 * ======================================================= */

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


/* =========================================================
 * ACHIEVEMENT DISPLAY
 * ======================================================= */

function formatAchievement(
    achievement
) {
    const rarity =
        getRarityInfo(
            achievement
        );

    /*
     * UNLOCKED
     */

    if (achievement.unlocked) {
        return [
            `${achievement.emoji || '🏆'} **${achievement.name}**`,
            `${rarity.emoji} ${rarity.name}`,
            '✅ Получено',
        ].join('\n');
    }


    /*
     * SECRET
     */

    if (achievement.secret) {
        return [
            '❔ **Секретное достижение**',
            `${rarity.emoji} ${rarity.name}`,
            '🔒 Условия скрыты',
        ].join('\n');
    }


    /*
     * LOCKED
     */

    return [
        `🔒 **${achievement.name}**`,
        `${rarity.emoji} ${rarity.name}`,
        'Не получено',
    ].join('\n');
}


/* =========================================================
 * BUILD PAGES
 * ======================================================= */

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


/* =========================================================
 * BUILD EMBED
 * ======================================================= */

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


    /*
     * Split achievements into
     * two columns.
     */

    const left = [];
    const right = [];


    achievements.forEach(
        (achievement, index) => {
            const formatted =
                formatAchievement(
                    achievement
                );

            if (index % 2 === 0) {
                left.push(
                    formatted
                );
            } else {
                right.push(
                    formatted
                );
            }
        }
    );


    const embed =
        new EmbedBuilder()
            .setColor('#5865F2')


            /*
             * Header
             */

            .setAuthor({
                name:
                    targetUser.username,
                iconURL:
                    targetUser.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })


            /*
             * Title
             */

            .setTitle(
                '🏆 Достижения'
            )


            /*
             * Progress
             */

            .setDescription(
                [
                    'Коллекция наград',
                    '',
                    `**${unlocked} / ${total}** достижений получено`,
                    `\`${createProgressBar(
                        unlocked,
                        total
                    )}\` **${percentage}%**`,
                ].join('\n')
            );


    /*
     * Achievements
     */

    embed.addFields(
        {
            name:
                '✨ Достижения',
            value:
                left.length
                    ? left.join('\n\n')
                    : 'Нет достижений',
            inline: true,
        },

        {
            name:
                '\u200B',
            value:
                right.length
                    ? right.join('\n\n')
                    : '\u200B',
            inline: true,
        }
    );


    /*
     * Summary
     */

    embed.addFields({
        name:
            '\u200B',
        value: [
            `🏆 Получено: **${unlocked}**`,
            `🔒 Осталось: **${remaining}**`,
        ].join('  •  '),
        inline: false,
    });


    /*
     * Footer
     */

    embed.setFooter({
        text:
            `Страница ${page + 1}/${pages.length} • TitanBot`,
    });


    return embed;
}


/* =========================================================
 * BUTTONS
 * ======================================================= */

function buildButtons(
    userId,
    page,
    totalPages
) {
    return new ActionRowBuilder()
        .addComponents(

            /*
             * PREVIOUS
             */

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


            /*
             * PAGE
             */

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


            /*
             * NEXT
             */

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


/* =========================================================
 * COMMAND
 * ======================================================= */

export default {
    data:
        new SlashCommandBuilder()
            .setName(
                'achievements'
            )
            .setDescription(
                'Посмотреть достижения'
            )
            .addUserOption(
                option =>
                    option
                        .setName(
                            'user'
                        )
                        .setDescription(
                            'Пользователь'
                        )
                        .setRequired(
                            false
                        )
            )
            .setDMPermission(
                false
            ),


    category:
        'Community',


    async execute(
        interaction,
        guildConfig,
        client
    ) {
        /*
         * SERVER CHECK
         */

        if (!interaction.guildId) {
            return interaction.reply({
                content:
                    '❌ Команда доступна только на сервере.',

                flags:
                    MessageFlags.Ephemeral,
            });
        }


        /*
         * TARGET USER
         */

        const targetUser =
            interaction.options.getUser(
                'user'
            ) ||
            interaction.user;


        await interaction.deferReply();


        try {
            /*
             * LOAD ACHIEVEMENTS
             */

            const profile =
                await getUserAchievementProfile(
                    client,
                    interaction.guildId,
                    targetUser.id
                );


            /*
             * BUILD PAGES
             */

            const pages =
                buildPages(
                    profile
                );


            /*
             * EMPTY
             */

            if (!pages.length) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                '#5865F2'
                            )
                            .setAuthor({
                                name:
                                    targetUser.username,
                                iconURL:
                                    targetUser.displayAvatarURL({
                                        extension:
                                            'png',
                                        size:
                                            128,
                                    }),
                            })
                            .setTitle(
                                '🏆 Достижения'
                            )
                            .setDescription(
                                'На сервере пока нет доступных достижений.'
                            ),
                    ],
                });
            }


            /*
             * FIRST PAGE
             */

            return interaction.editReply({
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

        } catch (error) {
            console.error(
                '[ACHIEVEMENTS] Failed:',
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось загрузить достижения.',
            });
        }
    },
};
