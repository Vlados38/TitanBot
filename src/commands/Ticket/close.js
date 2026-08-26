import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { closeTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Закрывает текущий тикет.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Причина закрытия тикета.")
                .setRequired(false),
        ),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });

        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Эту команду можно использовать только в действительном канале тикета.',
            });
        }

        if (!permissionContext.canCloseTicket) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для закрытия этого тикета у вас должно быть разрешение `Manage Channels`, настроенная роль `Ticket Staff` или вы должны быть создателем тикета.',
            });
        }

        const reason =
            interaction.options?.getString("reason") ||
            "Тикет закрыт через команду без указания конкретной причины.";

        await closeTicket(interaction.channel, interaction.user, reason);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Тикет закрыт!",
                    "Этот тикет успешно закрыт.",
                ),
            ],
        });

        logger.info('Тикет успешно закрыт', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            reason: reason,
            commandName: 'close'
        });
    },
};
