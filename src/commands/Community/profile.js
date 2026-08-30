import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getProfileData,
    buildProfileEmbed,
    buildProfileButtons,
    buildBadgesPage,
    buildStatisticsPage,
} from '../../../commands/Community/profile.js';

const BUTTON_NAME = 'profile';

export default {
    name: BUTTON_NAME,

    async execute(interaction, client, args) {
        const type = args[0];
        const targetUserId = args[1];
        const page = Number(args[2] ?? 0);

        if (!type) {
            return;
        }

        if (!targetUserId) {
            return interaction.reply({
                content:
                    '❌ Не удалось определить пользователя профиля.',
                ephemeral: true,
            });
        }

        if (!interaction.guild) {
            return interaction.reply({
                content:
                    '❌ Эта кнопка работает только на сервере.',
                ephemeral: true,
            });
        }

        /*
         * Получаем пользователя.
         */
        const targetUser =
            await client.users
                .fetch(targetUserId)
                .catch(() => null);

        if (!targetUser) {
            return interaction.reply({
                content:
                    '❌ Пользователь не найден.',
                ephemeral: true,
            });
        }

        /*
         * Получаем участника сервера.
         */
        const member =
            await interaction.guild.members
                .fetch(targetUserId)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    '❌ Пользователь не найден на этом сервере.',
                ephemeral: true,
            });
        }

        try {
            /*
             * =================================================
             * BADGES
             * =================================================
             */

            if (type === 'badges') {
                const data =
                    await getProfileData({
                        client,
                        guild: interaction.guild,
                        member,
                        user: targetUser,
                    });

                const result =
                    buildBadgesPage(
                        data,
                        page
                    );

                const row =
                    new ActionRowBuilder();

                /*
                 * Назад к основному профилю.
                 */
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:back:${targetUserId}`
                        )
                        .setLabel('Профиль')
                        .setEmoji('👤')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );

                /*
                 * Предыдущая страница.
                 */
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:badges:${targetUserId}:${result.page - 1}`
                        )
                        .setLabel('Назад')
                        .setEmoji('◀️')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            result.page <= 0
                        )
                );

                /*
                 * Следующая страница.
                 */
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:badges:${targetUserId}:${result.page + 1}`
                        )
                        .setLabel('Вперёд')
                        .setEmoji('▶️')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            result.page >=
                            result.totalPages - 1
                        )
                );

                return interaction.update({
                    embeds: [
                        result.embed,
                    ],
                    components: [
                        row,
                    ],
                });
            }

            /*
             * =================================================
             * STATISTICS
             * =================================================
             */

            if (type === 'stats') {
                const data =
                    await getProfileData({
                        client,
                        guild: interaction.guild,
                        member,
                        user: targetUser,
                    });

                const embed =
                    buildStatisticsPage(
                        data
                    );

                const row =
                    new ActionRowBuilder();

                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:back:${targetUserId}`
                        )
                        .setLabel('Профиль')
                        .setEmoji('👤')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );

                return interaction.update({
                    embeds: [
                        embed,
                    ],
                    components: [
                        row,
                    ],
                });
            }

            /*
             * =================================================
             * BACK TO PROFILE
             * =================================================
             */

            if (type === 'back') {
                const data =
                    await getProfileData({
                        client,
                        guild: interaction.guild,
                        member,
                        user: targetUser,
                    });

                const embed =
                    buildProfileEmbed(
                        data
                    );

                const components =
                    buildProfileButtons(
                        targetUserId
                    );

                return interaction.update({
                    embeds: [
                        embed,
                    ],
                    components,
                });
            }

            /*
             * Неизвестный тип кнопки.
             */
            return interaction.reply({
                content:
                    '❌ Неизвестная кнопка профиля.',
                ephemeral: true,
            });
        } catch (error) {
            console.error(
                '[PROFILE BUTTON] Failed:',
                error
            );

            /*
             * Если interaction ещё не был подтверждён,
             * отправляем ephemeral-ошибку.
             */
            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                return interaction.reply({
                    content:
                        '❌ Не удалось обработать кнопку профиля.',
                    ephemeral: true,
                });
            }

            /*
             * Если update/reply уже был сделан,
             * просто пробрасываем ошибку в общий обработчик.
             */
            throw error;
        }
    },
};
