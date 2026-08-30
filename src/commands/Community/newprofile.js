import {
    SlashCommandBuilder,
    AttachmentBuilder,
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
} from '../../utils/profileCard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('newprofile')
        .setDescription('Посмотреть RPG-профиль пользователя')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription(
                    'Пользователь, чей профиль нужно посмотреть'
                )
                .setRequired(false)
        )
        .setDMPermission(false),

    category: 'Community',

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const targetUser =
            interaction.options.getUser('user') ??
            interaction.user;

        const guild = interaction.guild;

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
                await getNewProfileData({
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
                        name: 'profile.png',
                    }
                );

            return interaction.editReply({
                files: [attachment],
            });
        } catch (error) {
            console.error(
                `[NEWPROFILE] Failed to generate profile for ${targetUser.id}:`,
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось создать карточку профиля. Попробуйте ещё раз позже.',
            });
        }
    },
};

/* =========================================================
 * PROFILE DATA
 * ======================================================= */

async function getNewProfileData({
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
        Number(levelData?.level) || 0;

    const xp =
        Number(levelData?.xp) || 0;

    const totalXp =
        Number(levelData?.totalXp) || 0;

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
        Number(
            economyData?.wallet
        ) || 0;

    const bank =
        Number(
            economyData?.bank
        ) || 0;

    const totalBalance =
        wallet + bank;

    const achievements =
        achievementProfile?.achievements ?? [];

    const unlockedAchievements =
        achievements.filter(
            (achievement) =>
                achievement.unlocked
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
    };
}
