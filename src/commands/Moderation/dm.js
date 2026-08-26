import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Отправить личное сообщение пользователю (только для персонала)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Пользователь, которому нужно отправить личное сообщение")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Сообщение для отправки")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Отправить сообщение анонимно (по умолчанию: false)")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            
            if (message.length > 2000) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Сообщение не должно превышать 2000 символов.' });
            }

            if (targetUser.bot) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Вы не можете отправлять личные сообщения ботам.' });
            }

            const sanitized = sanitizeMarkdown(message);

            const dmChannel = await targetUser.createDM();
            
            await dmChannel.send({
                embeds: [
                    successEmbed(
                        anonymous ? "Сообщение от команды персонала" : `Сообщение от ${interaction.user.tag}`,
                        sanitized
                    ).setFooter({
                        text: `Вы не можете ответить на это сообщение. | ID журнала: ${interaction.id}`
                    })
                ]
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Сообщение отправлено",
                        `Сообщение успешно отправлено пользователю ${targetUser.tag}`
                    ),
                ],
            });
        } catch (error) {
            logger.error('DM command error:', error);
            
            if (error.code === 50007) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Не удалось отправить личное сообщение пользователю ${targetUser.tag}. Возможно, у него отключены личные сообщения.` });
            }
            
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Не удалось отправить личное сообщение: ${error.message}` });
        }
    }
};
