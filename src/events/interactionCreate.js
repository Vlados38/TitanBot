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

        if (
            interaction.isButton()
        ) {
            const customId =
                interaction.customId;

            if (
                customId.startsWith(
                    'newprofile:'
                )
            ) {
                await handleNewProfileButton(
                    interaction,
                    client
                );
            }

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

        const prefix =
            parts[0];

        const page =
            parts[1];

        const targetUserId =
            parts[2];

        const pageValue =
            parts[3];


        console.log(
            `[NEWPROFILE BUTTON] ${interaction.customId}`
        );


        if (
            prefix !== 'newprofile'
        ) {
            return;
        }


        if (
            !targetUserId
        ) {
            return interaction.reply({
                content:
                    '❌ Не удалось определить пользователя.',
                ephemeral: true,
            });
        }


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
         * LOAD PROFILE
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
         * ACHIEVEMENT PAGE
         * =====================================================
         */

        if (
            page === 'achievements'
        ) {
            data.__achievementPage =
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
                data,
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
         * IMAGE
         * =====================================================
         */

        const attachment =
            new AttachmentBuilder(
                result.buffer,
                {
                    name:
                        `newprofile-${targetUserId}-${result.currentPage}.png`,
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


        console.log(
            `[NEWPROFILE BUTTON] ${page} rendered successfully`
        );

    } catch (error) {

        console.error(
            '[NEWPROFILE BUTTON] Failed:',
            error
        );


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
