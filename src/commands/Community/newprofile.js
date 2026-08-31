import {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getUserLevelData,
    getXpForLevel,
} from '../../services/leveling/leveling.js';

import {
    getEconomyData,
} from '../../utils/economy.js';

import {
    getUserAchievementProfile,
} from '../../services/achievements/achievementService.js';

import {
    generateProfileCard,
} from '../../services/profile/profileCard.js';

import {
    generateAchievementCard,
} from '../../services/profile/achievementCard.js';

import {
    generateStatisticsCard,
} from '../../services/profile/statisticsCard.js';


export default {
    data: new SlashCommandBuilder()
        .setName('newprofile')
        .setDescription('Открыть карточку авантюриста')
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

        try {
            const profileData =
                await loadProfileData({
                    client,
                    guild,
                    member,
                    user: targetUser,
                });

            const image =
                await generateProfileCard(
                    profileData
                );

            const attachment =
                new AttachmentBuilder(
                    image,
                    {
                        name:
                            `newprofile-${targetUser.id}.png`,
                    }
                );

            const components =
                buildNavigationButtons(
                    targetUser.id,
                    'profile'
                );

            return interaction.editReply({
                files: [attachment],
                components,
            });

        } catch (error) {
            console.error(
                '[NEWPROFILE] Failed:',
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось создать карточку профиля.',
            });
        }
    },
};


/* =========================================================
 * LOAD PROFILE DATA
 * ======================================================= */

export async function loadProfileData({
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

    const nextLevel =
        level + 1;

    let nextLevelXp = 0;

    try {
        nextLevelXp =
            Number(
                getXpForLevel(nextLevel)
            ) || 0;
    } catch {
        nextLevelXp = 0;
    }

    const wallet =
        Math.max(
            0,
            Number(
                economyData?.wallet
            ) || 0
        );

    const bank =
        Math.max(
            0,
            Number(
                economyData?.bank
            ) || 0
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
            achievement =>
                achievement?.unlocked
        );

    const joinedAt =
        member.joinedTimestamp
            ? new Date(
                member.joinedTimestamp
            )
            : null;

    const createdAt =
        user.createdAt
            ? new Date(
                user.createdAt
            )
            : null;

    return {
        user,
        member,

        level,
        xp,
        totalXp,

        nextLevel,
        nextLevelXp,

        wallet,
        bank,
        totalBalance,

        achievements,
        unlockedAchievements,

        joinedAt,
        createdAt,
    };
}


/* =========================================================
 * NAVIGATION BUTTONS
 * ======================================================= */

export function buildNavigationButtons(
    targetUserId,
    currentPage = 'profile',
    achievementPage = 0,
    totalAchievementPages = 1
) {
    const buttons = [];

    /*
     * PROFILE
     */

    buttons.push(
        new ButtonBuilder()
            .setCustomId(
                `newprofile:profile:${targetUserId}`
            )
            .setLabel('Профиль')
            .setEmoji('👤')
            .setStyle(
                currentPage === 'profile'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary
            )
    );


    /*
     * ACHIEVEMENTS
     *
     * ВАЖНО:
     * Если мы уже на странице достижений,
     * НЕ создаём кнопку с page=0.
     *
     * Иначе она может совпасть с кнопкой
     * "Назад".
     */

    if (currentPage === 'achievements') {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(
                    `newprofile:achievements:${targetUserId}:${achievementPage}`
                )
                .setLabel('Достижения')
                .setEmoji('🏆')
                .setStyle(
                    ButtonStyle.Primary
                )
                .setDisabled(true)
        );
    } else {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(
                    `newprofile:achievements:${targetUserId}:0`
                )
                .setLabel('Достижения')
                .setEmoji('🏆')
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
    }


    /*
     * STATISTICS
     */

    buttons.push(
        new ButtonBuilder()
            .setCustomId(
                `newprofile:statistics:${targetUserId}`
            )
            .setLabel('Статистика')
            .setEmoji('📊')
            .setStyle(
                currentPage === 'statistics'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary
            )
            .setDisabled(
                currentPage === 'statistics'
            )
    );


    /*
     * ACHIEVEMENT PAGINATION
     *
     * Используем только стандартные emoji.
     * Никаких ‹ › — Discord иногда считает их
     * невалидными emoji.
     */

    if (
        currentPage === 'achievements' &&
        totalAchievementPages > 1
    ) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(
                    `newprofile:achievements:${targetUserId}:prev:${Math.max(
                        0,
                        achievementPage - 1
                    )}`
                )
                .setLabel('Назад')
                .setEmoji('⬅️')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    achievementPage <= 0
                ),

            new ButtonBuilder()
                .setCustomId(
                    `newprofile:achievements:${targetUserId}:next:${Math.min(
                        totalAchievementPages - 1,
                        achievementPage + 1
                    )}`
                )
                .setLabel('Далее')
                .setEmoji('➡️')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    achievementPage >=
                    totalAchievementPages - 1
                )
        );
    }


    /*
     * Discord позволяет максимум 5 кнопок
     * в одном ActionRow.
     */

    return [
        new ActionRowBuilder()
            .addComponents(buttons),
    ];
}


/* =========================================================
 * RENDER PAGE
 * ======================================================= */

export async function renderNewProfilePage({
    page,
    data,
    achievementPage = 0,
}) {
    /*
     * PROFILE
     */

    if (page === 'profile') {
        return {
            buffer:
                await generateProfileCard(
                    data
                ),

            currentPage:
                'profile',

            achievementPage:
                0,

            totalAchievementPages:
                1,
        };
    }


    /*
     * ACHIEVEMENTS
     */

    if (page === 'achievements') {
        const result =
            await generateAchievementCard(
                data,
                achievementPage
            );

        return {
            buffer:
                result.buffer,

            currentPage:
                'achievements',

            achievementPage:
                result.page,

            totalAchievementPages:
                result.totalPages,
        };
    }


    /*
     * STATISTICS
     */

    if (page === 'statistics') {
        return {
            buffer:
                await generateStatisticsCard(
                    data
                ),

            currentPage:
                'statistics',

            achievementPage:
                0,

            totalAchievementPages:
                1,
        };
    }


    throw new Error(
        `Unknown newprofile page: ${page}`
    );
}
