import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { logEvent, EVENT_TYPES, resolveLogChannel } from '../../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../../utils/logging/logEmbeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Не удалось отложить взаимодействие с жалобой', {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = resolveLogChannel(guildConfig, 'reports');

        if (!reportChannelId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Канал для жалоб не настроен. Попросите модератора использовать `/logging dashboard` или `/logging channel`.'
            });
        }

        const ownerMention = interaction.guild.ownerId
            ? `<@${interaction.guild.ownerId}> Новая жалоба!`
            : 'Новая жалоба!';

        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REPORT_FILE,
            content: ownerMention,
            data: {
                title: 'Жалоба на пользователя',
                lines: [
                    formatLogLine('Пожаловались на', `${targetUser.tag} (\`${targetUser.id}\`)`),
                    formatLogLine('Пожаловался', `${interaction.user.tag} (\`${interaction.user.id}\`)`),
                    formatLogLine('Канал', interaction.channel.toString()),
                ],
                blockFields: [{ name: 'Причина', value: reason }],
                author: await resolveUserAuthor(client, targetUser.id),
                thumbnail: targetUser.displayAvatarURL(),
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: 'Жалоба отправлена',
                description: `Ваша жалоба на **${targetUser.tag}** успешно зарегистрирована и отправлена команде модераторов. Спасибо!`,
            })],
        });

        logger.info('Жалоба отправлена', {
            userId: interaction.user.id,
            reportedUserId: targetUser.id,
            guildId,
            reasonLength: reason.length,
        });
    },
};
