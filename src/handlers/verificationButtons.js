import { MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Эту кнопку можно использовать только на сервере.'
            });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('Пользователь нажал кнопку верификации', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Вы уже прошли верификацию и имеете доступ ко всем каналам сервера.'
            });
        }

        logger.info('Пользователь прошёл верификацию через кнопку', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "✅ Верификация успешно пройдена!",
                `Вы прошли верификацию и получили роль **${result.roleName}**!\n\nТеперь вам доступны все каналы и функции сервера. Добро пожаловать! 🎉`
            )],
        });

    } catch (error) {
        logger.error('Ошибка в обработчике кнопки верификации', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionError(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};
