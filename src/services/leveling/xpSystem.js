// xpSystem.js

import { EmbedBuilder } from 'discord.js';

import { logger } from '../../utils/logger.js';

import {
  getLevelingConfig,
  getXpForLevel,
  getUserLevelData,
  saveUserLevelData,
} from './leveling.js';

import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

/**
 * Начисляет XP участнику.
 * Возвращает null, если XP не начисляется
 * (система отключена или указано некорректное количество).
 */
export const addXp = wrapServiceBoundary(
  async function addXp(client, guild, member, xpToAdd) {
    const lockKey = `leveling:${guild.id}:${member.user.id}`;

    return await Mutex.runExclusive(lockKey, async () => {
      if (!xpToAdd || xpToAdd <= 0) {
        return null;
      }

      const config = await getLevelingConfig(client, guild.id);

      if (!config.enabled) {
        return null;
      }

      const levelData = await getUserLevelData(
        client,
        guild.id,
        member.user.id
      );

      levelData.xp += xpToAdd;
      levelData.totalXp += xpToAdd;
      levelData.lastMessage = Date.now();

      let xpNeededForNextLevel = getXpForLevel(levelData.level);

      let didLevelUp = false;

      const initialLevel = levelData.level;

      while (
        levelData.xp >= xpNeededForNextLevel &&
        levelData.level < 1000
      ) {
        levelData.xp -= xpNeededForNextLevel;
        levelData.level += 1;

        didLevelUp = true;

        xpNeededForNextLevel = getXpForLevel(levelData.level);

        logger.info(
          `🎉 ${member.user.tag} повысил уровень до ${levelData.level} ` +
          `на сервере ${guild.name}`
        );

        // Награда за уровень
        if (
          config.roleRewards &&
          config.roleRewards[levelData.level]
        ) {
          await awardRoleReward(
            guild,
            member,
            config.roleRewards[levelData.level],
            levelData.level
          );
        }
      }

      // Уведомление о повышении уровня
      if (didLevelUp) {
        if (config.announceLevelUp) {
          await sendLevelUpAnnouncement(
            guild,
            member,
            levelData,
            config
          );
        }

        // Логирование
        try {
          await logEvent({
            client,
            guildId: guild.id,
            eventType: EVENT_TYPES.LEVELING_LEVELUP,

            data: {
              title: 'Повышение уровня',

              lines: [
                formatLogLine(
                  'Участник',
                  `${member.user.tag} (\`${member.user.id}\`)`
                ),

                formatLogLine(
                  'Новый уровень',
                  levelData.level.toString()
                ),

                formatLogLine(
                  'Получено уровней',
                  (levelData.level - initialLevel).toString()
                ),

                formatLogLine(
                  'Всего XP',
                  levelData.totalXp.toString()
                ),
              ],

              userId: member.user.id,
            },
          });
        } catch (logError) {
          logger.debug(
            'Не удалось записать событие повышения уровня:',
            logError.message
          );
        }
      }

      await saveUserLevelData(
        client,
        guild.id,
        member.user.id,
        levelData
      );

      return {
        level: levelData.level,
        xp: levelData.xp,
        totalXp: levelData.totalXp,
        xpNeeded: getXpForLevel(levelData.level + 1),
        leveledUp: didLevelUp,
      };
    });
  },
  {
    service: 'xpSystem',
    operation: 'addXp',
    userMessage:
      'Не удалось начислить XP. Пожалуйста, попробуйте ещё раз.',
  }
);

/**
 * Выдача роли за достижение уровня.
 */
async function awardRoleReward(
  guild,
  member,
  roleId,
  level
) {
  try {
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      logger.warn(
        `Роль ${roleId} не найдена для награды за ${level} уровень ` +
        `на сервере ${guild.id}`
      );

      return;
    }

    if (member.roles.cache.has(roleId)) {
      return;
    }

    await member.roles.add(
      role,
      `Награда за достижение ${level} уровня`
    );

    logger.info(
      `✅ Роль ${role.name} выдана пользователю ${member.user.tag} ` +
      `за достижение ${level} уровня`
    );
  } catch (error) {
    logger.error(
      `Не удалось выдать награду за уровень ` +
      `пользователю ${member.user.id}:`,
      error
    );
  }
}

/**
 * Отправляет красивое уведомление о повышении уровня.
 */
async function sendLevelUpAnnouncement(
  guild,
  member,
  levelData,
  config
) {
  try {
    const levelUpChannel = config.levelUpChannel
      ? guild.channels.cache.get(config.levelUpChannel)
      : guild.systemChannel;

    if (
      !levelUpChannel ||
      !levelUpChannel.isTextBased()
    ) {
      return;
    }

    const permissions =
      levelUpChannel.permissionsFor(guild.members.me);

    if (
      !permissions ||
      !permissions.has([
        'SendMessages',
        'EmbedLinks',
      ])
    ) {
      logger.warn(
        `Недостаточно прав для отправки сообщения ` +
        `о повышении уровня в канале ${levelUpChannel.id}`
      );

      return;
    }

    // Цвет берём из твоего конфига.
    const primaryColor = getColor('primary');

    // XP до следующего уровня.
    const xpNeeded = getXpForLevel(
      levelData.level + 1
    );

    // Сохраняем поддержку старых переменных.
    const customMessage =
      config.levelUpMessage
        ?.replace(
          /{user}/g,
          member.toString()
        )
        .replace(
          /{level}/g,
          levelData.level.toString()
        )
        .replace(
          /{xp}/g,
          levelData.xp.toString()
        )
        .replace(
          /{xpNeeded}/g,
          xpNeeded.toString()
        ) ||
      'Продолжай в том же духе и прокачивай свой уровень! 🚀';

    // Красивый Embed.
    const embed = new EmbedBuilder()
      .setColor(primaryColor)
      .setAuthor({
        name: '🎉 Новый уровень!',
        iconURL: member.user.displayAvatarURL({
          extension: 'png',
          size: 128,
        }),
      })
      .setDescription(
        `### Поздравляем, ${member}!\n\n` +
        `Ты достиг нового уровня! ✨`
      )
      .addFields(
        {
          name: '⭐ Уровень',
          value: `## ${levelData.level}`,
          inline: true,
        },
        {
          name: '✨ XP',
          value: `${levelData.xp} / ${xpNeeded}`,
          inline: true,
        },
        {
          name: '🏆 Всего XP',
          value: `${levelData.totalXp}`,
          inline: true,
        }
      )
      .addFields({
        name: '💬 Сообщение',
        value: customMessage,
      })
      .setThumbnail(
        member.user.displayAvatarURL({
          extension: 'png',
          size: 256,
        })
      )
      .setFooter({
        text: `${guild.name} • Продолжай прокачиваться!`,
      })
      .setTimestamp();

    await levelUpChannel
      .send({
        embeds: [embed],
      })
      .catch((error) => {
        logger.error(
          `Не удалось отправить сообщение о повышении уровня ` +
          `в канале ${levelUpChannel.id}:`,
          error
        );
      });
  } catch (error) {
    logger.error(
      'Ошибка при отправке уведомления о повышении уровня:',
      error
    );
  }
}
