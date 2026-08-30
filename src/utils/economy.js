// economy.js

import { getColor, getEconomyKey as getEconomyStorageKey } from './database.js';
import { BotConfig } from '../config/bot.js';
import { normalizeEconomyData } from './schemas.js';
import { logger } from './logger.js';
import { validateDiscordId, validateNumber } from './validation.js';
import { DEFAULT_ECONOMY_DATA } from './constants.js';
import { createError, ErrorTypes, wrapServiceBoundary } from './errorHandler.js';
import {
    checkAndUnlockAchievements,
} from '../services/achievements/achievementService.js';


const ECONOMY_CONFIG = BotConfig.economy || {};
const BASE_BANK_CAPACITY = ECONOMY_CONFIG.baseBankCapacity || 10000;
const BANK_CAPACITY_PER_LEVEL = ECONOMY_CONFIG.bankCapacityPerLevel || 5000;
const DAILY_AMOUNT = ECONOMY_CONFIG.dailyAmount || 100;
const WORK_MIN = ECONOMY_CONFIG.workMin || 10;
const WORK_MAX = ECONOMY_CONFIG.workMax || 100;
const COOLDOWNS = ECONOMY_CONFIG.cooldowns || {
    daily: 24 * 60 * 60 * 1000,
    work: 60 * 60 * 1000,
    crime: 2 * 60 * 60 * 1000,
    rob: 4 * 60 * 60 * 1000,
};

export function getEconomyKey(guildId, userId) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(userId, 'userId');
    
    if (!validGuildId || !validUserId) {
        throw new Error('Недействительный ID сервера или пользователя');
    }
    
    return getEconomyStorageKey(validGuildId, validUserId);
}

export function getMaxBankCapacity(userData) {
    if (!userData) return BASE_BANK_CAPACITY;
    
    const bankLevel = userData.bankLevel || 0;
    let capacity = BASE_BANK_CAPACITY + (bankLevel * BANK_CAPACITY_PER_LEVEL);

    const upgrades = userData.upgrades || {};
    const inventory = userData.inventory || {};

    if (upgrades['bank_upgrade_1']) {
        capacity = Math.floor(capacity * 1.5);
    }

    const bankNotes = inventory['bank_note'] || 0;
    capacity += (bankNotes * 10000);
    
    return capacity;
}

export function formatCurrency(amount) {
    const currencyName = ECONOMY_CONFIG.currency?.name || 'монет';
    return `${amount.toLocaleString()} ${currencyName}`;
}

export async function getEconomyData(client, guildId, userId) {
    try {
        if (!client.db || typeof client.db.get !== 'function') {
            throw new Error('База данных недоступна');
        }

        const key = getEconomyKey(guildId, userId);
        const data = await client.db.get(key, {});
        const defaults = {
            ...DEFAULT_ECONOMY_DATA,
            wallet: ECONOMY_CONFIG.startingBalance ?? DEFAULT_ECONOMY_DATA.wallet,
        };
        
        return normalizeEconomyData(data, defaults);
    } catch (error) {
        logger.error(`Ошибка получения данных экономики для пользователя ${userId}`, error);
        return normalizeEconomyData({}, DEFAULT_ECONOMY_DATA);
    }
}

export async function setEconomyData(client, guildId, userId, data) {
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            throw new Error('База данных недоступна');
        }

        const key = getEconomyKey(guildId, userId);
        const normalized = normalizeEconomyData(data, DEFAULT_ECONOMY_DATA);
        await client.db.set(key, normalized);
        return true;
    } catch (error) {
        logger.error(`Ошибка сохранения данных экономики для пользователя ${userId}`, error);
        return false;
    }
}

export async function updateBalance(client, guildId, userId, options = {}) {
    const data = await getEconomyData(client, guildId, userId);
    
    if (options.wallet !== undefined) {
        data.wallet = Math.max(0, (data.wallet || 0) + options.wallet);
    }
    
    if (options.bank !== undefined) {
        const maxBank = getMaxBankCapacity(data);
        data.bank = Math.min(Math.max(0, (data.bank || 0) + options.bank), maxBank);
    }
    
    if (options.xp !== undefined) {
        data.xp = Math.max(0, (data.xp || 0) + options.xp);
        
        const xpNeeded = Math.floor(5 * Math.pow(data.level || 1, 2) + 50 * (data.level || 1) + 100);
        if (data.xp >= xpNeeded) {
            data.xp -= xpNeeded;
            data.level = (data.level || 1) + 1;
            data.leveledUp = true;
        }
    }
    
    await setEconomyData(client, guildId, userId, data);
    return data;
}

export function checkCooldown(userData, action) {
    const cooldownTime = COOLDOWNS[action] || 0;
    const lastUsed = userData[`last${action.charAt(0).toUpperCase() + action.slice(1)}`] || 0;
    const now = Date.now();
    const remaining = Math.max(0, (lastUsed + cooldownTime) - now);
    
    return {
        onCooldown: remaining > 0,
        remaining,
        formatted: formatCooldown(remaining)
    };
}

