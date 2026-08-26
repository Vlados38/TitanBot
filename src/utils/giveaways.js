// giveaways.js

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from './logger.js';
import { TitanBotError, ErrorTypes } from './errorHandler.js';
import { unwrapReplitData } from './database.js';
import { 
    createGiveawayEmbed as createGiveawayEmbedService,
    createGiveawayButtons as createGiveawayButtonsService,
    selectWinners as selectWinnersService
} from '../services/giveawayService.js';

export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}

function arrayToGiveawayMap(giveaways) {
    const map = {};
    if (Array.isArray(giveaways)) {
        for (const giveaway of giveaways) {
            if (giveaway && giveaway.messageId) {
                map[giveaway.messageId] = giveaway;
            }
        }
    }
    return map;
}

export async function getGuildGiveaways(client, guildId) {
    try {
        if (!client.db) {
            logger.warn('База данных недоступна для getGuildGiveaways');
            return [];
        }

        const key = giveawayKey(guildId);
        const giveaways = await client.db.get(key, {});
        const unwrappedGiveaways = unwrapReplitData(giveaways);

        if (typeof unwrappedGiveaways === 'object' && !Array.isArray(unwrappedGiveaways)) {
            return Object.values(unwrappedGiveaways || {});
        }
        return Array.isArray(unwrappedGiveaways) ? unwrappedGiveaways : [];
    } catch (error) {
        logger.error(`Ошибка при получении розыгрышей для сервера ${guildId}:`, error);
        return [];
    }
}

export async function saveGiveaway(client, guildId, giveawayData) {
    try {
        if (!client.db) {
            logger.warn('База данных недоступна для saveGiveaway');
            return false;
        }

        if (!giveawayData || !giveawayData.messageId) {
            throw new TitanBotError(
                'Invalid giveaway data: missing messageId',
                ErrorTypes.VALIDATION,
                'Невозможно сохранить розыгрыш без ID сообщения.',
                { giveawayData }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        const giveawayMap = arrayToGiveawayMap(giveaways);
        giveawayMap[giveawayData.messageId] = giveawayData;
        
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Розыгрыш ${giveawayData.messageId} сохранён на сервере ${guildId}`);
        return true;
    } catch (error) {
        logger.error(`Ошибка при сохранении розыгрыша на сервере ${guildId}:`, error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        return false;
    }
}

export async function deleteGiveaway(client, guildId, messageId) {
    try {
        if (!client.db) {
            logger.warn('База данных недоступна для deleteGiveaway');
            return false;
        }

        if (!messageId) {
            throw new TitanBotError(
                'Missing messageId parameter',
                ErrorTypes.VALIDATION,
                'Невозможно удалить розыгрыш без ID сообщения.',
                { messageId }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        const giveawayMap = arrayToGiveawayMap(giveaways);
        
        if (!giveawayMap[messageId]) {
            logger.debug(`Розыгрыш не найден для удаления: ${messageId} на сервере ${guildId}`);
            return false;
        }
        
        delete giveawayMap[messageId];
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Розыгрыш ${messageId} удалён с сервера ${guildId}`);
        return true;
    } catch (error) {
        logger.error(`Ошибка при удалении розыгрыша ${messageId} на сервере ${guildId}:`, error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        return false;
    }
}

export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        return createGiveawayEmbedService(giveaway, status, winners);
    } catch (error) {
        logger.error('Ошибка при создании embed розыгрыша:', error);
        throw error;
    }
}

export function isGiveawayEnded(giveaway) {
    if (!giveaway) return true;
    const endTime = giveaway.endsAt || giveaway.endTime;
    return Date.now() > endTime;
}

export function pickWinners(entrants, count) {
    try {
        return selectWinnersService(entrants, count);
    } catch (error) {
        logger.error('Ошибка при выборе победителей:', error);
        
        if (!entrants || entrants.length === 0) return [];
        const requested = Math.min(count, entrants.length);
        const shuffled = [...entrants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    }
}

export function giveawayEmbed(giveaway, status, winners = []) {
    return createGiveawayEmbed(giveaway, status, winners);
}

export function giveawayButtons(ended = false) {
    try {
        return createGiveawayButtonsService(ended);
    } catch (error) {
        logger.error('Ошибка при создании кнопок розыгрыша:', error);
        
        const row = new ActionRowBuilder();
        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Перевыбрать')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ Просмотреть')
                    .setStyle(ButtonStyle.Primary)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Участвовать')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 Завершить')
                    .setStyle(ButtonStyle.Danger)
            );
        }
        return row;
    }
}
