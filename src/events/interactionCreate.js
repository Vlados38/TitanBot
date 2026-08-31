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
                    if (
                        interaction.replied ||
                        interaction.deferred
                    ) {
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
             * NEWPROFILE
             * -------------------------------------------------
             */

            if (
                customId.startsWith(
                    'newprofile:'
                )
            ) {
                await handleNewProfileButton(
                    interaction,
                    client
                );

                return;
            }

            /*
             * -------------------------------------------------
             * Остальные кнопки бота здесь не трогаем.
             * -------------------------------------------------
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
         * Форматы:
         *
         * newprofile:profile:USER_ID
         *
         * newprofile:achievements:USER_ID:0
         *
         * newprofile:achievements:USER_ID:next:1
         *
         * newprofile:achievements:USER_ID:prev:0
         *
         * newprofile:statistics:USER_ID
         */

        const prefix =
            parts[0];

        const page =
            parts[1];

        const targetUserId =
            parts[2];


        console.log(
            `[NEWPROFILE BUTTON] ${interaction.customId}`
        );


        /*
         * =====================================================
         * VALIDATE PREFIX
         * =====================================================
         */

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

        if (
            !targetUserId
        ) {
            return interaction.reply({
                content:
                    '❌ Не удалось определить пользователя.',
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
                    '❌ Карточка доступна только на сервере.',
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
                    '❌ Пользователь не найден на сервере.',
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
                    '❌ Не удалось загрузить пользователя.',
                ephemeral: true,
            });
        }


        /*
         * =====================================================
         * ACKNOWLEDGE BUTTON
         * =====================================================
         */

        await interaction.deferUpdate();


        /*
         * =====================================================
         * LOAD PROFILE DATA
         * =====================================================
         */

        const data =
            await loadProfileData({
                client,
                guild,
                member,
                user: targetUser,
            });


        /*
         * =====================================================
         * DETERMINE ACHIEVEMENT PAGE
         * =====================================================
         */

        let achievementPage = 0;


        if (
            page === 'achievements'
        ) {

            /*
             * -------------------------------------------------
             * Старый формат:
             *
             * newprofile:achievements:USER_ID:0
             * -------------------------------------------------
             */

            if (
                parts[3] !== 'next' &&
                parts[3] !== 'prev'
            ) {
                achievementPage =
                    Math.max(
                        0,
                        Number(parts[3]) || 0
                    );
            }


            /*
             * -------------------------------------------------
             * Новый формат:
             *
             * newprofile:achievements:USER_ID:next:1
             *
             * newprofile:achievements:USER_ID:prev:0
             * -------------------------------------------------
             */

            else {

                const action =
                    parts[3];

                const requestedPage =
                    Number(parts[4]);


                if (
                    Number.isFinite(
                        requestedPage
                    )
                ) {
                    achievementPage =
                        Math.max(
                            0,
                            requestedPage
                        );
                }


                /*
                 * На всякий случай поддерживаем
                 * переход относительно текущей страницы,
                 * если номер не был передан.
                 */

                else {

                    const currentPage =
                        Number(
                            interaction.message
                                ?.components?.[0]
                                ?.components
                                ?.find(
                                    component =>
                                        component.customId
                                            ?.startsWith(
                                                `newprofile:achievements:${targetUserId}:`
                                            )
                                )
                                ?.customId
                                ?.split(':')
                                ?.at(-1)
                        ) || 0;


                    if (
                        action === 'next'
                    ) {
                        achievementPage =
                            currentPage + 1;
                    } else if (
                        action === 'prev'
                    ) {
                        achievementPage =
                            Math.max(
                                0,
                                currentPage - 1
                            );
                    }
                }
            }
        }


        /*
         * =====================================================
         * RENDER PAGE
         * =====================================================
         */

        const result =
            await renderNewProfilePage({
                page,
                data,
                achievementPage,
            });


        /*
         * =====================================================
         * NAVIGATION BUTTONS
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
         * IMAGE ATTACHMENT
         * =====================================================
         */

        const attachment =
            new AttachmentBuilder(
                result.buffer,
                {
                    name:
                        `newprofile-${targetUserId}-${result.currentPage}-${result.achievementPage}.png`,
                }
            );


        /*
         * =====================================================
         * UPDATE EXISTING MESSAGE
         * =====================================================
         */

        await interaction.editReply({
            content: null,
            embeds: [],
            files: [attachment],
            components,
        });


        /*
         * =====================================================
         * LOG
         * =====================================================
         */

        console.log(
            `[NEWPROFILE BUTTON] ${page} rendered successfully`
        );

        if (
            page === 'achievements'
        ) {
            console.log(
                `[NEWPROFILE BUTTON] Achievement page: ${result.achievementPage + 1}/${result.totalAchievementPages}`
            );
        }

    } catch (error) {

        console.error(
            '[NEWPROFILE BUTTON] Failed:',
            error
        );


        /*
         * =====================================================
         * ERROR RESPONSE
         * =====================================================
         */

        try {

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply({
                    content:
                        '❌ Не удалось открыть эту страницу профиля.',
                    embeds: [],
                    files: [],
                    components: [],
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
