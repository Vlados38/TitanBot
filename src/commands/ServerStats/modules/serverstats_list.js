import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Не удалось отложить ответ:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Для просмотра счётчиков необходимо разрешение **Управление каналами**.'
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];

        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);

            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(
                    `Удаление потерянного счётчика ${counter.id} ` +
                    `(тип: ${counter.type}, удалённый канал: ${counter.channelId}) ` +
                    `с сервера ${guild.id}`
                );
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(
                `Очищено потерянных счётчиков: ${orphanedCounters.length} ` +
                `на сервере ${guild.id}`
            );
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "Счётчики сервера",
                description: "На этом сервере ещё не настроено ни одного счётчика.\n\nИспользуйте `/serverstats create`, чтобы создать первый счётчик!",
                color: getColor('warning')
            });

            embed.addFields({
                name: "**Доступные типы счётчиков**",
                value: "**Участники + боты** — общее количество участников сервера\n **Только участники** — только пользователи\n **Только боты** — только боты",
                inline: false
            });

            embed.addFields({
                name: "**Примеры использования**",
                value: "`/serverstats create type:members channel_type:voice category:Stats`\n`/serverstats create type:bots channel_type:text category:Server Info`\n`/serverstats list`",
                inline: false
            });

            embed.setFooter({
                text: "Система счётчиков • Автоматическое обновление каждые 15 минут"
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            }).catch(logger.error);

            return;
        }

        const embed = createEmbed({
            title: `Счётчики сервера (${validCounters.length})`,
            description: "Все активные счётчики этого сервера.\n\nСчётчики автоматически обновляются каждые 15 минут.",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);

            if (!channel) {
                logger.warn(
                    `У счётчика ${counter.id} по-прежнему отсутствует канал после очистки`
                );
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':')
                ? '✅ Активен'
                : '⚠️ Не обновлён';

            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Счётчик #${i + 1} — ${channel.name}`,
                value:
                    `**ID:** \`${counter.id}\`\n` +
                    `**Тип:** ${getCounterTypeDisplay(counter.type)}\n` +
                    `**Канал:** ${channel}\n` +
                    `**Текущее значение:** ${currentCount}\n` +
                    `**Статус:** ${status}\n` +
                    `**Создан:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "**Статистика**",
            value:
                `**Всего счётчиков:** ${validCounters.length}\n` +
                `**Активных счётчиков:** ${validCounters.filter(c => {
                    const channel = guild.channels.cache.get(c.channelId);
                    return channel && channel.name.includes(':');
                }).length}\n` +
                `**Следующее обновление:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**Команды управления**",
            value:
                "`/serverstats create` — Создать новый счётчик\n" +
                "`/serverstats update` — Обновить существующий счётчик\n" +
                "`/serverstats delete` — Удалить счётчик",
            inline: false
        });

        embed.setFooter({
            text: "Система счётчиков • Автоматическое обновление каждые 15 минут"
        });

        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Ошибка при отображении счётчиков:", error);

        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Произошла ошибка при получении списка счётчиков. Попробуйте ещё раз.'
        }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}
