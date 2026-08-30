import {
  Events,
  EmbedBuilder,
} from 'discord.js';

import { logger } from '../utils/logger.js';

import {
  getLevelingConfig,
  getUserLevelData,
} from '../services/leveling/leveling.js';

import { addXp } from '../services/leveling/xpSystem.js';

import { checkRateLimit } from '../utils/rateLimiter.js';

import {
  parsePrefixCommand,
} from '../utils/prefixParser.js';

import {
  supportsPrefixExecution,
  executePrefixCommand,
  resolvePrefixAccessKey,
} from '../utils/messageAdapter.js';

import {
  resolveCommandAlias,
  resolveSubcommandAlias,
} from '../config/commands/commandAliases.js';

import {
  getPrefixRestriction,
} from '../config/commands/prefixRestrictions.js';

import {
  getGuildConfig,
} from '../services/config/guildConfig.js';

import {
  getCommandPrefix,
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
} from '../config/bot.js';

import {
  enforceAbuseProtection,
  formatCooldownDuration,
} from '../utils/abuseProtection.js';

import {
  createEmbed,
} from '../utils/embeds.js';

import {
  isCommandEnabled,
} from '../services/commandAccessService.js';

import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

/*
 * ============================================================
 * ACHIEVEMENTS
 * ============================================================
 */

import {
  checkAndUnlockAchievements,
  getAchievementRarity,
} from '../services/achievements/achievementService.js';

import {
  buildAchievementContext,
} from '../services/achievements/achievementContext.js';


const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;


/*
 * ============================================================
 * EVENT
 * ============================================================
 */

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    try {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      logger.debug(
        `Message received from ${message.author.tag}: ${message.content}`
      );

      /*
       * Counting game должен иметь приоритет.
       */

      const countingProcessed =
        await handleCountingGame(
          message,
          client
        );

      if (countingProcessed) {
        return;
      }

      /*
       * Prefix commands.
       */

      await handlePrefixCommand(
        message,
        client
      );

      /*
       * XP + achievements.
       */

      await handleLeveling(
        message,
        client
      );

    } catch (error) {
      logger.error(
        'Error in messageCreate event:',
        error
      );
    }
  },
};


/*
 * ============================================================
 * PREFIX COMMANDS
 * ============================================================
 */

