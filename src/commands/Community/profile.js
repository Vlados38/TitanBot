import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getUserLevelData,
    getXpForLevel,
} from '../../services/leveling/leveling.js';

import { getEconomyData } from '../../utils/economy.js';

import {
    getUserAchievementProfile,
} from '../../services/achievements/achievementService.js';

const ACHIEVEMENTS_PER_PAGE = 5;

const COLORS = Object.freeze({
    primary: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    purple: 0x9B59B6,
    gold: 0xF1C40F,
    dark: 0x2B2D31,
});

const RARITY_INFO = Object.freeze({
    common: {
        name: 'Обычное',
        emoji: '⚪',
        color: 0x95A5A6,
    },

    uncommon: {
        name: 'Необычное',
        emoji: '🟢',
        color: 0x2ECC71,
    },

    rare: {
        name: 'Редкое',
        emoji: '🔵',
        color: 0x3498DB,
    },

    epic: {
        name: 'Эпическое',
        emoji: '🟣',
        color: 0x9B59B6,
    },

    legendary: {
        name: 'Легендарное',
        emoji: '🟡',
        color: 0xF1C40F,
    },
});

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Посмотреть профиль пользователя')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Пользователь, чей профиль нужно посмотреть')
                .setRequired(false)
        )
        .setDMPermission(false),

    category: 'Community',

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const targetUser =
            interaction.options.getUser('user') ?? interaction.user;

        const guild = interaction.guild;

        if (!guild) {
            return interaction.editReply({
                content: '❌ Эта команда доступна только на сервере.',
            });
        }

        const member = await guild.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!member) {
            return interaction.editReply({
                content: '❌ Пользователь не найден на этом сервере.',
            });
        }

        try {
            const profileData = await getProfileData({
                client,
                guild,
                member,
                user: targetUser,
            });

            const embed = buildProfileEmbed(profileData);

            const components = buildProfileButtons(
                targetUser.id,
                interaction.user.id
            );

            return interaction.editReply({
                embeds: [embed],
                components,
            });
        } catch (error) {
            console.error(
                `[PROFILE] Failed to load profile for ${targetUser.id}:`,
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось загрузить профиль. Попробуйте ещё раз позже.',
            });
        }
    },
};

/* =========================================================
 * PROFILE DATA
 * ======================================================= */

export async function getProfileData({
    client,
    guild,
    member,
    user,
}) {
    const [
        levelData,
        economyData,
        achievementProfile,
    ] = await Promise.all([
        getUserLevelData(
            client,
            guild.id,
            user.id
        ),

        getEconomyData(
            client,
            guild.id,
            user.id
        ),

        getUserAchievementProfile(
            client,
            guild.id,
            user.id
        ),
    ]);

    const level =
        Math.max(
            0,
            Number(levelData?.level) || 0
        );

    const xp =
        Math.max(
            0,
            Number(levelData?.xp) || 0
        );

    const totalXp =
        Math.max(
            0,
            Number(levelData?.totalXp) || 0
        );

    const nextLevel = level + 1;

    let nextLevelXp = 0;

    try {
        nextLevelXp =
            Number(
                getXpForLevel(nextLevel)
            ) || 0;
    } catch {
        nextLevelXp = 0;
    }

    const progress =
        calculateProgress(
            xp,
            nextLevelXp
        );

    const wallet =
        Math.max(
            0,
            Number(economyData?.wallet) || 0
        );

    const bank =
        Math.max(
            0,
            Number(economyData?.bank) || 0
        );

    const totalBalance =
        wallet + bank;

    const achievements =
        Array.isArray(
            achievementProfile?.achievements
        )
            ? achievementProfile.achievements
            : [];

    const unlockedAchievements =
        achievements.filter(
            (achievement) =>
                achievement?.unlocked
        );

    const recentAchievements =
        [...unlockedAchievements]
            .sort(
                (a, b) =>
                    Number(b.unlockedAt || 0) -
                    Number(a.unlockedAt || 0)
            )
            .slice(0, 5);

    return {
        user,
        member,

        level,
        xp,
        totalXp,

        nextLevel,
        nextLevelXp,
        progress,

        wallet,
        bank,
        totalBalance,

        achievements,
        unlockedAchievements,
        recentAchievements,

        achievementProgress:
            achievementProfile?.progress ?? {
                total: achievements.length,
                unlocked: unlockedAchievements.length,
                remaining: Math.max(
                    achievements.length -
                    unlockedAchievements.length,
                    0
                ),
                percentage:
                    achievements.length > 0
                        ? Math.round(
                            (
                                unlockedAchievements.length /
                                achievements.length
                            ) * 100
                        )
                        : 0,
            },

        joinedAt:
            member.joinedTimestamp
                ? new Date(member.joinedTimestamp)
                : null,

        createdAt:
            user.createdAt,
    };
}

