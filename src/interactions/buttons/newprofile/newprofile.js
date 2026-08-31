import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
} from 'discord.js';

import {
    getProfileData,
    buildBadgesPage,
    buildStatisticsPage,
} from '../../../commands/Community/profile.js';

import {
    generateProfileCard,
} from '../../../services/profile/profileCard.js';


const BUTTON_NAME = 'newprofile';


export default {
    name: BUTTON_NAME,

    async execute(
        interaction,
        client,
        args
    ) {

        const type =
            args[0];

        const targetUserId =
            args[1];

        const page =
            Number(args[2] ?? 0);


        /*
         * =====================================================
         * VALIDATION
         * =====================================================
         */

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
         * =====================================================
         * USER
         * =====================================================
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
         * =====================================================
         * MEMBER
         * =====================================================
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


        /*
         * =====================================================
         * LOAD PROFILE
         * =====================================================
         */

        try {

            const data =
                await getProfileData({
                    client,
                    guild:
                        interaction.guild,
                    member,
                    user:
                        targetUser,
                });


            /*
             * =================================================
             * ACHIEVEMENTS
             * =================================================
             */

            if (type === 'badges') {

                const result =
                    buildBadgesPage(
                        data,
                        page
                    );


                const row =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    `newprofile:back:${targetUserId}`
                                )
                                .setLabel('Профиль')
                                .setEmoji('👤')
                                .setStyle(
                                    ButtonStyle.Secondary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `newprofile:badges:${targetUserId}:${result.page - 1}`
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
                                    `newprofile:badges:${targetUserId}:${result.page + 1}`
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


                /*
                 * ВАЖНО:
                 *
                 * Пока оставляем достижения
                 * как Discord Embed.
                 *
                 * Следующим шагом мы можем
                 * сделать для них полноценную
                 * сиреневую PNG-карточку.
                 */

                return interaction.update({
                    embeds: [
                        result.embed,
                    ],
                    files: [],
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

                const embed =
                    buildStatisticsPage(
                        data
                    );


                const row =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    `newprofile:back:${targetUserId}`
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
                    files: [],
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

                const image =
                    await generateProfileCard(
                        data
                    );


                const attachment =
                    new AttachmentBuilder(
                        image,
                        {
                            name:
                                `titan-profile-${targetUserId}.png`,
                        }
                    );


                const buttons =
                    buildNewProfileButtons(
                        targetUserId
                    );


                return interaction.update({
                    content: null,
                    embeds: [],
                    attachments: [],
                    files: [
                        attachment,
                    ],
                    components:
                        buttons,
                });
            }


            return interaction.reply({
                content:
                    '❌ Неизвестная кнопка профиля.',
                ephemeral: true,
            });

        } catch (error) {

            console.error(
                '[NEWPROFILE BUTTON] Failed:',
                error
            );


            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                return interaction.reply({
                    content:
                        '❌ Не удалось обработать кнопку.',
                    ephemeral: true,
                });
            }

            throw error;
        }
    },
};


/* =========================================================
 * BUTTONS
 * ======================================================= */

function buildNewProfileButtons(
    targetUserId
) {
    return [
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `newprofile:badges:${targetUserId}:0`
                    )
                    .setLabel('Достижения')
                    .setEmoji('🏅')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `newprofile:stats:${targetUserId}`
                    )
                    .setLabel('Статистика')
                    .setEmoji('📊')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            ),
    ];
}
