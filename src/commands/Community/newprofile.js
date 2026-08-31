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

    /*
     * Оставляем achievements в profileData,
     * потому что другие части системы могут
     * использовать эти данные.
     *
     * Но сама карточка newprofile их больше
     * не отображает.
     */

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
    currentPage = 'profile'
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
            .setDisabled(
                currentPage === 'profile'
            )
    );


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
        };
    }


    throw new Error(
        `Unknown newprofile page: ${page}`
    );
}
