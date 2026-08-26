// giveawayService.js

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getColor, botConfig } from '../config/bot.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const GIVEAWAY_CONFIG = botConfig.giveaways || {};
const GIVEAWAY_INTERACTION_COOLDOWN = 1000;

function getGiveawayInteractionKey(userId, giveawayId) {
    return `giveaway:${userId}:${giveawayId}`;
}

export function parseDuration(durationString) {
    if (!durationString || typeof durationString !== 'string') {
        throw new TitanBotError(
            'Предоставлен некорректный формат длительности',
            ErrorTypes.VALIDATION,
            'Пожалуйста, укажите корректную длительность (например: 1h, 30m, 5d, 10s).',
            { durationString }
        );
    }

    const regex = /^(\d+)([hmds])$/i;
    const match = durationString.trim().match(regex);

    if (!match) {
        throw new TitanBotError(
            `Некорректный формат длительности: ${durationString}`,
            ErrorTypes.VALIDATION,
            'Некорректный формат длительности. Используйте: 1h, 30m, 5d, 10s (минимум: 10s, максимум: 30d).',
            { input: durationString }
        );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (amount <= 0 || amount > 999) {
        throw new TitanBotError(
            `Значение длительности вне допустимого диапазона: ${amount}`,
            ErrorTypes.VALIDATION,
            'Значение длительности должно быть от 1 до 999.',
            { amount, unit }
        );
    }

    let ms = 0;
    switch (unit) {
        case 's':
            ms = amount * 1000;
            break;
        case 'm':
            ms = amount * 60 * 1000;
            break;
        case 'h':
            ms = amount * 60 * 60 * 1000;
            break;
        case 'd':
            ms = amount * 24 * 60 * 60 * 1000;
            break;
        default:
            throw new TitanBotError(
                `Неизвестная единица длительности: ${unit}`,
                ErrorTypes.VALIDATION,
                'Используйте s (секунды), m (минуты), h (часы) или d (дни).',
                { unit }
            );
    }

    const maxDuration = GIVEAWAY_CONFIG.maximumDuration ?? 30 * 24 * 60 * 60 * 1000;
    if (ms > maxDuration) {
        throw new TitanBotError(
            `Длительность превышает максимальную: ${ms}мс > ${maxDuration}мс`,
            ErrorTypes.VALIDATION,
            `Максимальная длительность — ${Math.floor(maxDuration / (24 * 60 * 60 * 1000))} дней.`,
            { requestedMs: ms, maxMs: maxDuration }
        );
    }

    const minDuration = GIVEAWAY_CONFIG.minimumDuration ?? 10 * 1000;
    if (ms < minDuration) {
        throw new TitanBotError(
            `Длительность меньше минимальной: ${ms}мс < ${minDuration}мс`,
            ErrorTypes.VALIDATION,
            `Минимальная длительность — ${Math.ceil(minDuration / 1000)} секунд.`,
            { requestedMs: ms, minMs: minDuration }
        );
    }

    return ms;
}

export function validatePrize(prize) {
    if (!prize || typeof prize !== 'string') {
        throw new TitanBotError(
            'Приз должен быть непустой строкой',
            ErrorTypes.VALIDATION,
            'Пожалуйста, укажите корректное описание приза.',
            { prize }
        );
    }

    const trimmed = prize.trim();
    if (trimmed.length === 0 || trimmed.length > 256) {
        throw new TitanBotError(
            `Длина приза вне допустимого диапазона: ${trimmed.length}`,
            ErrorTypes.VALIDATION,
            'Название приза должно содержать от 1 до 256 символов.',
            { length: trimmed.length }
        );
    }

    return trimmed;
}

export function validateWinnerCount(winnerCount) {
    const minimumWinners = GIVEAWAY_CONFIG.minimumWinners ?? 1;
    const maximumWinners = GIVEAWAY_CONFIG.maximumWinners ?? 10;

    if (!Number.isInteger(winnerCount) || winnerCount < minimumWinners || winnerCount > maximumWinners) {
        throw new TitanBotError(
            `Некорректное количество победителей: ${winnerCount}`,
            ErrorTypes.VALIDATION,
            `Количество победителей должно быть от ${minimumWinners} до ${maximumWinners}.`,
            { winnerCount, minimumWinners, maximumWinners }
        );
    }
}

export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        const statusEmoji = status === 'ended' ? '🎉' : status === 'reroll' ? '🔄' : '🎉';
        const isEnded = status === 'ended' || status === 'reroll';
        const color = isEnded ? getColor('giveaway.ended') : getColor('giveaway.active');
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${giveaway.prize}`)
            .setDescription('Нажмите кнопку ниже, чтобы принять участие!')
            .setColor(color)
            .addFields(
                { name: '👤 Организатор', value: `<@${giveaway.hostId}>`, inline: true },
                { name: '🏆 Победители', value: giveaway.winnerCount.toString(), inline: true },
                { name: '👥 Участники', value: giveaway.participants?.length?.toString() || '0', inline: true }
            );

        if (isEnded) {
            const winnerDisplay = winners.length > 0 
                ? winners.map(id => `<@${id}>`).join(', ')
                : 'Нет действительных участников';
            embed.addFields({ name: '🎯 Победители', value: winnerDisplay, inline: false });
        } else {
            const endTime = giveaway.endsAt || giveaway.endTime;
            embed.addFields({ name: '⏰ Завершится', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: false });
        }

        embed.setTimestamp();
        
        return embed;
    } catch (error) {
        logger.error('Ошибка при создании embed розыгрыша:', error);
        throw new TitanBotError(
            'Не удалось создать embed розыгрыша',
            ErrorTypes.UNKNOWN,
            'Произошла внутренняя ошибка при оформлении розыгрыша.',
            { error: error.message }
        );
    }
}

export function createGiveawayButtons(ended = false) {
    try {
        const row = new ActionRowBuilder();

        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Перевыбрать')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ Посмотреть победителей')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Участвовать')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 Завершить')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(false)
            );
        }

        return row;
    } catch (error) {
        logger.error('Ошибка при создании кнопок розыгрыша:', error);
        throw new TitanBotError(
            'Не удалось создать кнопки розыгрыша',
            ErrorTypes.UNKNOWN,
            'Произошла внутренняя ошибка при создании интерактивных кнопок.',
            { error: error.message }
        );
    }
}

export function selectWinners(participants, winnerCount) {
    if (!Array.isArray(participants) || participants.length === 0) {
        return [];
    }

    const uniqueParticipants = [...new Set(participants)];

    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
        throw new TitanBotError(
            'Некорректное количество победителей для выбора',
            ErrorTypes.VALIDATION,
            'Количество победителей должно быть не менее 1.',
            { winnerCount }
        );
    }

    const requested = Math.min(winnerCount, uniqueParticipants.length);
    
    try {
        
        const shuffled = [...uniqueParticipants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    } catch (error) {
        logger.error('Ошибка при выборе победителей:', error);
        throw new TitanBotError(
            'Не удалось выбрать победителей',
            ErrorTypes.UNKNOWN,
            'Произошла ошибка при выборе победителей.',
            { error: error.message, participantCount: participants.length }
        );
    }
}

export function isUserRateLimited(userId, giveawayId) {
    const status = getRateLimitStatus(
        getGiveawayInteractionKey(userId, giveawayId),
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
    return status.attempts >= 1 && status.remaining > 0;
}

export async function recordUserInteraction(userId, giveawayId) {
    await checkRateLimit(
        getGiveawayInteractionKey(userId, giveawayId),
        1,
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
}

export async function endGiveaway(client, giveaway, guildId, endedBy) {
    try {
        if (!giveaway) {
            throw new TitanBotError(
                'Объект розыгрыша имеет значение null или undefined',
                ErrorTypes.VALIDATION,
                'Невозможно завершить несуществующий розыгрыш.',
                { giveaway }
            );
        }

        if (giveaway.ended === true || giveaway.isEnded === true) {
            throw new TitanBotError(
                `Розыгрыш ${giveaway.messageId} уже завершён`,
                ErrorTypes.VALIDATION,
                'Этот розыгрыш уже завершён.',
                { giveawayId: giveaway.messageId, status: 'already_ended' }
            );
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const updatedGiveaway = {
            ...giveaway,
            ended: true,
            isEnded: true,
            winnerIds: winners,
            endedAt: new Date().toISOString(),
            endedBy: endedBy,
            participantCount: participants.length
        };

        logger.info(`Завершение розыгрыша ${giveaway.messageId}: выбрано победителей: ${winners.length} из ${participants.length} участников`);

        return {
            giveaway: updatedGiveaway,
            winners: winners,
            participantCount: participants.length
        };
    } catch (error) {
        if (error instanceof TitanBotError) {
            logger.debug(`Ошибка проверки при завершении розыгрыша: ${error.message}`, error.context || {});
            throw error;
        }
        logger.error('Ошибка при завершении розыгрыша:', error);
        throw new TitanBotError(
            'Не удалось завершить розыгрыш',
            ErrorTypes.UNKNOWN,
            'Произошла ошибка при завершении розыгрыша.',
            { error: error.message, giveawayId: giveaway?.messageId }
        );
    }
}

export async function checkGiveaways(client) {
  try {
    if (!client.db) {
      logger.warn('База данных недоступна для проверки розыгрышей');
      return;
    }

    const endedGiveaways = await getEndedGiveaways(client);
    
    if (endedGiveaways.length === 0) {
      return;
    }

    logger.info(`Обработка завершённых розыгрышей: ${endedGiveaways.length}`);

    for (const giveawayRecord of endedGiveaways) {
      try {
        const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = giveawayRecord;
        const giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          logger.debug(`Сервер ${guildId} не найден, пропускаем розыгрыш ${messageId}`);
          continue;
        }

        const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) {
          logger.debug(`Канал ${giveaway.channelId} не найден для розыгрыша ${messageId}`);
          continue;
        }

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          logger.debug(`Сообщение ${messageId} не найдено в канале розыгрыша ${giveaway.channelId}`);
          continue;
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const winnerMentions = winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'Нет действительных участников!';

        const endedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);

        await message.edit({
          embeds: [endedEmbed],
          components: [createGiveawayButtons(true)]
        });

        giveaway.ended = true;
        giveaway.isEnded = true;
        giveaway.winnerIds = winners;
        giveaway.endedAt = new Date().toISOString();

        const markedSuccess = await markGiveawayEnded(client, giveawayId, giveaway);
        if (!markedSuccess) {
          logger.warn(`Не удалось отметить розыгрыш ${messageId} как завершённый в базе данных`);
        }

        if (winners.length > 0) {
          const winnerAnnouncement = `🎉 Поздравляем ${winnerMentions}! Вы выиграли **${giveaway.prize || 'розыгрыш'}**! Свяжитесь с <@${giveaway.hostId}>, чтобы получить свой приз.`;
          const winnerPingMsg = await channel.send({ content: winnerAnnouncement });
          giveaway.winnerPingMessageId = winnerPingMsg.id;
          await markGiveawayEnded(client, giveawayId, giveaway);

          try {
            await logEvent({
              client,
              guildId,
              eventType: EVENT_TYPES.GIVEAWAY_WINNER,
              data: {
                description: `Розыгрыш завершён с ${winners.length} победителем(ями)`,
                channelId: channel.id,
                fields: [
                  {
                    name: '🎁 Приз',
                    value: giveaway.prize || 'Таинственный приз!',
                    inline: true
                  },
                  {
                    name: '🏆 Победители',
                    value: winners.map(id => `<@${id}>`).join(', '),
                    inline: false
                  },
                  {
                    name: '👥 Участники',
                    value: participants.length.toString(),
                    inline: true
                  }
                ]
              }
            });
          } catch (error) {
            logger.debug('Ошибка при записи победителя розыгрыша в журнал:', error);
          }
        } else {
          await channel.send({ content: `Розыгрыш **${giveaway.prize}** завершён без действительных участников.` });
        }

        logger.info(`Розыгрыш ${messageId} на сервере ${guildId} завершён`);
      } catch (error) {
        logger.error(`Ошибка при обработке розыгрыша:`, error);
      }
    }
  } catch (error) {
    logger.error('Ошибка при проверке розыгрышей:', error);
  }
}
