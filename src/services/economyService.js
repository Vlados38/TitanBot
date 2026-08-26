// economyService.js

import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../utils/serviceErrorBoundary.js';

class EconomyService {

  static DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
  static WORK_COOLDOWN = 30 * 60 * 1000;
  static GAMBLE_COOLDOWN = 5 * 60 * 1000;
  static CRIME_COOLDOWN = 60 * 60 * 1000;
  static ROB_COOLDOWN = 4 * 60 * 60 * 1000;
  static MINE_COOLDOWN = 60 * 60 * 1000;
  static FISH_COOLDOWN = 45 * 60 * 1000;
  static BEG_COOLDOWN = 30 * 60 * 1000;
  
  static DAILY_AMOUNT = 1000;
  static MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

  static assertSafeBalance(value, context = {}) {
    if (!Number.isSafeInteger(value) || value < 0 || value > this.MAX_SAFE_INTEGER) {
      throw createError(
        "Некорректное состояние баланса",
        ErrorTypes.VALIDATION,
        "Операция приведёт к недопустимому состоянию баланса аккаунта.",
        { value, ...context }
      );
    }
  }

  static async claimDaily(client, guildId, userId) {
    logger.debug(`[ECONOMY_SERVICE] Запрошено получение ежедневной награды`, { userId, guildId });
    
    const userData = await getEconomyData(client, guildId, userId);
    if (!userData) {
      logger.error(`[ECONOMY_SERVICE] Не удалось загрузить данные экономики для ежедневной награды`);
      throw createError(
        "Не удалось загрузить данные экономики",
        ErrorTypes.DATABASE,
        "Не удалось загрузить ваши данные экономики. Пожалуйста, попробуйте позже.",
        { userId, guildId }
      );
    }

    const now = Date.now();
    const lastDaily = userData.lastDaily || 0;
    const remaining = lastDaily + this.DAILY_COOLDOWN - now;

    if (remaining > 0) {
      logger.warn(`[ECONOMY_SERVICE] Действует кулдаун ежедневной награды`, {
        userId,
        timeRemaining: remaining
      });
      throw createError(
        "Действует кулдаун ежедневной награды",
        ErrorTypes.RATE_LIMIT,
        `Вам нужно подождать, прежде чем снова получить ежедневную награду. Попробуйте через **${this.formatDuration(remaining)}**.`,
        { remaining, cooldownType: 'daily' }
      );
    }

    const earned = this.DAILY_AMOUNT;
    const nextWallet = (userData.wallet || 0) + earned;
    this.assertSafeBalance(nextWallet, { operation: 'claimDaily', userId, guildId });
    userData.wallet = nextWallet;
    userData.lastDaily = now;

    try {
      await setEconomyData(client, guildId, userId, userData);
      
      logger.info(`[ECONOMY_TRANSACTION] Ежедневная награда получена`, {
        userId,
        guildId,
        amount: earned,
        newWallet: userData.wallet,
        timestamp: new Date().toISOString(),
        source: 'claim_daily'
      });

      return {
        earned,
        newWallet: userData.wallet,
        nextClaimTime: new Date(now + this.DAILY_COOLDOWN)
      };
    } catch (error) {
      logger.error(`[ECONOMY_SERVICE] Не удалось сохранить получение ежедневной награды`, error, {
        userId,
        guildId,
        amount: earned
      });
      throw createError(
        "Не удалось сохранить ежедневную награду",
        ErrorTypes.DATABASE,
        "Не удалось обработать получение ежедневной награды. Пожалуйста, попробуйте ещё раз.",
        { userId, guildId }
      );
    }
  }

