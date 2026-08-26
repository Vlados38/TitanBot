import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, createError, wrapServiceBoundary } from '../../../utils/errorHandler.js';

export async function handleDelete(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Не удалось отложить ответ:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Для удаления счётчиков необходимо разрешение **Управление каналами**.'
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Нет счётчиков, которые можно удалить.'
            }).catch(logger.error);
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Счётчик с ID \`${counterId}\` не найден. Используйте \`/serverstats list\`, чтобы посмотреть все счётчики.`
            }).catch(logger.error);
            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);

        const embed = createEmbed({
            title: "Удаление счётчика и канала",
            description: `Вы уверены, что хотите удалить этот счётчик и его канал?\n\n**ID:** \`${counterToDelete.id}\`\n**Тип:** ${getCounterTypeDisplay(counterToDelete.type)}\n**Канал:** ${channel || 'Канал удалён'}\n\n **Канал будет удалён навсегда!**`,
            color: getColor('error')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter-delete:confirm:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Подтвердить удаление")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`counter-delete:cancel:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Отмена")
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [row]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Ошибка в handleDelete:", error);
        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Произошла ошибка при получении списка счётчиков. Попробуйте ещё раз.'
        }).catch(logger.error);
    }
}

export const performDeletionByCounterId = wrapServiceBoundary(async function performDeletionByCounterId(client, guild, counterId) {
    const counters = await getServerCounters(client, guild.id);

    const counter = counters.find(c => c.id === counterId);
    if (!counter) {
        throw createError(
            'Счётчик не найден',
            ErrorTypes.USER_INPUT,
            `Счётчик с ID \`${counterId}\` не найден.`,
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const updatedCounters = counters.filter(c => c.id !== counter.id);

    const saved = await saveServerCounters(client, guild.id, updatedCounters);
    if (!saved) {
        throw createError(
            'Не удалось удалить счётчик',
            ErrorTypes.DATABASE,
            'Не удалось удалить счётчик. Попробуйте ещё раз.',
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const channel = guild.channels.cache.get(counter.channelId);
    let channelDeleted = false;

    if (channel) {
        try {
            await channel.delete(`Счётчик удалён — удаление канала: ${counter.id}`);
            channelDeleted = true;
        } catch (error) {
            logger.error("Ошибка при удалении канала:", error);
        }
    }

    let message = `✅ **Счётчик успешно удалён!**\n\n**ID:** \`${counter.id}\`\n**Тип:** ${getCounterTypeDisplay(counter.type)}`;

    if (channelDeleted) {
        message += `\n**Канал:** ${channel.name} (удалён)`;
    } else if (channel) {
        message += `\n**Канал:** ${channel.name} (не удалось удалить)`;
    } else {
        message += `\n**Канал:** Уже удалён`;
    }

    return { message };
}, {
    service: 'serverstats',
    operation: 'performDeletionByCounterId',
    userMessage: 'Произошла ошибка при удалении счётчика. Попробуйте ещё раз.',
});

function getCounterTypeDisplay(type) {
    return `${getCounterEmoji(type)} ${getCounterTypeLabel(type)}`;
}