/* =========================================================
 * MAIN PROFILE EMBED
 * ======================================================= */

export function buildProfileEmbed(data) {
    const {
        user,
        member,

        level,
        xp,
        totalXp,

        nextLevel,
        nextLevelXp,
        progress,

        totalBalance,
        wallet,
        bank,

        achievements,
        unlockedAchievements,
        recentAchievements,

        achievementProgress,

        joinedAt,
    } = data;

    const accentColor =
        getProfileColor(level);

    const progressBar =
        createProgressBar(
            progress,
            100,
            18
        );

    const achievementBar =
        createProgressBar(
            unlockedAchievements.length,
            achievements.length,
            12
        );

    const avatar =
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        });

    const guildIcon =
        member.guild.iconURL({
            extension: 'png',
            size: 64,
        });

    const badges =
        unlockedAchievements
            .slice(0, 8)
            .map(
                (achievement) =>
                    achievement?.emoji || '🏅'
            )
            .join(' ') ||
        'Пока нет достижений';

    const recentText =
        recentAchievements.length > 0
            ? recentAchievements
                .map((achievement) => {
                    const rarity =
                        getRarityInfo(
                            achievement.rarity
                        );

                    return `${achievement.emoji || '🏅'} **${achievement.name}** ${rarity.emoji}`;
                })
                .join('\n')
            : 'Пока нет полученных достижений.';

    const achievementPercentage =
        Number(
            achievementProgress?.percentage
        ) || 0;

    const memberSince =
        joinedAt
            ? `<t:${Math.floor(
                joinedAt.getTime() / 1000
            )}:R>`
            : 'Неизвестно';

    const embed =
        new EmbedBuilder()
            .setColor(accentColor)

            .setAuthor({
                name:
                    `${member.displayName}`,
                iconURL: avatar,
            })

            .setThumbnail(avatar)

            .setDescription(
                [
                    `### ${getLevelTitle(level)}`,
                    `**@${user.username}**`,
                    '',
                    `**Уровень ${level}**  →  **${nextLevel}**`,
                    `${progressBar} **${progress}%**`,
                    `\`${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP\``,
                ].join('\n')
            )

            .addFields(
                {
                    name: '💰 Капитал',
                    value:
                        `**${formatMoney(totalBalance)}**`,
                    inline: true,
                },

                {
                    name: '🏆 Достижения',
                    value:
                        `**${unlockedAchievements.length} / ${achievements.length}**\n` +
                        `${achievementBar} ${achievementPercentage}%`,
                    inline: true,
                },

                {
                    name: '⚡ Всего XP',
                    value:
                        `**${formatNumber(totalXp)}**`,
                    inline: true,
                },

                {
                    name: '💵 Кошелёк',
                    value:
                        `**${formatMoney(wallet)}**`,
                    inline: true,
                },

                {
                    name: '🏦 Банк',
                    value:
                        `**${formatMoney(bank)}**`,
                    inline: true,
                },

                {
                    name: '📅 На сервере',
                    value:
                        memberSince,
                    inline: true,
                },

                {
                    name: '🏅 Значки',
                    value:
                        badges,
                    inline: false,
                },

                {
                    name: '✨ Последние достижения',
                    value:
                        recentText,
                    inline: false,
                }
            )

            .setFooter({
                text:
                    `TitanBot • ${member.guild.name}`,
                iconURL:
                    guildIcon ||
                    undefined,
            })

            .setTimestamp();

    return embed;
}

/* =========================================================
 * PROFILE BUTTONS
 * ======================================================= */

export function buildProfileButtons(
    targetUserId,
    viewerUserId
) {
    const row =
        new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(
                `profile:badges:${targetUserId}:0`
            )
            .setLabel('Достижения')
            .setEmoji('🏅')
            .setStyle(
                ButtonStyle.Secondary
            ),

        new ButtonBuilder()
            .setCustomId(
                `profile:stats:${targetUserId}`
            )
            .setLabel('Статистика')
            .setEmoji('📊')
            .setStyle(
                ButtonStyle.Secondary
            )
    );

    return [row];
}

