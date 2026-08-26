import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Не удалось отложить ответ:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Для создания счётчиков необходимо разрешение **Управление каналами**.'
        }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Выберите подходящую категорию для канала счётчика.'
            }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Счётчик **${getCounterTypeLabel(type)}** уже существует на этом сервере${duplicateChannel ? ` в ${duplicateChannel}` : ''}. Сначала удалите его, прежде чем создавать новый.`
            }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Канал счётчика создан пользователем ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Для канала **${targetChannel.name}** уже существует счётчик. Сначала удалите его или выберите другой тип.`
            }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Не удалось сохранить данные при создании счётчика').catch(() => null);
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Не удалось сохранить данные счётчика. Попробуйте ещё раз.'
            }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Счётчик создан, но не удалось обновить название канала. Счётчик будет обновлён при следующем запланированном запуске.'
            }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `**Счётчик успешно создан!**\n\n` +
                    `**Тип:** ${getCounterTypeLabel(type)}\n` +
                    `**Тип канала:** ${targetChannel.type === ChannelType.GuildVoice ? 'голосовой' : 'текстовый'}\n` +
                    `**Категория:** ${category}\n` +
                    `**Канал:** ${targetChannel}\n` +
                    `**Название канала:** ${targetChannel.name}\n` +
                    `**ID счётчика:** \`${newCounter.id}\`\n\n` +
                    `Счётчик будет автоматически обновляться каждые 15 минут.\n\n` +
                    `Используйте \`/serverstats list\`, чтобы посмотреть все счётчики.`
                )
            ]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Ошибка при создании счётчика:", error);
        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Произошла ошибка при создании счётчика. Попробуйте ещё раз.'
        }).catch(logger.error);
    }
}
