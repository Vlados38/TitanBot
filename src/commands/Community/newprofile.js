import {
    SlashCommandBuilder,
    AttachmentBuilder,
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
} from '../../services/profile/profileCard.js';

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

        const guild = interaction.guild;

        if (!guild) {
            return interaction.editReply({
                content:
                    '❌ Эта команда доступна только на сервере.',
            });
        }

        const member = await guild.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!member) {
            return interaction.editReply({
                content:
                    '❌ Пользователь не найден на этом сервере.',
            });
        }

        try {
            const [
                levelData,
                economyData,
                achievementProfile,
            ] = await Promise.all([
                getUserLevelData(
                    client,
                    guild.id,
                    targetUser.id
                ),

                getEconomyData(
                    client,
                    guild.id,
                    targetUser.id
                ),

                getUserAchievementProfile(
                    client,
                    guild.id,
                    targetUser.id
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
                        getXpForLevel(
                            nextLevel
                        )
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
                achievementProfile
                    ?.achievements ?? [];

            const unlockedAchievements =
                achievements.filter(
                    (achievement) =>
                        achievement.unlocked
                );

            const cardData = {
                user: targetUser,
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

            const image =
                await generateProfileCard(
                    cardData
                );

            const attachment =
                new AttachmentBuilder(
                    image,
                    {
                        name:
                            'titan-profile.png',
                    }
                );

            return interaction.editReply({
                files: [attachment],
            });
        } catch (error) {
            console.error(
                '[NEWPROFILE] Failed to generate profile:',
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось создать RPG-профиль. Проверьте логи Railway.',
            });
        }
    },
};
