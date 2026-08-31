import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getProfileData,
    buildBadgesPage,
    buildStatisticsPage,
} from '../commands/community/newprofile.js';


/*
 * =========================================================
 * INTERACTION CREATE
 * =========================================================
 *
 * Здесь обрабатываются кнопки НОВОГО профиля.
 *
 * Старый /profile НЕ ИЗМЕНЯЕМ.
 *
 * Поддерживаем:
 *
 * profile:badges:USER_ID:PAGE
 * profile:stats:USER_ID
 *
 * =========================================================
 */

export default {
    name: 'interactionCreate',

    async execute(interaction, client, config) {

        /*
         * =====================================================
         * BUTTONS ONLY
         * =====================================================
         */

        if (!interaction.isButton()) {
            return;
        }

        const customId =
            interaction.customId;

        /*
         * =====================================================
         * NEW PROFILE BUTTONS
         * =====================================================
         *
         * Обрабатываем только наши кнопки.
         *
         * Никакие другие кнопки бота
         * здесь не перехватываем.
         */

        if (
            !customId.startsWith(
                'profile:'
            )
        ) {
            return;
        }


        /*
         * =====================================================
         * PARSE CUSTOM ID
         * =====================================================
         */

        const parts =
            customId.split(':');

        const action =
            parts[1];

        const targetUserId =
            parts[2];

        const page =
            Number(parts[3] ?? 0);


        /*
         * =====================================================
         * VALIDATION
         * =====================================================
         */

        if (
            !action ||
            !targetUserId
        ) {
            return interaction.reply({
                content:
                    '❌ Некорректная кнопка профиля.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * GUILD
         * =====================================================
         */

        const guild =
            interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    '❌ Эта кнопка доступна только на сервере.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * TARGET MEMBER
         * =====================================================
         */

        const member =
            await guild.members
                .fetch(targetUserId)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    '❌ Пользователь больше не найден на сервере.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * TARGET USER
         * =====================================================
         */

        const targetUser =
            await client.users
                .fetch(targetUserId)
                .catch(() => null);

        if (!targetUser) {
            return interaction.reply({
                content:
                    '❌ Не удалось найти пользователя.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * LOAD PROFILE DATA
         * =====================================================
         *
         * Используем ту же функцию,
         * которую использует /newprofile.
         *
         * /profile здесь вообще не вызывается.
         */

        try {

            await interaction.deferUpdate();


            const profileData =
                await getProfileData({
                    client,
                    guild,
                    member,
                    user: targetUser,
                });


            /*
             * =================================================
             * ACHIEVEMENTS
             * =================================================
             */

            if (
                action === 'badges'
            ) {

                const {
                    embed,
                    page: safePage,
                    totalPages,
                } =
                    buildBadgesPage(
                        profileData,
                        page
                    );


                /*
                 * -------------------------------------------------
                 * BUTTONS
                 * -------------------------------------------------
                 */

                const buttons =
                    new ActionRowBuilder();


                /*
                 * PREVIOUS
                 */

                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:badges:${targetUserId}:${Math.max(
                                0,
                                safePage - 1
                            )}`
                        )
                        .setLabel('Назад')
                        .setEmoji('◀️')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            safePage <= 0
                        )
                );


                /*
                 * BACK TO PROFILE
                 */

                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:main:${targetUserId}`
                        )
                        .setLabel(
                            'Профиль'
                        )
                        .setEmoji('👤')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );


                /*
                 * STATISTICS
                 */

                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:stats:${targetUserId}`
                        )
                        .setLabel(
                            'Статистика'
                        )
                        .setEmoji('📊')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );


                /*
                 * NEXT
                 */

                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:badges:${targetUserId}:${Math.min(
                                totalPages - 1,
                                safePage + 1
                            )}`
                        )
                        .setLabel('Вперёд')
                        .setEmoji('▶️')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            safePage >=
                            totalPages - 1
                        )
                );


                /*
                 * -------------------------------------------------
                 * UPDATE MESSAGE
                 * -------------------------------------------------
                 */

                return interaction.editReply({
                    embeds: [embed],
                    components: [
                        buttons,
                    ],
                });
            }


            /*
             * =================================================
             * STATISTICS
             * =================================================
             */

            if (
                action === 'stats'
            ) {

                const embed =
                    buildStatisticsPage(
                        profileData
                    );


                /*
                 * -------------------------------------------------
                 * BUTTONS
                 * -------------------------------------------------
                 */

                const buttons =
                    new ActionRowBuilder();


                /*
                 * BACK TO PROFILE
                 */

                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:main:${targetUserId}`
                        )
                        .setLabel(
                            'Профиль'
                        )
                        .setEmoji('👤')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );


                /*
                 * ACHIEVEMENTS
                 */

                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:badges:${targetUserId}:0`
                        )
                        .setLabel(
                            'Достижения'
                        )
                        .setEmoji('🏅')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );


                /*
                 * -------------------------------------------------
                 * UPDATE MESSAGE
                 * -------------------------------------------------
                 */

                return interaction.editReply({
                    embeds: [embed],
                    components: [
                        buttons,
                    ],
                });
            }


            /*
             * =================================================
             * MAIN PROFILE
             * =================================================
             *
             * Возвращаем картинку newprofile.
             *
             * ВАЖНО:
             * здесь нужен generateProfileCard.
             */

            if (
                action === 'main'
            ) {

                /*
                 * Импортируем генератор динамически,
                 * чтобы interactionCreate не создавал
                 * циклическую зависимость при загрузке.
                 */

                const {
                    generateProfileCard,
                } =
                    await import(
                        '../services/profile/profileCard.js'
                    );


                const image =
                    await generateProfileCard(
                        profileData
                    );


                /*
                 * AttachmentBuilder
                 */

                const {
                    AttachmentBuilder,
                } =
                    await import(
                        'discord.js'
                    );


                const attachment =
                    new AttachmentBuilder(
                        image,
                        {
                            name:
                                `titan-profile-${targetUserId}.png`,
                        }
                    );


                /*
                 * BUTTONS
                 */

                const buttons =
                    new ActionRowBuilder();


                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `profile:badges:${targetUserId}:0`
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
                            `profile:stats:${targetUserId}`
                        )
                        .setLabel(
                            'Статистика'
                        )
                        .setEmoji('📊')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );


                /*
                 * -------------------------------------------------
                 * RETURN TO IMAGE
                 * -------------------------------------------------
                 */

                return interaction.editReply({
                    content: '',
                    embeds: [],
                    files: [attachment],
                    components: [
                        buttons,
                    ],
                });
            }


            /*
             * =================================================
             * UNKNOWN ACTION
             * =================================================
             */

            return interaction.editReply({
                content:
                    '❌ Неизвестное действие профиля.',
                embeds: [],
                components: [],
            });

        } catch (error) {

            console.error(
                '[NEWPROFILE BUTTON] Failed:',
                error
            );


            /*
             * Если deferUpdate уже был вызван,
             * используем editReply.
             */

            return interaction.editReply({
                content:
                    '❌ Не удалось открыть этот раздел профиля.',
                embeds: [],
                components: [],
            }).catch(() => {});
        }
    },
};
