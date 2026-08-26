import { createEmbed, successEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import {
    getEconomyKey,
    getUserLevelKey,
    getAFKKey,
    getWarningsKey,
    getUserNotesKey,
    getEconomyPrefix,
    getUserLevelPrefix,
} from '../utils/database.js';

const wipedataConfirmHandler = {
  name: 'wipedata_yes',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const dataKeyPatterns = [
        getEconomyKey(guildId, userId),
        getUserLevelKey(guildId, userId),
        getAFKKey(guildId, userId),
        getWarningsKey(guildId, userId),
        getUserNotesKey(guildId, userId),
        `level:${guildId}:${userId}`,
        `xp:${guildId}:${userId}`,
        `inventory:${guildId}:${userId}`,
        `bank:${guildId}:${userId}`,
        `wallet:${guildId}:${userId}`,
        `cooldowns:${guildId}:${userId}`,
        `shop:${guildId}:${userId}`,
        `shop_data:${guildId}:${userId}`,
        `counter:${guildId}:${userId}`,
        `birthday:${guildId}:${userId}`,
        `balance:${guildId}:${userId}`,
        `user:${guildId}:${userId}`,
        `leveling:${guildId}:${userId}`,
        `crimexp:${guildId}:${userId}`,
        `robxp:${guildId}:${userId}`,
        `crime_cooldown:${guildId}:${userId}`,
        `rob_cooldown:${guildId}:${userId}`,
        `lastDaily:${guildId}:${userId}`,
        `lastWork:${guildId}:${userId}`,
        `lastCrime:${guildId}:${userId}`,
        `lastRob:${guildId}:${userId}`,
        `${guildId}:leveling:users:${userId}`,
      ];

      let deletedCount = 0;
      const deleteErrors = [];

      for (const key of dataKeyPatterns) {
        try {
          const exists = await client.db.exists(key);
          if (exists) {
            await client.db.delete(key);
            deletedCount++;
          }
        } catch (error) {
          logger.error(`Ошибка удаления ключа ${key}:`, error);
          deleteErrors.push(key);
        }
      }

      try {
        if (client.db.list && typeof client.db.list === 'function') {
          const searchPrefixes = [
            `${guildId}:${userId}`,
            `${guildId}:`,
            getEconomyPrefix(guildId),
            getUserLevelPrefix(guildId),
            `level:${guildId}:`,
            `xp:${guildId}:`,
            `user:${guildId}:`
          ];

          const discoveredKeys = new Set();

          for (const prefix of searchPrefixes) {
            try {
              const keys = await client.db.list(prefix);
              if (Array.isArray(keys)) {
                keys.forEach((key) => discoveredKeys.add(key));
              }
            } catch (listError) {
              logger.debug(`Не удалось получить список ключей для префикса ${prefix}:`, listError);
            }
          }

          const additionalUserKeys = [...discoveredKeys].filter((key) => {
            if (dataKeyPatterns.includes(key)) return false;
            return typeof key === 'string' && key.includes(`${guildId}:${userId}`);
          });

          for (const key of additionalUserKeys) {
            try {
              await client.db.delete(key);
              deletedCount++;
            } catch (error) {
              logger.error(`Ошибка удаления дополнительного ключа ${key}:`, error);
              deleteErrors.push(key);
            }
          }
        }
      } catch (error) {
        logger.warn('Не удалось выполнить поиск по префиксам в базе данных:', error);
      }

      const successMessage =
        `✅ **Ваши данные были успешно удалены!**\n\n` +
        `**Удалено записей:** ${deletedCount}\n\n` +
        `Ваш аккаунт был сброшен до значений по умолчанию. Теперь вы можете начать с чистого листа!\n\n` +
        `*Ваш баланс, уровни, предметы и личные данные были полностью удалены.*`;

      await interaction.editReply({
        embeds: [successEmbed('Удаление данных завершено', successMessage)],
        components: []
      });

      logger.info(`Пользователь ${interaction.user.tag} (${userId}) удалил свои данные на сервере ${guildId} — удалено записей: ${deletedCount}`);

      if (deleteErrors.length > 0) {
        logger.warn(`Удаление данных завершено с ${deleteErrors.length} ошибками для пользователя ${userId} на сервере ${guildId}`);
      }

    } catch (error) {
      logger.error('Ошибка обработчика подтверждения удаления данных:', error);
      
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Произошла ошибка при удалении ваших данных. Попробуйте ещё раз позже или обратитесь в службу поддержки.'
      });
    }
  }
};

const wipedataCancelHandler = {
  name: 'wipedata_no',
  async execute(interaction, client) {
    try {
      await interaction.update({
        embeds: [
          createEmbed({
            title: '❌ Удаление данных отменено',
            description: 'Ваши данные были сохранены. Ваш аккаунт остался без изменений.',
            color: 'info'
          })
        ],
        components: []
      });

      logger.info(`Пользователь ${interaction.user.tag} (${interaction.user.id}) отменил удаление данных на сервере ${interaction.guildId}`);
    } catch (error) {
      logger.error('Ошибка обработчика отмены удаления данных:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Не удалось отменить удаление данных.'
        });
      }
    }
  }
};

export { wipedataConfirmHandler, wipedataCancelHandler };
