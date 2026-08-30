import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getProfileData,
    buildProfileButtons,
    buildBadgesPage,
    buildStatisticsPage,
    buildProfileEmbed,
} from '../../../commands/Community/profile.js';


export default {
    name: 'profile',

    async execute(interaction, client, args = []) {
        const [action, targetUserId, pageArg] = args;

        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ Эта кнопка доступна только на сервере.',
                ephemeral: true,
            });
        }

        if (!action || !targetUserId) {
            return interaction.reply({
                content: '❌ Некорректная кнопка профиля.',
                ephemeral: true,
            });
        }

        const targetUser =
            await client.users
                .fetch(targetUserId)
                .catch(() => null);

        if (!targetUser) {
            return interaction.reply({
                content: '❌ Пользователь не найден.',
                ephemeral: true,
            });
        }

        const member =
            await interaction.guild.members
                .fetch(targetUserId)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    '❌ Пользователь больше не находится на этом сервере.',
                ephemeral: true,
            });
        }

        const profileData =
            await getProfileData({
                client,
                guild: interaction.guild,
                member,
                user: targetUser,
            });

        switch (action) {
            case 'badges': {
                const requestedPage =
                    Number.parseInt(pageArg ?? '0', 10);

                const page =
                    Number.isFinite(requestedPage)
                        ? requestedPage
                        : 0;

                const {
                    embed,
                    page: safePage,
                    totalPages,
                } = buildBadgesPage(
                    profileData,
                    page
                );

                const components =
                    buildBadgesButtons(
                        targetUserId,
                        safePage,
                        totalPages
                    );

                return interaction.update({
                    embeds: [embed],
                    components,
                });
            }

            case 'stats': {
                const embed =
                    buildStatisticsPage(
                        profileData
                    );

                const components =
                    buildStatisticsButtons(
                        targetUserId
                    );

                return interaction.update({
                    embeds: [embed],
                    components,
                });
            }

            case 'main': {
                const embed =
                    buildProfileEmbed(
                        profileData
                    );

                const components =
                    buildProfileButtons(
                        targetUserId,
                        interaction.user.id
                    );

                return interaction.update({
                    embeds: [embed],
                    components,
                });
            }

            default: {
                return interaction.reply({
                    content:
                        '❌ Неизвестное действие профиля.',
                    ephemeral: true,
                });
            }
        }
    },
};


/* =========================================================
 * BADGES BUTTONS
 * ======================================================= */

function buildBadgesButtons(
    targetUserId,
    page,
    totalPages
) {
    const row =
        new ActionRowBuilder();

    const previousPage =
        Math.max(
            0,
            page - 1
        );

    const nextPage =
        Math.min(
            Math.max(totalPages - 1, 0),
            page + 1
        );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(
                `profile:main:${targetUserId}`
            )
            .setLabel('Профиль')
            .setEmoji('👤')
            .setStyle(
                ButtonStyle.Secondary
            ),

        new ButtonBuilder()
            .setCustomId(
                `profile:badges:${targetUserId}:${previousPage}`
            )
            .setLabel('Назад')
            .setEmoji('◀️')
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                page <= 0
            ),

        new ButtonBuilder()
            .setCustomId(
                `profile:badges:${targetUserId}:${nextPage}`
            )
            .setLabel('Вперёд')
            .setEmoji('▶️')
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                page >= totalPages - 1
            ),

        new ButtonBuilder()
            .setCustomId(
                `profile:stats:${targetUserId}`
            )
            .setLabel('Statistics')
            .setEmoji('📊')
            .setStyle(
                ButtonStyle.Secondary
            )
    );

    return [row];
}


/* =========================================================
 * STATISTICS BUTTONS
 * ======================================================= */

function buildStatisticsButtons(
    targetUserId
) {
    const row =
        new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(
                `profile:main:${targetUserId}`
            )
            .setLabel('Профиль')
            .setEmoji('👤')
            .setStyle(
                ButtonStyle.Secondary
            ),

        new ButtonBuilder()
            .setCustomId(
                `profile:badges:${targetUserId}:0`
            )
            .setLabel('Badges')
            .setEmoji('🏅')
            .setStyle(
                ButtonStyle.Secondary
            )
    );

    return [row];
}