/* =========================================================
 * BADGES PAGE
 * ======================================================= */

export function buildBadgesPage(
    data,
    page = 0
) {
    const {
        user,
        achievements,
    } = data;

    const safeAchievements =
        Array.isArray(achievements)
            ? achievements
            : [];

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                safeAchievements.length /
                ACHIEVEMENTS_PER_PAGE
            )
        );

    const safePage =
        Math.min(
            Math.max(
                0,
                Number(page) || 0
            ),
            totalPages - 1
        );

    const start =
        safePage *
        ACHIEVEMENTS_PER_PAGE;

    const currentAchievements =
        safeAchievements.slice(
            start,
            start + ACHIEVEMENTS_PER_PAGE
        );

    const unlocked =
        safeAchievements.filter(
            (achievement) =>
                achievement?.unlocked
        ).length;

    const description =
        currentAchievements
            .map((achievement) => {
                const isSecret =
                    Boolean(
                        achievement.secret ||
                        achievement.hidden
                    );

                if (
                    !achievement.unlocked &&
                    isSecret
                ) {
                    return [
                        '🔒 **Секретное достижение**',
                        '> Выполните особое условие, чтобы открыть его.',
                    ].join('\n');
                }

                const rarity =
                    getRarityInfo(
                        achievement.rarity
                    );

                if (achievement.unlocked) {
                    return [
                        `${achievement.emoji || '🏅'} **${achievement.name}**`,
                        `${rarity.emoji} ${rarity.name}`,
                        `> ${achievement.description}`,
                        `> ✅ **Получено**`,
                        achievement.unlockedAt
                            ? `> <t:${Math.floor(
                                Number(
                                    achievement.unlockedAt
                                ) / 1000
                            )}:d>`
                            : '',
                    ]
                        .filter(Boolean)
                        .join('\n');
                }

                return [
                    `${achievement.emoji || '🏅'} **${achievement.name}**`,
                    `${rarity.emoji} ${rarity.name}`,
                    `> ${achievement.description}`,
                    `> 🔒 ${achievement.requirementText ?? getRequirementText(achievement)}`,
                ].join('\n');
            })
            .join('\n\n');

    const progress =
        safeAchievements.length > 0
            ? Math.round(
                (unlocked /
                    safeAchievements.length) *
                100
            )
            : 0;

    const embed =
        new EmbedBuilder()
            .setColor(COLORS.purple)

            .setAuthor({
                name:
                    `${user.username} • Достижения`,
                iconURL:
                    user.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })

            .setTitle('🏆 Коллекция достижений')

            .setDescription(
                description ||
                'Пока нет доступных достижений.'
            )

            .addFields({
                name: '📈 Общий прогресс',
                value:
                    `**${unlocked} / ${safeAchievements.length}** открыто • **${progress}%**\n` +
                    `${createProgressBar(
                        unlocked,
                        safeAchievements.length,
                        20
                    )}`,
                inline: false,
            })

            .setFooter({
                text:
                    `Страница ${safePage + 1}/${totalPages} • TitanBot`,
            });

    return {
        embed,
        page: safePage,
        totalPages,
    };
}

/* =========================================================
 * STATISTICS PAGE
 * ======================================================= */

