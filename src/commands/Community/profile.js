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
    buildAchievementContext,
} from '../../services/achievements/achievementContext.js';

import {
    getAchievementProgress,
} from '../../services/achievements/achievementService.js';

const ACHIEVEMENTS_PER_PAGE = 5;

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
                targetUser.id
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

async function getProfileData({
    client,
    guild,
    member,
    user,
}) {
    /*
     * Основные данные профиля.
     *
     * Важно:
     * достижения загружаются отдельно ниже.
     * Ошибка achievement-системы больше не ломает /profile.
     */

    const [
        levelData,
        economyData,
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
    ]);

    const level = Number(levelData?.level) || 0;
    const xp = Number(levelData?.xp) || 0;
    const totalXp = Number(levelData?.totalXp) || 0;

    const nextLevel = level + 1;

    let nextLevelXp = 0;

    try {
        nextLevelXp = Number(
            getXpForLevel(nextLevel)
        ) || 0;
    } catch (error) {
        console.error(
            '[PROFILE] Failed to calculate next level XP:',
            error
        );
    }

    const progress = calculateProgress(
        xp,
        nextLevelXp
    );

    const wallet = Number(
        economyData?.wallet
    ) || 0;

    const bank = Number(
        economyData?.bank
    ) || 0;

    const totalBalance = wallet + bank;

    /*
     * -------------------------------------------------------
     * ACHIEVEMENTS
     * -------------------------------------------------------
     *
     * Здесь специально стоит отдельный try/catch.
     *
     * Если achievementService сейчас содержит ошибку,
     * профиль всё равно будет показываться.
     */

    let achievements = [];

    try {
        const achievementContext =
            await buildAchievementContext({
                client,
                guild,
                userId: user.id,
            });

        const result =
            getAchievementProgress(
                achievementContext
            );

        if (Array.isArray(result)) {
            achievements = result;
        }
    } catch (error) {
        console.error(
            `[PROFILE] Failed to load achievements for ${user.id}:`,
            error
        );

        achievements = [];
    }

    const unlockedAchievements =
        achievements.filter(
            (achievement) =>
                achievement?.unlocked === true
        );

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

        joinedAt:
            member.joinedTimestamp
                ? new Date(member.joinedTimestamp)
                : null,

        createdAt: user.createdAt,
    };
}

/* =========================================================
 * MAIN PROFILE EMBED
 * ======================================================= */

function buildProfileEmbed(data) {
    const {
        user,
        member,

        level,
        xp,
        totalXp,

        nextLevelXp,
        progress,

        totalBalance,
        wallet,
        bank,

        achievements,
        unlockedAchievements,

        joinedAt,
    } = data;

    const safeAchievements =
        Array.isArray(achievements)
            ? achievements
            : [];

    const safeUnlockedAchievements =
        Array.isArray(unlockedAchievements)
            ? unlockedAchievements
            : [];

    const accentColor =
        getProfileColor(level);

    const progressBar =
        createPercentageProgressBar(
            progress,
            20
        );

    const badges =
        safeUnlockedAchievements
            .slice(0, 6)
            .map(
                (achievement) =>
                    achievement?.emoji || '🏅'
            )
            .join(' ') ||
        'Пока нет достижений';

    const achievementProgress =
        createProgressBar(
            safeUnlockedAchievements.length,
            safeAchievements.length,
            12
        );

    const achievementText =
        safeAchievements.length > 0
            ? `**${safeUnlockedAchievements.length} / ${safeAchievements.length}**`
            : '**0 / 0**';

    const embed =
        new EmbedBuilder()
            .setColor(accentColor)

            .setAuthor({
                name: member.displayName,
                iconURL: user.displayAvatarURL({
                    extension: 'png',
                    size: 128,
                }),
            })

            .setThumbnail(
                user.displayAvatarURL({
                    extension: 'png',
                    size: 256,
                })
            )

            .setDescription(
                [
                    `**@${user.username}**`,
                    '',
                    `✦ **LEVEL ${level}**`,
                    `${progressBar} **${progress}%**`,
                    `\`${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP\``,
                ].join('\n')
            )

            .addFields(
                {
                    name: '💰 Баланс',
                    value:
                        `**${formatMoney(totalBalance)}**`,
                    inline: true,
                },

                {
                    name: '🏆 Достижения',
                    value:
                        achievementText,
                    inline: true,
                },

                {
                    name: '⭐ Всего XP',
                    value:
                        `**${formatNumber(totalXp)}**`,
                    inline: true,
                },

                {
                    name: '💵 Кошелёк',
                    value:
                        formatMoney(wallet),
                    inline: true,
                },

                {
                    name: '🏦 Банк',
                    value:
                        formatMoney(bank),
                    inline: true,
                },

                {
                    name: '📅 На сервере',
                    value: joinedAt
                        ? `<t:${Math.floor(
                            joinedAt.getTime() / 1000
                        )}:R>`
                        : 'Неизвестно',
                    inline: true,
                },

                {
                    name: '🏅 Badges',
                    value:
                        `${badges}\n\n${achievementProgress}`,
                    inline: false,
                }
            )

            .setFooter({
                text:
                    `TitanBot • ${member.guild.name}`,
                iconURL:
                    member.guild.iconURL({
                        extension: 'png',
                        size: 64,
                    }) ||
                    undefined,
            })

            .setTimestamp();

    return embed;
}

