import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Разблокировать текущий канал (снова разрешить @everyone отправлять сообщения).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unlock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `${channel} не заблокирован явно (для @everyone уже разрешена отправка сообщений).`
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Канал разблокирован пользователем ${interaction.user.tag}`,
                },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Channel Unlocked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'None'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **Канал разблокирован**`,
                        `${channel} теперь разблокирован. Вы снова можете отправлять здесь сообщения.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Произошла непредвиденная ошибка при попытке разблокировать канал. Проверьте мои права (мне необходимо право «Управление каналами»).'
            });
        }
    }
};
