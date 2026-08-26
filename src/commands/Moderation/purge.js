import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Удалить определённое количество сообщений")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("Количество сообщений (1–100)")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",
    abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn(`Purge interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'purge'
            });
            return;
        }

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (amount < 1 || amount > 100)
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Укажите число от 1 до 100.'
            });

        try {
            const fetched = await channel.messages.fetch({ limit: amount });
            const deleted = await channel.bulkDelete(fetched, true);
            const deletedCount = deleted.size;

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Messages Purged",
                    target: `${channel} (${deletedCount} messages)`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Deleted ${deletedCount} messages`,
                    metadata: {
                        channelId: channel.id,
                        messageCount: deletedCount,
                        requestedAmount: amount,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Сообщения удалены",
                        `В канале ${channel} удалено сообщений: ${deletedCount}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(err => 
                    logger.debug('Failed to auto-delete purge response:', err)
                );
            }, 3000);
        } catch (error) {
            logger.error('Purge command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Произошла непредвиденная ошибка при удалении сообщений. Обратите внимание: сообщения старше 14 дней нельзя удалить массово.'
            });
        }
    }
};
