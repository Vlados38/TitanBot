import {
    AttachmentBuilder,
} from 'discord.js';

import {
    loadProfileData,
    buildNavigationButtons,
    renderNewProfilePage,
} from '../../commands/Community/newprofile.js';


/**
 * =========================================================
 * NEW PROFILE BUTTON HANDLER
 * =========================================================
 *
 * Обрабатывает только:
 *
 * newprofile:profile:USER_ID
 * newprofile:achievements:USER_ID:PAGE
 * newprofile:statistics:USER_ID
 *
 * Старый /profile здесь вообще не используется.
 */

export default async function handleNewProfileButton(
    interaction,
    client
) {
    if (!interaction.isButton()) {
        return false;
    }

    if (
        !interaction.customId.startsWith(
            'newprofile:'
        )
    ) {
        return false;
    }

    const parts =
        interaction.customId.split(':');

    const action = parts[1];
    const targetUserId = parts[2];

    if (
        !action ||
        !targetUserId
    ) {
        await interaction.reply({
            content:
                '❌ Некорректная кнопка профиля.',
            ephemeral: true,
        });

        return true;
    }

    /**
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


    /**
     * -------------------------------------------------------
     * USER
     * -------------------------------------------------------
     */

    const user =
        await client.users
            .fetch(targetUserId)
            .catch(() => null);

    if (!user) {
        await interaction.reply({
            content:
                '❌ Пользователь не найден.',
            ephemeral: true,
        });

        return true;
    }


    /**
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


    /**
     * -------------------------------------------------------
     * DETERMINE PAGE
     * -------------------------------------------------------
     */

    let page = 'profile';

    let achievementPage = 0;

    if (
        action === 'achievements'
    ) {
        page = 'achievements';

        achievementPage =
            Math.max(
                0,
                Number(parts[3]) || 0
            );
    }

    if (
        action === 'statistics'
    ) {
        page = 'statistics';
    }

    if (
        action === 'profile'
    ) {
        page = 'profile';
    }


    /**
     * -------------------------------------------------------
     * VALIDATE ACTION
     * -------------------------------------------------------
     */

    if (
        ![
            'profile',
            'achievements',
            'statistics',
        ].includes(action)
    ) {
        await interaction.reply({
            content:
                '❌ Неизвестная страница профиля.',
            ephemeral: true,
        });

        return true;
    }


    /**
     * -------------------------------------------------------
     * ACKNOWLEDGE BUTTON
     * -------------------------------------------------------
     *
     * deferUpdate() сообщает Discord:
     *
     * "Кнопка нажата, сейчас изменим сообщение."
     */

    await interaction.deferUpdate();


    try {

        /**
         * ---------------------------------------------------
         * LOAD FRESH DATA
         * ---------------------------------------------------
         *
         * Каждый переход заново получает данные.
         * Поэтому если XP/достижения/деньги изменились —
         * карточка тоже будет актуальной.
         */

        const profileData =
            await loadProfileData({
                client,
                guild,
                member,
                user,
            });


        /**
         * ---------------------------------------------------
         * PAGE STATE
         * ---------------------------------------------------
         */

        profileData.__achievementPage =
            achievementPage;


        /**
         * ---------------------------------------------------
         * RENDER PNG
         * ---------------------------------------------------
         */

        const result =
            await renderNewProfilePage({
                page,
                data: profileData,
            });


        /**
         * ---------------------------------------------------
         * ATTACHMENT
         * ---------------------------------------------------
         */

        const fileName =
            page === 'profile'
                ? `newprofile-${targetUserId}.png`
                : page === 'achievements'
                    ? `newprofile-achievements-${targetUserId}.png`
                    : `newprofile-statistics-${targetUserId}.png`;


        const attachment =
            new AttachmentBuilder(
                result.buffer,
                {
                    name: fileName,
                }
            );


        /**
         * ---------------------------------------------------
         * BUTTONS
         * ---------------------------------------------------
         */

        const components =
            buildNavigationButtons(
                targetUserId,
                result.currentPage,
                result.achievementPage,
                result.totalAchievementPages
            );


        /**
         * ---------------------------------------------------
         * REPLACE CURRENT MESSAGE
         * ---------------------------------------------------
         *
         * Никаких новых сообщений.
         *
         * Картинка просто меняется прямо
         * в существующем сообщении.
         */

        await interaction.editReply({
            content: null,
            embeds: [],
            files: [attachment],
            components,
        });


        return true;

    } catch (error) {

        console.error(
            '[NEWPROFILE BUTTONS] Failed to render page:',
            error
        );


        /**
         * После deferUpdate() уже нельзя
         * делать interaction.reply().
         *
         * Поэтому показываем ephemeral follow-up.
         */

        await interaction.followUp({
            content:
                '❌ Не удалось обновить карточку профиля.',
            ephemeral: true,
        }).catch(() => {});


        return true;
    }
}
