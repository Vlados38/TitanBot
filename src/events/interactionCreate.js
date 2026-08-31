import {
    AttachmentBuilder,
} from 'discord.js';

import {
    loadProfileData,
    buildNavigationButtons,
    renderNewProfilePage,
} from '../commands/Community/newprofile.js';


export default {
    name: 'interactionCreate',

    async execute(interaction, client) {

        /*
         * =====================================================
         * SLASH COMMANDS
         * =====================================================
         */

        if (interaction.isChatInputCommand()) {
            const command =
                client.commands?.get(
                    interaction.commandName
                );

            if (!command) {
                console.error(
                    `[INTERACTION] Command not found: ${interaction.commandName}`
                );

                return;
            }

            try {
                await command.execute(
                    interaction,
                    client.config,
                    client
                );
            } catch (error) {
                console.error(
                    `[INTERACTION] Command "${interaction.commandName}" failed:`,
                    error
                );

                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.editReply({
                            content:
                                '❌ Произошла ошибка при выполнении команды.',
                        });
                    } else {
                        await interaction.reply({
                            content:
                                '❌ Произошла ошибка при выполнении команды.',
                            ephemeral: true,
                        });
                    }
                } catch (replyError) {
                    console.error(
                        '[INTERACTION] Failed to send error response:',
                        replyError
                    );
                }
            }

            return;
        }


        /*
         * =====================================================
         * BUTTONS
         * =====================================================
         */

        if (interaction.isButton()) {

            const customId =
                interaction.customId;


            /*
             * -------------------------------------------------
             * NEW PROFILE
             * -------------------------------------------------
             */

            if (
                customId.startsWith(
                    'newprofile:'
                )
            ) {
                return handleNewProfileButton(
                    interaction,
                    client
                );
            }


            /*
             * -------------------------------------------------
             * OTHER BUTTONS
             * -------------------------------------------------
             *
             * Здесь НЕ трогаем старый /profile.
             */

            return;
        }
    },
};


/* =========================================================
 * NEWPROFILE BUTTON HANDLER
 * ======================================================= */

async function handleNewProfileButton(
    interaction,
    client
) {

    try {

        const parts =
            interaction.customId.split(':');

        /*
         * Expected:
         *
         * newprofile:profile:USER_ID
         * newprofile:achievements:USER_ID:PAGE
         * newprofile:statistics:USER_ID
         */

        const [
            prefix,
            page,
            targetUserId,
            pageValue,
        ] = parts;


        if (
            prefix !== 'newprofile'
        ) {
            return;
        }


        /*
         * =====================================================
         * VALIDATE USER
         * =====================================================
         */

        if (!targetUserId) {
            return interaction.reply({
                content:
                    '❌ Не удалось определить пользователя профиля.',
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
                    '❌ Эта карточка доступна только на сервере.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * MEMBER
         * =====================================================
         */

        const member =
            await guild.members
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
                    '❌ Не удалось загрузить пользователя.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * DEFER BUTTON UPDATE
         * =====================================================
         *
         * Это сообщает Discord, что кнопка обработана.
         */

        await interaction.deferUpdate();


        /*
         * =====================================================
         * LOAD DATA
         * =====================================================
         */

        const profileData =
            await loadProfileData({
                client,
                guild,
                member,
                user: targetUser,
            });


        /*
         * =====================================================
         * ACHIEVEMENT PAGE
         * =====================================================
         */

        if (
            page === 'achievements'
        ) {
            profileData.__achievementPage =
                Math.max(
                    0,
                    Number(pageValue) || 0
                );
        }


        /*
         * =====================================================
         * RENDER
         * =====================================================
         */

        const result =
            await renderNewProfilePage({
                page,
                data: profileData,
            });


        /*
         * =====================================================
         * BUTTONS
         * =====================================================
         */

        const components =
            buildNavigationButtons(
                targetUserId,
                result.currentPage,
                result.achievementPage,
                result.totalAchievementPages
            );


        /*
         * =====================================================
         * ATTACHMENT
         * =====================================================
         */

        const attachment =
            new AttachmentBuilder(
                result.buffer,
                {
                    name:
                        `newprofile-${targetUserId}.png`,
                }
            );


        /*
         * =====================================================
         * UPDATE MESSAGE
         * =====================================================
         */

        await interaction.editReply({
            files: [attachment],
            components,
        });

    } catch (error) {

        console.error(
            '[NEWPROFILE BUTTON] Failed:',
            error
        );


        /*
         * Если deferUpdate уже был вызван,
         * отвечаем через editReply.
         */

        try {

            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.editReply({
                    content:
                        '❌ Не удалось открыть эту страницу профиля.',
                });
            } else {
                await interaction.reply({
                    content:
                        '❌ Не удалось открыть эту страницу профиля.',
                    ephemeral: true,
                });
            }

        } catch (replyError) {

            console.error(
                '[NEWPROFILE BUTTON] Failed to send error:',
                replyError
            );

        }
    }
}
