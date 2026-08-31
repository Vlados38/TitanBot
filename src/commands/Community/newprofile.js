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

import { getEconomyData } from '../../utils/economy.js';

import {
    getUserAchievementProfile,
} from '../../services/achievements/achievementService.js';

import {
    generateProfileCard,
    generateAchievementsCard,
    generateStatisticsCard,
} from '../../services/profile/profileCard.js';


/**
 * =========================================================
 * COMMAND
 * =========================================================
 */

export default {
    data: new SlashCommandBuilder()
        .setName('newprofile')
        .setDescription('Открыть RPG-профиль пользователя')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Пользователь')
                .setRequired(false)
        )
        .setDMPermission(false),

    category: 'Community',

    async execute(interaction, config, client) {
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
            const cardData =
                await loadProfileData({
                    client,
                    guild,
                    member,
                    user: targetUser,
                });

            const image =
                await generateProfileCard(
                    cardData
                );

            const attachment =
                new AttachmentBuilder(
                    image,
                    {
                        name:
                            `titan-profile-${targetUser.id}.png`,
                    }
                );

            const components =
                buildNewProfileButtons(
                    targetUser.id
                );

            return interaction.editReply({
                files: [attachment],
                components,
            });

        } catch (error) {
            console.error(
                `[NEWPROFILE] Failed to generate profile ` +
                `for ${targetUser.id}:`,
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось создать RPG-профиль. ' +
                    'Попробуйте ещё раз позже.',
            });
        }
    },
};


/**
 * =========================================================
 * LOAD PROFILE DATA
 * =========================================================
 */

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

        joinedAt:
            member.joinedTimestamp
                ? new Date(
                    member.joinedTimestamp
                )
                : null,

        createdAt:
            user.createdAt
                ? new Date(
                    user.createdAt
                )
                : null,
    };
}


/**
 * =========================================================
 * BUTTONS
 * =========================================================
 */

export function buildNewProfileButtons(
    targetUserId
) {
    return [
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `newprofile:achievements:${targetUserId}`
                    )
                    .setLabel(
                        'Достижения'
                    )
                    .setEmoji('🏅')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `newprofile:statistics:${targetUserId}`
                    )
                    .setLabel(
                        'Статистика'
                    )
                    .setEmoji('📊')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),
            ),
    ];
}