  static async transferMoney(client, guildId, senderId, receiverId, amount) {
    logger.debug(`[ECONOMY_SERVICE] Запрошен перевод денег`, {
      senderId,
      receiverId,
      amount,
      guildId
    });

    if (amount <= 0) {
      throw createError(
        "Некорректная сумма перевода",
        ErrorTypes.VALIDATION,
        "Сумма должна быть больше нуля.",
        { amount, senderId }
      );
    }

    if (senderId === receiverId) {
      throw createError(
        "Нельзя перевести деньги самому себе",
        ErrorTypes.VALIDATION,
        "Вы не можете перевести деньги самому себе.",
        { senderId, receiverId }
      );
    }

    this.validateAmount(amount, { operation: 'transfer', senderId, receiverId });

    const [senderData, receiverData] = await Promise.all([
      getEconomyData(client, guildId, senderId),
      getEconomyData(client, guildId, receiverId)
    ]);

    if (!senderData || !receiverData) {
      logger.error(`[ECONOMY_SERVICE] Не удалось загрузить данные экономики для перевода`, {
        senderLoaded: !!senderData,
        receiverLoaded: !!receiverData
      });
      throw createError(
        "Не удалось загрузить данные экономики",
        ErrorTypes.DATABASE,
        "Не удалось загрузить данные экономики. Пожалуйста, попробуйте позже.",
        { senderId, receiverId, guildId }
      );
    }

    if (senderData.wallet < amount) {
      logger.warn(`[ECONOMY_SERVICE] Недостаточно средств для перевода`, {
        senderId,
        required: amount,
        available: senderData.wallet
      });
      throw createError(
        "Недостаточно средств",
        ErrorTypes.VALIDATION,
        `У вас есть только **$${senderData.wallet.toLocaleString()}** наличными.`,
        { required: amount, available: senderData.wallet, senderId }
      );
    }

    const walletBefore = senderData.wallet;
    const senderNext = (senderData.wallet || 0) - amount;
    const receiverNext = (receiverData.wallet || 0) + amount;

    this.assertSafeBalance(senderNext, { operation: 'transfer.sender', senderId, amount });
    this.assertSafeBalance(receiverNext, { operation: 'transfer.receiver', receiverId, amount });

    senderData.wallet = senderNext;
    receiverData.wallet = receiverNext;

    try {
      
      await setEconomyData(client, guildId, senderId, senderData);
      
      try {
        
        await setEconomyData(client, guildId, receiverId, receiverData);
      } catch (receiverError) {
        
        logger.error(`[ECONOMY_CRITICAL] Не удалось зачислить средства получателю ${receiverId}. Выполняется откат для отправителя ${senderId}...`, receiverError);
        
        senderData.wallet = walletBefore;
        try {
          await setEconomyData(client, guildId, senderId, senderData);
          logger.info(`[ECONOMY_ROLLBACK] Отправитель ${senderId} успешно восстановлен после ошибки зачисления получателю.`);
        } catch (rollbackError) {
          logger.error(`[ECONOMY_FATAL] ОШИБКА ОТКАТА для отправителя ${senderId}! Данные теперь могут быть несогласованными.`, rollbackError);
          
        }
        
        throw receiverError;
      }

      logger.info(`[ECONOMY_TRANSACTION] Деньги переведены`, {
        type: 'transfer',
        senderId,
        receiverId,
        guildId,
        amount,
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet,
        timestamp: new Date().toISOString()
      });

      return {
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet
      };
    } catch (error) {
      logger.error(`[ECONOMY_SERVICE] Ошибка выполнения перевода, ДАННЫЕ МОГУТ БЫТЬ НЕСОГЛАСОВАННЫМИ`, error, {
        senderId,
        receiverId,
        amount,
        guildId,
        senderBefore: walletBefore,
        senderAfter: senderData.wallet,
        receiverAfter: receiverData.wallet
      });
      throw createError(
        "Не удалось сохранить перевод",
        ErrorTypes.DATABASE,
        "Не удалось выполнить перевод. Пожалуйста, попробуйте ещё раз.",
        { senderId, receiverId, amount }
      );
    }
  }

