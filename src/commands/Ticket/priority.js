import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Устанавливает уровень приоритета для текущего тикета.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Уровень приоритета тикета.")
                .setRequired(true)
                .addChoices(
                    { name: "Срочный", value: "urgent" },
                    { name: "Высокий", value: "high" },
                    { name: "Средний", value: "medium" },
                    { name: "Низкий", value: "low" },
                    { name: "Нет", value: "none" },
                ),
        )
        .setDMPermission(false),
    category: "Тикеты",

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
                message: 'Для изменения приоритета тикета у вас должно быть разрешение `Manage Channels` или настроенная роль `Ticket Staff`.',
            });
        }

        const priorityLevel = interaction.options.getString("level");

        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        const priorityNames = {
            urgent: "СРОЧНЫЙ",
            high: "ВЫСОКИЙ",
            medium: "СРЕДНИЙ",
            low: "НИЗКИЙ",
            none: "НЕТ",
        };

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Приоритет обновлён",
                    `Приоритет тикета установлен на **${priorityNames[priorityLevel]}**.`,
                ),
            ],
        });

        logger.info('Приоритет тикета успешно обновлён', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};
