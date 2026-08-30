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


/*
 * =========================================================
 * TEST RECIPIENT
 * =========================================================
 *
 * Сюда будет отправляться готовая PNG-карточка.
 */
const TEST_USER_ID = '718716021497790504';


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
        await interaction.deferReply({
            ephemeral: true,
        });

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
            /*
             * =====================================================
             * LOAD PROFILE DATA
             * =====================================================
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


            /*
             * =====================================================
             * LEVEL
             * =====================================================
             */

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


            /*
             * =====================================================
             * ECONOMY
             * =====================================================
             */

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


            /*
             * =====================================================
             * ACHIEVEMENTS
             * =====================================================
             */

            const achievements =
                achievementProfile
                    ?.achievements ?? [];

            const unlockedAchievements =
                achievements.filter(
                    (achievement) =>
                        achievement.unlocked
                );


            /*
             * =====================================================
             * CARD DATA
             * =====================================================
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
            };


            console.log(
                `[NEWPROFILE] Generating card for ${targetUser.tag} (${targetUser.id})`
            );


            /*
             * =====================================================
             * GENERATE IMAGE
             * =====================================================
             */

            const image =
                await generateProfileCard(
                    cardData
                );


            console.log(
                `[NEWPROFILE] Card generated successfully. Size: ${image.length} bytes`
            );


            /*
             * =====================================================
             * CREATE ATTACHMENT
             * =====================================================
             */

            const attachment =
                new AttachmentBuilder(
                    image,
                    {
                        name:
                            `titan-profile-${targetUser.id}.png`,
                    }
                );


            /*
             * =====================================================
             * SEND TO TEST DISCORD USER
             * =====================================================
             */

            console.log(
                `[NEWPROFILE] Fetching test recipient ${TEST_USER_ID}...`
            );

            const testUser =
                await client.users.fetch(
                    TEST_USER_ID
                );


            console.log(
                `[NEWPROFILE] Sending profile card to ${testUser.tag} (${TEST_USER_ID})...`
            );


            await testUser.send({
                content:
                    `🎨 **TitanBot RPG Profile**\n` +
                    `Профиль пользователя: **${targetUser.username}**`,
                files: [attachment],
            });


            console.log(
                `[NEWPROFILE] Profile card successfully sent to ${TEST_USER_ID}`
            );


            /*
             * =====================================================
             * CONFIRM IN COMMAND
             * =====================================================
             */

            return interaction.editReply({
                content:
                    `✅ Карточка **${targetUser.username}** ` +
                    `успешно отправлена в личные сообщения ` +
                    `пользователю <@${TEST_USER_ID}>.`,
            });

        } catch (error) {

            console.error(
                '[NEWPROFILE] Failed to generate/send profile:',
                error
            );


            return interaction.editReply({
                content:
                    '❌ Не удалось создать или отправить RPG-профиль. ' +
                    'Проверьте логи Railway.',
            });
        }
    },
};