async function handlePrefixCommand(
  message,
  client
) {
  try {
    const guildConfig =
      await getGuildConfig(
        client,
        message.guild.id
      );

    const prefix =
      guildConfig?.prefix ||
      getCommandPrefix();

    const parsed =
      parsePrefixCommand(
        message.content,
        prefix
      );

    if (!parsed) {
      return;
    }

    let {
      commandName,
      args,
    } = parsed;

    const musicPrefixShortcut =
      commandName.toLowerCase();

    const MUSIC_PREFIX_SHORTCUTS =
      new Set([
        'leave',
        'pause',
        'resume',
        'skip',
        'stop',
        'volume',
      ]);

    if (
      MUSIC_PREFIX_SHORTCUTS.has(
        musicPrefixShortcut
      )
    ) {
      commandName = 'music';

      args = [
        musicPrefixShortcut,
        ...args,
      ];
    }

    logger.info(
      `Prefix command detected: ${commandName}, args: ${args.join(', ')}`
    );

    const resolvedCommandName =
      resolveCommandAlias(
        commandName
      );

    logger.info(
      `Resolved command name: ${resolvedCommandName}`
    );

    const command =
      client.commands.get(
        resolvedCommandName
      );

    if (!command) {
      logger.warn(
        `Command not found: ${resolvedCommandName}`
      );

      return;
    }

    /*
     * Maintenance mode.
     */

    if (
      isMaintenanceMode() &&
      !isBotOwner(
        message.author.id
      )
    ) {
      await message.channel
        .send({
          embeds: [
            createEmbed({
              title:
                'Maintenance Mode',

              description:
                getBotMessage(
                  'maintenanceMode'
                ),

              color:
                'warning',
            }),
          ],
        })
        .catch(() => {});

      return;
    }

    /*
     * Category disabled.
     */

    if (
      !isCommandCategoryEnabled(
        command.category
      )
    ) {
      await message.channel
        .send({
          embeds: [
            createEmbed({
              title:
                'Feature Disabled',

              description:
                getBotMessage(
                  'commandDisabled'
                ),

              color:
                'error',
            }),
          ],
        })
        .catch(() => {});

      return;
    }

    /*
     * Prefix restrictions.
     */

    const restriction =
      getPrefixRestriction(
        command,
        args,
        resolveSubcommandAlias
      );

    if (
      !supportsPrefixExecution(
        command
      ) ||
      restriction.blocked
    ) {
      if (
        restriction.blocked &&
        restriction.reason
      ) {
        const embed =
          createEmbed({
            title:
              'Slash Command Only',

            description:
              `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,

            color:
              'info',
          });

        await message.channel
          .send({
            embeds: [embed],
          })
          .catch(() => {});
      }

      return;
    }

    /*
     * Server command access.
     */

    if (
      !(
        await isCommandEnabled(
          client,
          message.guild.id,
          resolvePrefixAccessKey(
            command.data,
            args
          ),
          command.category
        )
      )
    ) {
      const embed =
        createEmbed({
          title:
            'Command Disabled',

          description:
            'This command has been disabled for this server.',

          color:
            'error',
        });

      await message.channel
        .send({
          embeds: [embed],
        })
        .catch(() => {});

      return;
    }

    /*
     * Abuse protection.
     */

    const mockInteractionForProtection = {
      guildId:
        message.guild.id,

      user:
        message.author,
    };

    const abuseProtection =
      await enforceAbuseProtection(
        mockInteractionForProtection,
        command,
        resolvedCommandName
      );

    if (
      !abuseProtection.allowed
    ) {
      const formattedCooldown =
        formatCooldownDuration(
          abuseProtection.remainingMs
        );

      const embed =
        createEmbed({
          title:
            'Command Cooldown',

          description:
            `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,

          color:
            'error',
        });

      await message.channel
        .send({
          embeds: [embed],
        })
        .catch(() => {});

      return;
    }

    logger.info(
      `Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`
    );

    await executePrefixCommand(
      command,
      message,
      args,
      client,
      prefix,
      guildConfig
    );

  } catch (error) {
    logger.error(
      'Error handling prefix command:',
      error
    );
  }
}


/*
 * ============================================================
 * COUNTING GAME
 * ============================================================
 */

async function handleCountingGame(
  message,
  client
) {
  try {
    const config =
      await getCountingGameConfig(
        client,
        message.guild.id
      );

    if (
      !config.enabled ||
      !config.channelId ||
      message.channel.id !==
        config.channelId
    ) {
      return false;
    }

    const content =
      message.content.trim();

    const validCount =
      isValidCountingMessage(
        content,
        config
      );

    const invalidAttempt =
      !validCount ||
      message.author.id ===
        config.lastUserId;

    if (invalidAttempt) {
      await message.delete()
        .catch(() => {});

      await saveCountingGameConfig(
        client,
        message.guild.id,
        {
          ...config,

          nextNumber: 1,

          lastUserId: null,

          currentStreak: 0,
        }
      );

      const failureMessage =
        await message.channel.send(
          `❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`
        );

      setTimeout(() => {
        failureMessage
          .delete()
          .catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(
      client,
      message.guild.id,
      message.author.id
    );

    return true;

  } catch (error) {
    logger.error(
      'Error handling counting game:',
      error
    );

    return false;
  }
}


/*
 * ============================================================
 * LEVELING
 * ============================================================
 */

async function handleLeveling(
  message,
  client
) {
  try {
    /*
     * XP rate limit.
     */

    const rateLimitKey =
      `xp-event:${message.guild.id}:${message.author.id}`;

    const canProcess =
      await checkRateLimit(
        rateLimitKey,
        MESSAGE_XP_RATE_LIMIT_ATTEMPTS,
        MESSAGE_XP_RATE_LIMIT_WINDOW_MS
      );

    if (!canProcess) {
      return;
    }

    /*
     * Leveling config.
     */

    const levelingConfig =
      await getLevelingConfig(
        client,
        message.guild.id
      );

    if (
      !levelingConfig?.enabled
    ) {
      return;
    }

    /*
     * Ignored channels.
     */

    if (
      levelingConfig.ignoredChannels
        ?.includes(
          message.channel.id
        )
    ) {
      return;
    }

    /*
     * Ignored roles.
     */

    if (
      levelingConfig.ignoredRoles
        ?.length > 0
    ) {
      const member =
        await message.guild.members
          .fetch(
            message.author.id
          )
          .catch(() => null);

      if (
        member &&
        member.roles.cache.some(
          (role) =>
            levelingConfig
              .ignoredRoles
              .includes(role.id)
        )
      ) {
        return;
      }
    }

    /*
     * Blacklisted users.
     */

    if (
      levelingConfig
        .blacklistedUsers
        ?.includes(
          message.author.id
        )
    ) {
      return;
    }

    /*
     * Empty messages.
     */

    if (
      !message.content ||
      message.content
        .trim()
        .length === 0
    ) {
      return;
    }

    /*
     * User level data.
     */

    const userData =
      await getUserLevelData(
        client,
        message.guild.id,
        message.author.id
      );

    /*
     * XP cooldown.
     */

    const cooldownTime =
      levelingConfig.xpCooldown ||
      60;

    const now =
      Date.now();

    const timeSinceLastMessage =
      now -
      (userData.lastMessage || 0);

    if (
      timeSinceLastMessage <
      cooldownTime * 1000
    ) {
      return;
    }

    /*
     * XP range.
     */

    const minXP =
      levelingConfig.xpRange?.min ||
      levelingConfig.xpPerMessage?.min ||
      15;

    const maxXP =
      levelingConfig.xpRange?.max ||
      levelingConfig.xpPerMessage?.max ||
      25;

    const safeMinXP =
      Math.max(
        1,
        minXP
      );

    const safeMaxXP =
      Math.max(
        safeMinXP,
        maxXP
      );

    const xpToGive =
      Math.floor(
        Math.random() *
          (
            safeMaxXP -
            safeMinXP +
            1
          )
      ) +
      safeMinXP;

    /*
     * XP multiplier.
     */

    let finalXP =
      xpToGive;

    if (
      levelingConfig.xpMultiplier &&
      levelingConfig.xpMultiplier > 1
    ) {
      finalXP =
        Math.floor(
          finalXP *
            levelingConfig.xpMultiplier
        );
    }

    /*
     * Add XP.
     */

    const result =
      await addXp(
        client,
        message.guild,
        message.member,
        finalXP
      );

    /*
     * Level up log.
     */

    if (
      result?.leveledUp
    ) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }

    /*
     * ========================================================
     * ACHIEVEMENTS
     * ========================================================
     *
     * Проверяем достижения только после того,
     * как пользователь действительно получил XP.
     *
     * Это позволяет не создавать лишние запросы
     * на каждое сообщение во время XP cooldown.
     */

    try {
      const achievementContext =
        await buildAchievementContext({
          client,
          guild:
            message.guild,
          userId:
            message.author.id,
        });

      /*
       * addXp() уже вернул актуальный уровень/XP,
       * поэтому используем их, если они доступны.
       */

      if (
        result &&
        result.level !== undefined
      ) {
        achievementContext.level =
          Number(
            result.level
          ) ||
          achievementContext.level;
      }

      if (
        result &&
        result.totalXp !== undefined
      ) {
        achievementContext.totalXp =
          Number(
            result.totalXp
          ) ||
          achievementContext.totalXp;
      }

      /*
       * Проверяем все зарегистрированные достижения.
       *
       * Функция возвращает только те достижения,
       * которые были выданы прямо сейчас.
       */

      const unlockedAchievements =
        await checkAndUnlockAchievements(
          client,
          message.guild.id,
          message.author.id,
          achievementContext
        );

      /*
       * Отправляем уведомления.
       */

      if (
        unlockedAchievements.length > 0
      ) {
        await sendAchievementNotifications(
          message,
          unlockedAchievements
        );
      }

    } catch (achievementError) {
      /*
       * Ошибка достижений НЕ должна ломать leveling.
       *
       * Если achievement system временно упадёт,
       * пользователь всё равно должен получать XP.
       */

      logger.error(
        'Error processing achievements:',
        achievementError
      );
    }

  } catch (error) {
    logger.error(
      'Error handling leveling for message:',
      error
    );
  }
}


/*
 * ============================================================
 * ACHIEVEMENT NOTIFICATIONS
 * ============================================================
 */

async function sendAchievementNotifications(
  message,
  achievements
) {
  if (
    !Array.isArray(
      achievements
    ) ||
    achievements.length === 0
  ) {
    return;
  }

  for (
    const achievement of achievements
  ) {
    try {
      const rarity =
        getAchievementRarity(
          achievement.rarity
        );

      const embed =
        new EmbedBuilder()
          .setColor(
            rarity.color
          )

          .setAuthor({
            name:
              '🏆 Новое достижение!',
            iconURL:
              message.author.displayAvatarURL({
                extension: 'png',
                size: 128,
              }),
          })

          .setTitle(
            `${achievement.emoji || '🏆'} ${achievement.name}`
          )

          .setDescription(
            [
              `${message.author} получил новое достижение!`,
              '',
              `> ${achievement.description}`,
              '',
              `${rarity.emoji} **Редкость:** ${rarity.name}`,
            ].join('\n')
          )

          .setFooter({
            text:
              'TitanBot • Achievements',
          })

          .setTimestamp();

      await message.channel.send({
        embeds: [
          embed,
        ],
      });

    } catch (error) {
      logger.error(
        `Failed to send achievement notification for ${achievement?.id}:`,
        error
      );
    }
  }
}
