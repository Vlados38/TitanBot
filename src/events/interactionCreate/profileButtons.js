import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getProfileData,
    buildBadgesPage,
    buildStatisticsPage,
    buildProfileButtons,
} from '../../commands/Community/profile.js';


/*
 * =========================================================
 * NEWPROFILE BUTTON HANDLER
 * =========================================================
 *
 * Обрабатывает:
 *
 * profile:badges:USER_ID:PAGE
 * profile:stats:USER_ID
 * profile:main:USER_ID
 *
 * ВАЖНО:
 * Этот обработчик относится именно к новой карточке.
 */


export default async function profileButtons(interaction) {

    if (!interaction.isButton()) {
        return false;
    }


    const customId =
        interaction.customId;


    /*
     * Нас интересуют только наши кнопки.
     */

    if (
        !customId.startsWith('profile:')
    ) {
        return false;
    }


    /*
     * -------------------------------------------------------
     * PARSE CUSTOM ID
     * -------------------------------------------------------
     */

    const parts =
        customId.split(':');

    const action =
        parts[1];

    const targetUserId =
        parts[2];


    if (!action || !targetUserId) {
        return false;
    }


    /*
     * -------------------------------------------------------
     * SECURITY
     * -------------------------------------------------------
     *
     * Пока разрешаем смотреть профиль
     * любому пользователю.
     *
     * Но если кнопка принадлежит конкретной
     * карточке, пользователь всё равно может
     * переключать страницы этой карточки.
     */


    /*
     * -------------------------------------------------------
     * GUILD
     * -------------------------------------------------------
     */

    const guild =
        interaction.guild;

    if (!guild) {
        await interaction.reply({
            content:
                '❌ Эта кнопка работает только на сервере.',
            ephemeral: true,
        });

        return true;
    }


    /*
     * -------------------------------------------------------
     * MEMBER
     * -------------------------------------------------------
     */

    const member =
        await guild.members
            .fetch(targetUserId)
            .catch(() => null);


    if (!member) {
        await interaction.reply({
            content:
                '❌ Пользователь больше не находится на сервере.',
            ephemeral: true,
        });

        return true;
    }


    /*
     * -------------------------------------------------------
     * USER
     * -------------------------------------------------------
     */

    const user =
        await interaction.client.users
            .fetch(targetUserId)
            .catch(() => null);


    if (!user) {
        await interaction.reply({
            content:
                '❌ Не удалось найти пользователя.',
            ephemeral: true,
        });

        return true;
    }


    try {

        /*
         * =====================================================
         * LOAD DATA
         * =====================================================
         *
         * Используем тот же источник данных,
         * что и /newprofile.
         */

        const data =
            await getProfileData({
                client:
                    interaction.client,

                guild,

                member,

                user,
            });


        /*
         * =====================================================
         * ACHIEVEMENTS
         * =====================================================
         */

        if (action === 'badges') {

            const page =
                Number(parts[3]) || 0;


            const result =
                buildBadgesPage(
                    data,
                    page
                );


            /*
             * Кнопки навигации
             */

            const row =
                new ActionRowBuilder();


            /*
             * НАЗАД К ПРОФИЛЮ
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:main:${targetUserId}`
                    )
                    .setLabel('Профиль')
                    .setEmoji('◀️')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );


            /*
             * ПРЕДЫДУЩАЯ СТРАНИЦА
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:badges:${targetUserId}:${result.page - 1}`
                    )
                    .setLabel('Назад')
                    .setEmoji('⬅️')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        result.page <= 0
                    )
            );


            /*
             * НОМЕР СТРАНИЦЫ
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:badges:${targetUserId}:${result.page}`
                    )
                    .setLabel(
                        `${result.page + 1} / ${result.totalPages}`
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(true)
            );


            /*
             * СЛЕДУЮЩАЯ СТРАНИЦА
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:badges:${targetUserId}:${result.page + 1}`
                    )
                    .setLabel('Вперёд')
                    .setEmoji('➡️')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        result.page >=
                        result.totalPages - 1
                    )
            );


            /*
             * СТАТИСТИКА
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:stats:${targetUserId}`
                    )
                    .setLabel('Статистика')
                    .setEmoji('📊')
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );


            /*
             * ВАЖНО:
             *
             * interaction.update()
             * меняет существующее сообщение.
             *
             * Новое сообщение НЕ создаётся.
             */

            await interaction.update({
                embeds: [
                    result.embed,
                ],

                components: [
                    row,
                ],
            });


            return true;
        }


        /*
         * =====================================================
         * STATISTICS
         * =====================================================
         */

        if (action === 'stats') {

            const embed =
                buildStatisticsPage(
                    data
                );


            const row =
                new ActionRowBuilder();


            /*
             * ПРОФИЛЬ
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:main:${targetUserId}`
                    )
                    .setLabel('Профиль')
                    .setEmoji('◀️')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );


            /*
             * ДОСТИЖЕНИЯ
             */

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `profile:badges:${targetUserId}:0`
                    )
                    .setLabel('Достижения')
                    .setEmoji('🏅')
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );


            await interaction.update({
                embeds: [
                    embed,
                ],

                components: [
                    row,
                ],
            });


            return true;
        }


        /*
         * =====================================================
         * MAIN PROFILE
         * =====================================================
         */

        if (action === 'main') {

            /*
             * Здесь нам нужен buildProfileEmbed.
             */

            const {
                buildProfileEmbed,
            } =
                await import(
                    '../../commands/Community/profile.js'
                );


            const embed =
                buildProfileEmbed(
                    data
                );


            const components =
                buildProfileButtons(
                    targetUserId,

                    interaction.user.id
                );


            await interaction.update({
                embeds: [
                    embed,
                ],

                components,
            });


            return true;
        }


        return false;

    } catch (error) {

        console.error(
            '[NEWPROFILE BUTTONS] Failed:',
            error
        );


        /*
         * Если interaction уже был
         * подтверждён — отвечаем followUp.
         */

        if (
            interaction.replied ||
            interaction.deferred
        ) {

            await interaction.followUp({
                content:
                    '❌ Не удалось обновить страницу профиля.',
                ephemeral: true,
            }).catch(() => {});

        } else {

            await interaction.reply({
                content:
                    '❌ Не удалось обновить страницу профиля.',
                ephemeral: true,
            }).catch(() => {});
        }


        return true;
    }
}