  static async addMoney(client, guildId, userId, amount, source = 'unknown') {
    if (amount <= 0) {
      throw createError(
        "Некорректная сумма",
        ErrorTypes.VALIDATION,
        "Сумма должна быть положительной.",
        { amount, userId, source }
      );
    }

    this.validateAmount(amount, { operation: 'addMoney', userId, source });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;
    const nextWallet = balanceBefore + amount;
    this.assertSafeBalance(nextWallet, { operation: 'addMoney', userId, source, amount });
    userData.wallet = nextWallet;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Деньги добавлены`, {
      userId,
      guildId,
      amount,
      source,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async removeMoney(client, guildId, userId, amount, reason = 'unknown') {
    if (amount <= 0) {
      throw createError(
        "Некорректная сумма",
        ErrorTypes.VALIDATION,
        "Сумма должна быть положительной.",
        { amount, userId, reason }
      );
    }

    this.validateAmount(amount, { operation: 'removeMoney', userId, reason });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;

    if (balanceBefore < amount) {
      throw createError(
        "Недостаточно средств",
        ErrorTypes.VALIDATION,
        `У вас есть только **$${balanceBefore.toLocaleString()}**.`,
        { required: amount, available: balanceBefore, reason }
      );
    }

    userData.wallet = balanceBefore - amount;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Деньги удалены`, {
      userId,
      guildId,
      amount,
      reason,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: -amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async depositToBank(client, guildId, userId, amount) {
    this.validateAmount(amount, { operation: 'deposit', userId });

    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);

    if (userData.wallet < amount) {
      throw createError(
        "Недостаточно наличных",
        ErrorTypes.VALIDATION,
        `У вас есть только **$${userData.wallet.toLocaleString()}** наличными.`,
        { required: amount, available: userData.wallet }
      );
    }

    const currentBank = userData.bank || 0;
    if (currentBank + amount > maxBank) {
      throw createError(
        "Превышена вместимость банка",
        ErrorTypes.VALIDATION,
        `Ваш банк может хранить только **$${maxBank.toLocaleString()}**. Вы превысите лимит на **$${(currentBank + amount - maxBank).toLocaleString()}**.`,
        { capacity: maxBank, current: currentBank, requested: amount }
      );
    }

    const nextWallet = userData.wallet - amount;
    const nextBank = (userData.bank || 0) + amount;

    this.assertSafeBalance(nextWallet, { operation: 'deposit.wallet', userId, amount });
    this.assertSafeBalance(nextBank, { operation: 'deposit.bank', userId, amount });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Деньги внесены в банк`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async withdrawFromBank(client, guildId, userId, amount) {
    this.validateAmount(amount, { operation: 'withdraw', userId });

    const userData = await getEconomyData(client, guildId, userId);
    const bank = userData.bank || 0;

    if (bank < amount) {
      throw createError(
        "Недостаточно средств на банковском счёте",
        ErrorTypes.VALIDATION,
        `У вас есть только **$${bank.toLocaleString()}** в банке.`,
        { required: amount, available: bank }
      );
    }

    const nextWallet = (userData.wallet || 0) + amount;
    const nextBank = bank - amount;

    this.assertSafeBalance(nextWallet, { operation: 'withdraw.wallet', userId, amount });
    this.assertSafeBalance(nextBank, { operation: 'withdraw.bank', userId, amount });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Деньги сняты с банковского счёта`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static checkCooldown(userData, action, cooldownMs) {
    const lastActionField = `last${action.charAt(0).toUpperCase() + action.slice(1)}`;
    const lastTime = userData[lastActionField] || 0;
    const now = Date.now();
    const remaining = Math.max(0, lastTime + cooldownMs - now);

    return {
      isOnCooldown: remaining > 0,
      remaining,
      formatted: this.formatDuration(remaining),
      nextAvailable: new Date(lastTime + cooldownMs)
    };
  }

  static validateAmount(amount, context = {}) {
    if (!Number.isInteger(amount)) {
      throw createError(
        "Некорректная сумма — не целое число",
        ErrorTypes.VALIDATION,
        "Сумма должна быть целым числом.",
        context
      );
    }

    if (amount <= 0) {
      throw createError(
        "Некорректная сумма — не положительное число",
        ErrorTypes.VALIDATION,
        "Сумма должна быть положительной.",
        context
      );
    }

    if (amount > this.MAX_SAFE_INTEGER) {
      logger.error(`[ECONOMY] Сумма превышает MAX_SAFE_INTEGER`, { amount, context });
      throw createError(
        "Слишком большая сумма",
        ErrorTypes.VALIDATION,
        "Сумма слишком велика для обработки.",
        context
      );
    }
  }

  static formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}ч ${minutes}м ${seconds}с`;
    }
    if (minutes > 0) {
      return `${minutes}м ${seconds}с`;
    }
    return `${seconds}с`;
  }

  static formatCooldownDisplay(ms) {
    const duration = this.formatDuration(ms);
    return `**${duration}**`;
  }
}

wrapServiceClassMethods(EconomyService, (methodName) => ({
  service: 'EconomyService',
  operation: methodName,
  message: `Не удалось выполнить операцию экономического сервиса: ${methodName}`,
  userMessage: 'Не удалось выполнить операцию экономики. Пожалуйста, попробуйте ещё раз через некоторое время.'
}));

export default EconomyService;
