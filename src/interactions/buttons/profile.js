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
} from '../../commands/Community/profile.js';

export default {
    name: 'profile',

    async execute(interaction, client, args) {
        const type = args[0];
        const targetUserId = args[1];
        const page = Number(args[2] ?? 0);

        if (!type || !targetUserId) {
            return interaction.reply({
                content: '❌ Некорректная кнопка профиля.',
                ephemeral: true,
            });
        }

        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ Эта кнопка работает только на сервере.',
                ephemeral: true,
            });
        }

        try {
            const targetUser = await client.users
                .fetch(targetUserId)
                .catch(() => null);

            if (!targetUser) {
                return interaction.reply({
                    content: '❌ Пользователь не найден.',
                    ephemeral: true,
                });
            }

            const member = await interaction.guild.members
                .fetch(targetUserId)
                .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content: '❌ Пользователь не найден на этом сервере.',
                    ephemeral: true,
                });
            }

            const data = await getProfileData({
                client,
                guild: interaction.guild,
                member,
                user: targetUser,
            });

            /*
             * ================================================
             * BADGES
             * ================================================
             */

            if (type === 'badges') {
                const result = buildBadgesPage(
                    data,
                    page
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
                        ),

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
                        ),

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
             * ================================================
             * STATISTICS
             * ================================================
             */

            if (type === 'stats') {
                const embed =
                    buildStatisticsPage(data);

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
             * ================================================
             * BACK TO PROFILE
             * ================================================
             */

            if (type === 'back') {
                const embed =
                    buildProfileEmbed(data);

                const components =
                    buildProfileButtons(
                        targetUserId,
                        interaction.user.id
                    );

                return interaction.update({
                    embeds: [
                        embed,
                    ],
                    components,
                });
            }

            return interaction.reply({
                content:
                    '❌ Неизвестная кнопка профиля.',
                ephemeral: true,
            });
        } catch (error) {
            console.error(
                '[PROFILE BUTTON] Error:',
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                throw error;
            }

            return interaction.reply({
                content:
                    '❌ Не удалось обработать кнопку профиля.',
                ephemeral: true,
            });
        }
    },
};
