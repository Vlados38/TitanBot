import {
    AttachmentBuilder,
} from 'discord.js';

import {
    loadProfileData,
    buildNavigationButtons,
    renderNewProfilePage,
} from '../commands/Community/newprofile.js';


/*
 * =========================================================
 * INTERACTION CREATE
 * =========================================================
 *
 * Обрабатывает ТОЛЬКО кнопки новой системы /newprofile.
 *
 * Старый /profile здесь НЕ используется.
 *
 * Поддерживаем:
 *
 * newprofile:profile:USER_ID
 * newprofile:achievements:USER_ID:PAGE
 * newprofile:statistics:USER_ID
 *
 * =========================================================
 */

export default {
    name: 'interactionCreate',

    async execute(
        interaction,
        client,
        config
    ) {

        /*
         * =====================================================
         * НЕ BUTTON
         * =====================================================
         */

        if (!interaction.isButton()) {
            return;
        }


        /*
         * =====================================================
         * ONLY NEWPROFILE
         * =====================================================
         */

        if (
            !interaction.customId.startsWith(
                'newprofile:'
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
            interaction.customId.split(':');

        const prefix =
            parts[0];

        const page =
            parts[1];

        const targetUserId =
            parts[2];

        const achievementPage =
            Number(parts[3] ?? 0);


        /*
         * =====================================================
         * VALIDATION
         * =====================================================
         */

        if (
            prefix !== 'newprofile' ||
            !page ||
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
         * LOAD USER
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
         * LOAD MEMBER
         * =====================================================
         */

        const member =
            await guild.members
                .fetch(targetUserId)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    '❌ Пользователь больше не находится на сервере.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * ACCESS CHECK
         * =====================================================
         *
         * Пока разрешаем смотреть любой профиль,
         * как и сам /newprofile.
         *
         * Это значит:
         *
         * пользователь может нажать кнопку
         * на чужой карточке.
         */

        try {

            /*
             * =================================================
             * DEFER
             * =================================================
             *
             * deferUpdate говорит Discord:
             *
             * "кнопка нажата, сейчас изменим
             * существующее сообщение".
             */

            await interaction.deferUpdate();


            /*
             * =================================================
             * LOAD DATA
             * =================================================
             */

            const data =
                await loadProfileData({
                    client,
                    guild,
                    member,
                    user: targetUser,
                });


            /*
             * =================================================
             * ACHIEVEMENT PAGE
             * =================================================
             *
             * renderNewProfilePage ожидает номер страницы
             * в data.__achievementPage.
             */

            if (
                page === 'achievements'
            ) {
                data.__achievementPage =
                    Number.isFinite(
                        achievementPage
                    )
                        ? Math.max(
                            0,
                            achievementPage
                        )
                        : 0;
            }


            /*
             * =================================================
             * RENDER
             * =================================================
             */

            const rendered =
                await renderNewProfilePage({
                    page,
                    data,
                });


            /*
             * =================================================
             * ATTACHMENT
             * =================================================
             */

            const attachment =
                new AttachmentBuilder(
                    rendered.buffer,
                    {
                        name:
                            `newprofile-${targetUserId}-${page}.png`,
                    }
                );


            /*
             * =================================================
             * NAVIGATION
             * =================================================
             */

            const components =
                buildNavigationButtons(
                    targetUserId,

                    rendered.currentPage,

                    rendered.achievementPage,

                    rendered.totalAchievementPages
                );


            /*
             * =================================================
             * UPDATE MESSAGE
             * =================================================
             *
             * Здесь происходит главное:
             *
             * старое изображение удаляется,
             * новое изображение появляется
             * в том же сообщении.
             */

            return interaction.editReply({
                content: '',
                embeds: [],
                files: [
                    attachment,
                ],
                components,
            });

        } catch (error) {

            console.error(
                '[NEWPROFILE BUTTON] Failed to render page:',
                error
            );


            /*
             * =================================================
             * ERROR
             * =================================================
             */

            return interaction.editReply({
                content:
                    '❌ Не удалось открыть раздел профиля.',
                embeds: [],
                components: [],
            }).catch(() => {});
        }
    },
};