export function buildStatisticsPage(
    data
) {
    const {
        user,
        member,

        level,
        xp,
        nextLevelXp,
        progress,

        totalXp,
        totalBalance,
        wallet,
        bank,

        unlockedAchievements,
        achievements,

        joinedAt,
        createdAt,
    } = data;

    const embed =
        new EmbedBuilder()
            .setColor(COLORS.primary)

            .setAuthor({
                name:
                    `${user.username} • Статистика`,
                iconURL:
                    user.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })

            .setTitle('📊 Статистика пользователя')

            .setDescription(
                [
                    `**Уровень ${level}**`,
                    `${createProgressBar(
                        progress,
                        100,
                        18
                    )} **${progress}%**`,
                    `\`${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP\``,
                ].join('\n')
            )

            .addFields(
                {
                    name: '⭐ Уровень',
                    value:
                        `**${level}**`,
                    inline: true,
                },

                {
                    name: '⚡ Всего XP',
                    value:
                        `**${formatNumber(totalXp)}**`,
                    inline: true,
                },

                {
                    name: '🏅 Достижения',
                    value:
                        `**${unlockedAchievements.length} / ${achievements.length}**`,
                    inline: true,
                },

                {
                    name: '💰 Общий капитал',
                    value:
                        `**${formatMoney(totalBalance)}**`,
                    inline: true,
                },

                {
                    name: '💵 Кошелёк',
                    value:
                        `**${formatMoney(wallet)}**`,
                    inline: true,
                },

                {
                    name: '🏦 Банк',
                    value:
                        `**${formatMoney(bank)}**`,
                    inline: true,
                },

                {
                    name: '📅 На сервере',
                    value:
                        joinedAt
                            ? `<t:${Math.floor(
                                joinedAt.getTime() / 1000
                            )}:D>`
                            : 'Неизвестно',
                    inline: true,
                },

                {
                    name: '🗓️ Аккаунт Discord',
                    value:
                        createdAt
                            ? `<t:${Math.floor(
                                createdAt.getTime() / 1000
                            )}:D>`
                            : 'Неизвестно',
                    inline: true,
                },

                {
                    name: '👤 Участник',
                    value:
                        member.displayName,
                    inline: true,
                }
            )

            .setFooter({
                text:
                    'TitanBot • Statistics',
            })

            .setTimestamp();

    return embed;
}

/* =========================================================
 * HELPERS
 * ======================================================= */

function calculateProgress(
    current,
    required
) {
    if (
        !Number.isFinite(required) ||
        required <= 0
    ) {
        return 100;
    }

    return Math.min(
        100,
        Math.max(
            0,
            Math.floor(
                (current / required) *
                100
            )
        )
    );
}

function createProgressBar(
    current,
    total,
    size = 20
) {
    if (
        !Number.isFinite(
            Number(total)
        ) ||
        Number(total) <= 0
    ) {
        return '░'.repeat(size);
    }

    const percentage =
        Math.min(
            1,
            Math.max(
                0,
                Number(current || 0) /
                Number(total)
            )
        );

    const filled =
        Math.round(
            percentage * size
        );

    const empty =
        Math.max(
            0,
            size - filled
        );

    return (
        '█'.repeat(filled) +
        '░'.repeat(empty)
    );
}

function formatNumber(value) {
    return Number(
        value || 0
    ).toLocaleString('ru-RU');
}

function formatMoney(value) {
    return `$${formatNumber(value)}`;
}

function getProfileColor(level) {
    if (level >= 100) {
        return COLORS.gold;
    }

    if (level >= 50) {
        return COLORS.purple;
    }

    if (level >= 25) {
        return 0x3498DB;
    }

    if (level >= 10) {
        return COLORS.success;
    }

    return COLORS.primary;
}

function getLevelTitle(level) {
    if (level >= 100) {
        return '👑 Легенда';
    }

    if (level >= 75) {
        return '💎 Элита';
    }

    if (level >= 50) {
        return '🔥 Ветеран';
    }

    if (level >= 25) {
        return '⚔️ Опытный игрок';
    }

    if (level >= 10) {
        return '⭐ Опытный участник';
    }

    if (level >= 5) {
        return '🌟 Новичок';
    }

    return '🌱 Начинающий участник';
}

function getRarityInfo(rarity) {
    return (
        RARITY_INFO[rarity] ||
        RARITY_INFO.common
    );
}

function getRequirementText(achievement) {
    const requirement =
        achievement?.requirement;

    if (!requirement) {
        return 'Особое условие';
    }

    switch (requirement.type) {
        case 'level':
            return `Достичь ${requirement.value} уровня`;

        case 'totalXp':
            return `Получить ${formatNumber(requirement.value)} XP`;

        case 'balance':
            return `Накопить ${formatNumber(requirement.value)} монет`;

        case 'robCount':
            return `Совершить ${formatNumber(requirement.value)} ограблений`;

        case 'daysOnServer':
            return `Провести ${requirement.value} дней на сервере`;

        case 'serverBooster':
            return 'Бустить сервер';

        case 'earlyMember':
            return 'Быть одним из первых участников';

        default:
            return 'Выполнить особое условие';
    }
}
