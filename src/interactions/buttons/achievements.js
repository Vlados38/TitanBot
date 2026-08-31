/**
 * ============================================================
 * TITANBOT — ACHIEVEMENTS BUTTON
 * ============================================================
 */

import {
    MessageFlags,
} from 'discord.js';

import {
    getUserAchievementProfile,
} from '../services/achievements/achievementService.js';

import {
    buildAchievementsMessage,
} from '../commands/Community/achievements.js';

export default {
    customId: 'achievements',

    async execute(
        interaction,
        client,
        args
    ) {
        try {
            if (!interaction.guild) {
                return interaction.reply({
                    content:
                        '❌ Эта панель доступна только на сервере.',
                    flags:
                        MessageFlags.Ephemeral,
                });
            }

            const action =
                args?.[0];

            /*
             * =================================================
             * NOOP
             * =================================================
             */

            if (
                action === 'noop'
            ) {
                return;
            }

            /*
             * =================================================
             * FORMAT
             *
             * achievements:page:USER_ID:CATEGORY:PAGE
             *
             * achievements:category:USER_ID:CATEGORY:PAGE
             * =================================================
             */

            let targetUserId;
            let category;
            let page;

            if (
                action === 'page'
            ) {
                targetUserId =
                    args?.[1];

                category =
                    args?.[2] || 'all';

                page =
                    Number(args?.[3]) || 0;
            } else if (
                action === 'category'
            ) {
                targetUserId =
                    args?.[1];

                category =
                    args?.[2] || 'all';

                page =
                    Number(args?.[3]) || 0;
            } else {
                return;
            }

            if (
                !targetUserId
            ) {
                return interaction.reply({
                    content:
                        '❌ Не удалось определить пользователя.',
                    flags:
                        MessageFlags.Ephemeral,
                });
            }

            /*
             * =================================================
             * LOAD PROFILE
             * =================================================
             */

            const targetUser =
                await client.users
                    .fetch(
                        targetUserId
                    )
                    .catch(
                        () => null
                    );

            if (!targetUser) {
                return interaction.reply({
                    content:
                        '❌ Пользователь не найден.',
                    flags:
                        MessageFlags.Ephemeral,
                });
            }

            await interaction.deferUpdate();

            const profile =
                await getUserAchievementProfile(
                    client,
                    interaction.guild.id,
                    targetUserId
                );

            const payload =
                buildAchievementsMessage({
                    profile,
                    targetUser,
                    targetUserId,
                    category,
                    page,
                });

            await interaction.editReply(
                payload
            );
        } catch (error) {
            console.error(
                '[ACHIEVEMENTS BUTTON] Failed:',
                error
            );

            try {
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    await interaction.editReply({
                        content:
                            '❌ Не удалось открыть достижения.',
                        embeds: [],
                        components: [],
                    });
                } else {
                    await interaction.reply({
                        content:
                            '❌ Не удалось открыть достижения.',
                        flags:
                            MessageFlags.Ephemeral,
                    });
                }
            } catch {
                // Interaction уже недоступна.
            }
        }
    },
};