function formatCooldown(ms) {
    if (ms < 1000) return 'сейчас';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}д ${hours % 24}ч`;
    if (hours > 0) return `${hours}ч ${minutes % 60}м`;
    if (minutes > 0) return `${minutes}м ${seconds % 60}с`;
    return `${seconds}с`;
}

export function getWorkReward() {
    const amount = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
    const jobs = [
        'работал в ресторане быстрого питания',
        'работал программистом',
        'работал строителем',
        'работал врачом',
        'работал стримером',
        'работал ютубером',
        'работал учителем',
        'работал кассиром',
        'работал курьером',
        'работал фрилансером'
    ];
    
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    
    return {
        amount,
        job,
        message: `Ты ${job} и заработал ${formatCurrency(amount)}!`
    };
}

export function getCrimeOutcome() {
    const outcomes = [
        {
            success: true,
            amount: Math.floor(Math.random() * 200) + 50,
            message: 'Ты успешно ограбил банк и скрылся с {amount}!'
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 100) + 20,
            message: 'Ты обокрал кого-то и украл {amount}!'
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 150) + 30,
            message: 'Ты взломал банковский счёт и перевёл себе {amount}!'
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 100) + 50,
            message: 'Тебя поймали, и тебе пришлось заплатить штраф в размере {fine}!'
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 150) + 50,
            message: 'Полиция поймала тебя! Ты заплатил {fine}, чтобы выйти из тюрьмы.'
        },
        {
            success: false,
            fine: 0,
            message: 'Попытка провалилась, но тебе удалось сбежать!'
        }
    ];
    
    return outcomes[Math.floor(Math.random() * outcomes.length)];
}

export function getRobOutcome(targetBalance) {
    if (targetBalance <= 0) {
        return {
            success: false,
            amount: 0,
            message: 'У цели нет денег, которые можно украсть!'
        };
    }
    
    const success = Math.random() > 0.4;
    
    if (success) {
        const amount = Math.min(
            Math.floor(Math.random() * (targetBalance * 0.3)) + 1,
            targetBalance
        );
        
        return {
            success: true,
            amount,
            message: `Ты успешно ограбил цель и скрылся с {amount}!`
        };
    } else {
        const fine = Math.floor(Math.random() * 200) + 100;
        
        return {
            success: false,
            amount: 0,
            fine,
            message: `Тебя поймали! Тебе пришлось заплатить штраф в размере {fine}.`
        };
    }
}

export function formatShopItem(item, index) {
    return `**${index + 1}.** ${item.emoji} **${item.name}** - ${formatCurrency(item.price)}\n${item.description}\n`;
}

export const addMoney = wrapServiceBoundary(async function addMoney(client, guildId, userId, amount, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            'Недействительная сумма',
            ErrorTypes.VALIDATION,
            'Сумма должна быть положительным числом.',
            { guildId, userId, amount, operation: 'addMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            'Недействительный тип денег',
            ErrorTypes.VALIDATION,
            'Тип должен быть "wallet" или "bank".',
            { guildId, userId, type, operation: 'addMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        const maxBank = getMaxBankCapacity(userData);
        if ((userData.bank || 0) + validAmount > maxBank) {
            throw createError(
                'Превышена вместимость банка',
                ErrorTypes.VALIDATION,
                `Превышена вместимость банка. Сейчас: ${userData.bank || 0}, максимум: ${maxBank}.`,
                { guildId, userId, current: userData.bank || 0, max: maxBank, operation: 'addMoney' }
            );
        }
        userData.bank = (userData.bank || 0) + validAmount;
    } else {
        userData.wallet = (userData.wallet || 0) + validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
        ...(type === 'bank' ? { maxBank: getMaxBankCapacity(userData) } : {}),
    };
}, {
    service: 'economy',
    operation: 'addMoney',
    userMessage: 'Не удалось добавить деньги. Попробуйте ещё раз.',
});

export const removeMoney = wrapServiceBoundary(async function removeMoney(client, guildId, userId, amount, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            'Недействительная сумма',
            ErrorTypes.VALIDATION,
            'Сумма должна быть положительным числом.',
            { guildId, userId, amount, operation: 'removeMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            'Недействительный тип денег',
            ErrorTypes.VALIDATION,
            'Тип должен быть "wallet" или "bank".',
            { guildId, userId, type, operation: 'removeMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        if ((userData.bank || 0) < validAmount) {
            throw createError(
                'Недостаточно средств в банке',
                ErrorTypes.VALIDATION,
                `Недостаточно средств в банке. У вас ${userData.bank || 0}, требуется ${validAmount}.`,
                { guildId, userId, current: userData.bank || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.bank = (userData.bank || 0) - validAmount;
    } else {
        if ((userData.wallet || 0) < validAmount) {
            throw createError(
                'Недостаточно средств в кошельке',
                ErrorTypes.VALIDATION,
                `Недостаточно средств в кошельке. У вас ${userData.wallet || 0}, требуется ${validAmount}.`,
                { guildId, userId, current: userData.wallet || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.wallet = (userData.wallet || 0) - validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
    };
}, {
    service: 'economy',
    operation: 'removeMoney',
    userMessage: 'Не удалось снять деньги. Попробуйте ещё раз.',
});

export function getShopInventory() {
    return [
        {
            id: 'fishing_rod',
            name: 'Удочка',
            emoji: '🎣',
            price: 500,
            description: 'Лови рыбу и продавай её ради прибыли!',
            type: 'tool'
        },
        {
            id: 'hunting_rifle',
            name: 'Охотничья винтовка',
            emoji: '🔫',
            price: 1000,
            description: 'Охоться на животных ради мяса и меха!',
            type: 'tool'
        },
        {
            id: 'laptop',
            name: 'Ноутбук',
            emoji: '💻',
            price: 2000,
            description: 'Работай программистом и получай больше денег!',
            type: 'tool',
            workMultiplier: 1.5
        },
        {
            id: 'bank_loan',
            name: 'Банковский кредит',
            emoji: '🏦',
            price: 5000,
            description: 'Увеличивает вместимость банка на 50 000!',
            type: 'upgrade',
            effect: 'bank_capacity',
            value: 50000
        },
        {
            id: 'lottery_ticket',
            name: 'Лотерейный билет',
            emoji: '🎫',
            price: 100,
            description: 'Шанс сорвать большой куш!',
            type: 'consumable',
            use: 'gamble'
        }
    ];
}
