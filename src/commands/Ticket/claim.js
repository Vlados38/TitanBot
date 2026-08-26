import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { claimTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Забирает открытый тикет и назначает его вам.")
        .setDMPermission(false),

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

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для получения тикетов у вас должно быть разрешение `Manage Channels` или настроенная роль `Ticket Staff`.',
            });
        }

        await claimTicket(interaction.channel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Тикет получен!",
                    "Вы успешно взяли этот тикет в работу.",
                ),
            ],
        });

        logger.info('Тикет успешно получен', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            commandName: 'claim'
        });
    },
};
