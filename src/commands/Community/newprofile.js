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

        /**
         * -----------------------------------------------------
         * MEMBER
         * -----------------------------------------------------
         */

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
            /**
             * =================================================
             * LOAD DATA
             * =================================================
             */

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


            /**
             * =================================================
             * LEVEL
             * =================================================
             */

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


            /**
             * =================================================
             * ECONOMY
             * =================================================
             */

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


            /**
             * =================================================
             * ACHIEVEMENTS
             * =================================================
             */

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


            /**
             * =================================================
             * CARD DATA
             * =================================================
             */

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

                /**
                 * Пока rank не передаём.
                 *
                 * Когда подключим реальный рейтинг,
                 * сюда можно будет добавить:
                 *
                 * rank,
                 */
            };


            console.log(
                `[NEWPROFILE] Generating card for ${targetUser.tag} (${targetUser.id})`
            );


            /**
             * =================================================
             * GENERATE CARD
             * =================================================
             */

            const image =
                await generateProfileCard(
                    cardData
                );


            console.log(
                `[NEWPROFILE] Card generated successfully. ` +
                `Size: ${image.length} bytes`
            );


            /**
             * =================================================
             * ATTACHMENT
             * =================================================
             */

            const attachment =
                new AttachmentBuilder(
                    image,
                    {
                        name:
                            `titan-profile-${targetUser.id}.png`,
                    }
                );


            /**
             * =================================================
             * BUTTONS
             * =================================================
             *
             * Используем те же customId,
             * которые уже использует старый profile.
             *
             * Поэтому существующий обработчик кнопок
             * сможет работать и с /newprofile.
             */

            const buttons =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `profile:badges:${targetUser.id}:0`
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
                                `profile:stats:${targetUser.id}`
                            )
                            .setLabel(
                                'Статистика'
                            )
                            .setEmoji('📊')
                            .setStyle(
                                ButtonStyle.Secondary
                            ),
                    );


            /**
             * =================================================
             * SEND TO SERVER
             * =================================================
             */

            console.log(
                `[NEWPROFILE] Sending profile card to ` +
                `#${interaction.channel?.name ?? 'unknown'}`
            );


            return interaction.editReply({
                files: [attachment],
                components: [buttons],
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
