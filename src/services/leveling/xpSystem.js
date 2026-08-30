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

import {
  checkAndUnlockAchievements,
} from '../achievements/achievementService.js';

/**
 * ============================================================
 * ADD XP
 * ============================================================
 *
 * Начисляет XP участнику.
 *
 * Дополнительно:
 * - проверяет достижения;
 * - выдаёт новые достижения;
 * - отправляет уведомление в тот же канал,
 *   который используется для повышения уровня.
 */
export const addXp = wrapServiceBoundary(
  async function addXp(client, guild, member, xpToAdd) {
    const lockKey = `leveling:${guild.id}:${member.user.id}`;

    return await Mutex.runExclusive(lockKey, async () => {
      if (!xpToAdd || xpToAdd <= 0) {
        return null;
      }

      const config = await getLevelingConfig(
        client,
        guild.id
      );

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

      let xpNeededForNextLevel =
        getXpForLevel(levelData.level);

      let didLevelUp = false;

      const initialLevel = levelData.level;

      /*
       * ========================================================
       * LEVEL UP
       * ========================================================
       */

      while (
        levelData.xp >= xpNeededForNextLevel &&
        levelData.level < 1000
      ) {
        levelData.xp -= xpNeededForNextLevel;
        levelData.level += 1;

        didLevelUp = true;

        xpNeededForNextLevel =
          getXpForLevel(levelData.level);

        logger.info(
          `🎉 ${member.user.tag} повысил уровень до ${levelData.level} ` +
          `на сервере ${guild.name}`
        );

        /*
         * Награда за уровень
         */
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

      /*
       * ========================================================
       * СОХРАНЯЕМ XP
       * ========================================================
       */

      await saveUserLevelData(
        client,
        guild.id,
        member.user.id,
        levelData
      );

      /*
       * ========================================================
       * ДОСТИЖЕНИЯ
       * ========================================================
       *
       * Проверяем достижения после сохранения XP.
       *
       * Передаём полный контекст, чтобы achievementService
       * мог проверять:
       *
       * - level
       * - totalXp
       * - XP и другие будущие условия
       */

      let unlockedAchievements = [];

      try {
        unlockedAchievements =
          await checkAndUnlockAchievements(
            client,
            guild.id,
            member.user.id,
            {
              level: levelData.level,
              totalXp: levelData.totalXp,
              xp: levelData.xp,
              member,
              user: member.user,
              guild,
            }
          );

        if (unlockedAchievements.length > 0) {
          logger.info(
            `🏆 ${member.user.tag} получил ${unlockedAchievements.length} ` +
            `новых достижений на сервере ${guild.name}: ` +
            unlockedAchievements
              .map((achievement) => achievement.id)
              .join(', ')
          );
        }
      } catch (achievementError) {
        /*
         * Ошибка достижений не должна ломать систему XP.
         */
        logger.error(
          `Ошибка проверки достижений для ${member.user.id}:`,
          achievementError
        );
      }

      /*
       * ========================================================
       * УВЕДОМЛЕНИЕ О ПОВЫШЕНИИ УРОВНЯ
       * ========================================================
       */

      if (didLevelUp) {
        if (config.announceLevelUp) {
          await sendLevelUpAnnouncement(
            guild,
            member,
            levelData,
            config
          );
        }

        /*
         * Логирование повышения уровня
         */
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
                  (
                    levelData.level -
                    initialLevel
                  ).toString()
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

      /*
       * ========================================================
       * УВЕДОМЛЕНИЕ О ДОСТИЖЕНИЯХ
       * ========================================================
       *
       * Отправляется независимо от уведомления уровня.
       *
       * Используется ТОТ ЖЕ канал:
       *
       * config.levelUpChannel
       *
       * или:
       *
       * guild.systemChannel
       */

      if (unlockedAchievements.length > 0) {
        await sendAchievementAnnouncement(
          guild,
          member,
          unlockedAchievements,
          config
        );
      }

      /*
       * ========================================================
       * RESULT
       * ========================================================
       */

      return {
        level: levelData.level,
        xp: levelData.xp,
        totalXp: levelData.totalXp,

        xpNeeded:
          getXpForLevel(
            levelData.level + 1
          ),

        leveledUp: didLevelUp,

        /*
         * Новое поле.
         *
         * Если достижения были получены:
         * [
         *   achievement,
         *   achievement
         * ]
         */
        unlockedAchievements,
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
 * ============================================================
 * ROLE REWARD
 * ============================================================
 */

async function awardRoleReward(
  guild,
  member,
  roleId,
  level
) {
  try {
    const role =
      guild.roles.cache.get(roleId);

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
 * ============================================================
 * LEVEL UP ANNOUNCEMENT
 * ============================================================
 */

async function sendLevelUpAnnouncement(
  guild,
  member,
  levelData,
  config
) {
  try {
    const levelUpChannel =
      config.levelUpChannel
        ? guild.channels.cache.get(
            config.levelUpChannel
          )
        : guild.systemChannel;

    if (
      !levelUpChannel ||
      !levelUpChannel.isTextBased()
    ) {
      return;
    }

    const permissions =
      levelUpChannel.permissionsFor(
        guild.members.me
      );

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

    const primaryColor =
      getColor('primary');

    const xpNeeded =
      getXpForLevel(
        levelData.level + 1
      );

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

    const embed =
      new EmbedBuilder()
        .setColor(primaryColor)

        .setAuthor({
          name: '🎉 Новый уровень!',
          iconURL:
            member.user.displayAvatarURL({
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
            value:
              `## ${levelData.level}`,
            inline: true,
          },

          {
            name: '✨ XP',
            value:
              `${levelData.xp} / ${xpNeeded}`,
            inline: true,
          },

          {
            name: '🏆 Всего XP',
            value:
              `${levelData.totalXp}`,
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
          text:
            `${guild.name} • Продолжай прокачиваться!`,
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

/**
 * ============================================================
 * ACHIEVEMENT ANNOUNCEMENT
 * ============================================================
 *
 * Отправляет уведомление о новых достижениях.
 *
 * ВАЖНО:
 * Используется тот же канал, что и level-up.
 */

async function sendAchievementAnnouncement(
  guild,
  member,
  achievements,
  config
) {
  try {
    const achievementChannel =
      config.levelUpChannel
        ? guild.channels.cache.get(
            config.levelUpChannel
          )
        : guild.systemChannel;

    if (
      !achievementChannel ||
      !achievementChannel.isTextBased()
    ) {
      logger.debug(
        `Канал уведомлений достижений не найден ` +
        `для сервера ${guild.id}`
      );

      return;
    }

    const permissions =
      achievementChannel.permissionsFor(
        guild.members.me
      );

    if (
      !permissions ||
      !permissions.has([
        'SendMessages',
        'EmbedLinks',
      ])
    ) {
      logger.warn(
        `Недостаточно прав для отправки уведомления ` +
        `о достижении в канале ${achievementChannel.id}`
      );

      return;
    }

    /*
     * Если по одному действию получено несколько
     * достижений — отправляем их одним сообщением.
     */

    const achievementLines =
      achievements
        .map((achievement) => {
          const emoji =
            achievement.emoji || '🏆';

          const name =
            achievement.name ||
            achievement.id ||
            'Новое достижение';

          const description =
            achievement.description ||
            'Достижение разблокировано!';

          return (
            `${emoji} **${name}**\n` +
            `> ${description}`
          );
        })
        .join('\n\n');

    /*
     * Определяем цвет по редкости.
     *
     * legendary → золотой
     * epic → фиолетовый
     * rare → синий
     * uncommon → зелёный
     * common → серый
     */

    const colors = {
      common: 0x95A5A6,
      uncommon: 0x2ECC71,
      rare: 0x3498DB,
      epic: 0x9B59B6,
      legendary: 0xF1C40F,
    };

    /*
     * Если среди достижений есть легендарное —
     * используем золотой цвет.
     *
     * Иначе берём максимальную редкость.
     */

    const rarityPriority = {
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 5,
    };

    const highestRarity =
      achievements.reduce(
        (current, achievement) => {
          const currentPriority =
            rarityPriority[current] || 0;

          const achievementPriority =
            rarityPriority[
              achievement.rarity
            ] || 0;

          return achievementPriority >
            currentPriority
            ? achievement.rarity
            : current;
        },
        'common'
      );

    const color =
      colors[highestRarity] ||
      colors.common;

    const embed =
      new EmbedBuilder()
        .setColor(color)

        .setAuthor({
          name: '🏆 Новое достижение!',
          iconURL:
            member.user.displayAvatarURL({
              extension: 'png',
              size: 128,
            }),
        })

        .setDescription(
          `### Поздравляем, ${member}!\n\n` +
          `Ты разблокировал ${
            achievements.length === 1
              ? 'новое достижение'
              : 'новые достижения'
          }! 🎉\n\n` +
          achievementLines
        )

        .setThumbnail(
          member.user.displayAvatarURL({
            extension: 'png',
            size: 256,
          })
        )

        .setFooter({
          text:
            `${guild.name} • Продолжай собирать достижения!`,
        })

        .setTimestamp();

    await achievementChannel
      .send({
        content: member.toString(),
        embeds: [embed],
      })
      .catch((error) => {
        logger.error(
          `Не удалось отправить уведомление о достижении ` +
          `в канале ${achievementChannel.id}:`,
          error
        );
      });
  } catch (error) {
    logger.error(
      'Ошибка при отправке уведомления о достижении:',
      error
    );
  }
}