/* =========================================================
 * PROFILE BUTTONS
 * ======================================================= */

function buildProfileButtons(
    targetUserId
) {
    const row =
        new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(
                `profile:badges:${targetUserId}:0`
            )
            .setLabel('Badges')
            .setEmoji('🏅')
            .setStyle(
                ButtonStyle.Secondary
            ),

        new ButtonBuilder()
            .setCustomId(
                `profile:stats:${targetUserId}`
            )
            .setLabel('Statistics')
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
    const user = data?.user;

    const achievements =
        Array.isArray(data?.achievements)
            ? data.achievements
            : [];

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                achievements.length /
                ACHIEVEMENTS_PER_PAGE
            )
        );

    const safePage =
        Math.min(
            Math.max(0, Number(page) || 0),
            totalPages - 1
        );

    const start =
        safePage *
        ACHIEVEMENTS_PER_PAGE;

    const currentAchievements =
        achievements.slice(
            start,
            start + ACHIEVEMENTS_PER_PAGE
        );

    const unlocked =
        achievements.filter(
            (achievement) =>
                achievement?.unlocked === true
        ).length;

    const description =
        currentAchievements
            .map((achievement) => {
                if (achievement?.unlocked) {
                    return [
                        `${achievement.emoji || '🏅'} **${achievement.name || 'Достижение'}**`,
                        `> ${achievement.description || 'Достижение разблокировано.'}`,
                        '> ✅ **Открыто**',
                    ].join('\n');
                }

                if (achievement?.secret) {
                    return [
                        '🔒 **Скрытое достижение**',
                        '> Выполните особое условие, чтобы узнать больше.',
                    ].join('\n');
                }

                return [
                    `${achievement?.emoji || '🏅'} **${achievement?.name || 'Достижение'}**`,
                    `> ${achievement?.description || 'Описание отсутствует.'}`,
                    `> 🔒 ${achievement?.requirementText || 'Условие скрыто.'}`,
                ].join('\n');
            })
            .join('\n\n');

    const embed =
        new EmbedBuilder()
            .setColor('#A855F7')

            .setAuthor({
                name:
                    `${user?.username || 'Пользователь'} • Achievements`,
                iconURL:
                    user?.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })

            .setTitle('🏅 Коллекция достижений')

            .setDescription(
                description ||
                'Пока нет доступных достижений.'
            )

            .addFields({
                name: 'Прогресс',
                value:
                    `**${unlocked} / ${achievements.length}** открыто\n` +
                    `\`${createProgressBar(
                        unlocked,
                        achievements.length,
                        20
                    )}\``,
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
        level,
        totalXp,
        totalBalance,
        wallet,
        bank,
        unlockedAchievements,
        achievements,
        joinedAt,
    } = data;

    const safeAchievements =
        Array.isArray(achievements)
            ? achievements
            : [];

    const safeUnlockedAchievements =
        Array.isArray(unlockedAchievements)
            ? unlockedAchievements
            : [];

    const embed =
        new EmbedBuilder()
            .setColor('#5865F2')

            .setAuthor({
                name:
                    `${user.username} • Statistics`,
                iconURL:
                    user.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })

            .setTitle('📊 Статистика пользователя')

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
                        `**${safeUnlockedAchievements.length} / ${safeAchievements.length}**`,
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
                        formatMoney(wallet),
                    inline: true,
                },

                {
                    name: '🏦 Банк',
                    value:
                        formatMoney(bank),
                    inline: true,
                },

                {
                    name: '📅 Дата вступления',
                    value: joinedAt
                        ? `<t:${Math.floor(
                            joinedAt.getTime() / 1000
                        )}:D>`
                        : 'Неизвестно',
                    inline: false,
                }
            )

            .setFooter({
                text: 'TitanBot • Statistics',
            });

    return embed;
}

/* =========================================================
 * HELPERS
 * ======================================================= */

function calculateProgress(
    current,
    required
) {
    if (!required || required <= 0) {
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

function createPercentageProgressBar(
    percentage,
    size = 20
) {
    const safePercentage =
        Math.min(
            100,
            Math.max(
                0,
                Number(percentage) || 0
            )
        );

    const filled =
        Math.round(
            (safePercentage / 100) *
            size
        );

    const empty =
        size - filled;

    return (
        '█'.repeat(filled) +
        '░'.repeat(empty)
    );
}

function createProgressBar(
    current,
    total,
    size = 20
) {
    if (!total || total <= 0) {
        return '░'.repeat(size);
    }

    const percentage =
        Math.min(
            1,
            Math.max(
                0,
                current / total
            )
        );

    const filled =
        Math.round(
            percentage * size
        );

    const empty =
        size - filled;

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
    return `💰 ${formatNumber(value)}`;
}

function getProfileColor(level) {
    if (level >= 100) {
        return 0xF1C40F;
    }

    if (level >= 50) {
        return 0x9B59B6;
    }

    if (level >= 25) {
        return 0x3498DB;
    }

    if (level >= 10) {
        return 0x2ECC71;
    }

    return 0x5865F2;
}
