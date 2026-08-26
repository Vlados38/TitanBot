import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Не удалось отложить ответ:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Для обновления счётчиков необходимо разрешение **Управление каналами**.'
        }).catch(logger.error);
        return;
    }

    if (!newType) {
        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Необходимо указать новый тип счётчика для обновления.'
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Счётчик с ID \`${counterId}\` не найден. Используйте \`/serverstats list\`, чтобы посмотреть все счётчики.`
            }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Канал этого счётчика больше не существует. Нельзя обновить счётчик, привязанный к удалённому каналу.'
            }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(
                c => c.type === newType && c.id !== counter.id
            );

            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);

                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `Счётчик **${getCounterTypeLabel(newType)}** уже существует на этом сервере${existingChannel ? ` в ${existingChannel}` : ''}. Сначала удалите его, прежде чем использовать этот тип повторно.`
                }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Не удалось сохранить обновлённые данные счётчика. Попробуйте ещё раз.'
            }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);

        if (!updated) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Счётчик обновлён, но не удалось изменить название канала. Счётчик будет обновлён при следующем запланированном запуске.'
            }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `**Счётчик успешно обновлён!**\n\n` +
                    `**ID счётчика:** \`${counterId}\`\n` +
                    `**Тип изменён:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n` +
                    `**Текущие настройки:**\n` +
                    `**Тип:** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}\n` +
                    `**Канал:** ${finalChannel}\n` +
                    `**Название канала:** ${finalChannel.name}\n\n` +
                    `Счётчик будет автоматически обновляться каждые 15 минут.`
                )
            ]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Ошибка при обновлении счётчика:", error);

        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Произошла ошибка при обновлении счётчика. Попробуйте ещё раз.'
        }).catch(logger.error);
    }
}
