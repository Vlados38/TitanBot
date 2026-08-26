import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';

import { logger } from '../../utils/logger.js';
import {
  TitanBotError,
  ErrorTypes
} from '../../utils/errorHandler.js';

import {
  getLeaderboard,
  getLevelingConfig,
  getXpForLevel
} from '../../services/leveling/leveling.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Показывает таблицу лидеров по уровням сервера')
    .setDMPermission(false),

  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(
      client,
      interaction.guildId
    );

    // Система уровней выключена
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('⚠️ Система уровней отключена')
            .setDescription(
              'Система уровней в данный момент отключена на этом сервере.'
            )
        ],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    // Получаем TOP-10
    const leaderboard = await getLeaderboard(
      client,
      interaction.guildId,
      10
    );

    if (!leaderboard || leaderboard.length === 0) {
      throw new TitanBotError(
        'No leaderboard data found',
        ErrorTypes.DATABASE,
        'Данных об уровнях пока нет. Начните общаться, чтобы получать XP!'
      );
    }

    const guild = interaction.guild;

    const guildIcon = guild.iconURL({
      extension: 'png',
      size: 128
    });

    // ─────────────────────────────────────
    // Заголовок
    // ─────────────────────────────────────

    const embed = new EmbedBuilder()
      .setColor('#b48ced')
      .setTitle('🏆 РЕЙТИНГ СЕРВЕРА')
      .setDescription(
        [
          `**${guild.name}**`,
          '',
          'Самые активные участники сервера'
        ].join('\n')
      )
      .setThumbnail(guildIcon || null)
      .setTimestamp();

    // ─────────────────────────────────────
    // Формируем TOP-10
    // ─────────────────────────────────────

    const leaderboardText = await Promise.all(
      leaderboard.map(async (user, index) => {
        const place = index + 1;

        try {
          const member = await interaction.guild.members
            .fetch(user.userId)
            .catch(() => null);

          const username = member
            ? member.displayName
            : `Пользователь ${user.userId}`;

          const isCurrentUser =
            user.userId === interaction.user.id;

          const level = Number(user.level) || 0;
          const xp = Number(user.xp) || 0;
          const totalXp = Number(user.totalXp) || 0;

          const xpNeeded = Math.max(
            0,
            getXpForLevel(level + 1)
          );

          const progress = xpNeeded > 0
            ? Math.min(
                100,
                Math.floor((xp / xpNeeded) * 100)
              )
            : 100;

          const progressBar = createProgressBar(
            progress,
            10
          );

          const rank = getRank(place);

          const crown = isCurrentUser
            ? ' 👑'
            : '';

          return [
            `${rank.icon}  **#${place}  ${escapeMarkdown(username)}**${crown}`,
            `    ⭐ **LEVEL ${level}**`,
            `    💎 **${formatNumber(totalXp)} XP**`,
            `    ${progressBar} **${progress}%**`
          ].join('\n');
        } catch {
          return [
            `${getRankIcon(place)}  **#${place}  Пользователь**`,
            `    ⭐ **LEVEL ${Number(user.level) || 0}**`,
            `    💎 **${formatNumber(Number(user.totalXp) || 0)} XP**`
          ].join('\n');
        }
      })
    );

    // ─────────────────────────────────────
    // Рейтинг
    // ─────────────────────────────────────

    embed.addFields({
      name: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      value: leaderboardText.join('\n\n'),
      inline: false
    });

    // ─────────────────────────────────────
    // Текущий пользователь
    // ─────────────────────────────────────

    const currentUserIndex = leaderboard.findIndex(
      (user) => user.userId === interaction.user.id
    );

    if (currentUserIndex !== -1) {
      const currentUser = leaderboard[currentUserIndex];

      const currentLevel =
        Number(currentUser.level) || 0;

      const currentTotalXp =
        Number(currentUser.totalXp) || 0;

      embed.addFields({
        name: '👑 ТВОЙ РЕЙТИНГ',
        value: [
          `**#${currentUserIndex + 1} место**`,
          `⭐ LEVEL ${currentLevel}  •  💎 ${formatNumber(currentTotalXp)} XP`
        ].join('\n'),
        inline: false
      });
    } else {
      embed.addFields({
        name: '💡 Хочешь попасть в TOP-10?',
        value:
          'Общайся на сервере и получай XP, чтобы попасть в рейтинг!',
        inline: false
      });
    }

    // ─────────────────────────────────────
    // Footer
    // ─────────────────────────────────────

    embed.setFooter({
      text: `${guild.name} • TOP ${leaderboard.length}`,
      iconURL: guildIcon || undefined
    });

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [embed]
    });

    logger.debug(
      `Leaderboard displayed for guild ${interaction.guildId}`
    );
  }
};

// ═══════════════════════════════════════════
// Вспомогательные функции
// ═══════════════════════════════════════════

/**
 * Возвращает оформление места.
 */
function getRank(place) {
  switch (place) {
    case 1:
      return {
        icon: '🥇',
        color: '#FFD700'
      };

    case 2:
      return {
        icon: '🥈',
        color: '#C0C0C0'
      };

    case 3:
      return {
        icon: '🥉',
        color: '#CD7F32'
      };

    default:
      return {
        icon: '🏅',
        color: '#5865F2'
      };
  }
}

/**
 * Получает только иконку места.
 */
function getRankIcon(place) {
  return getRank(place).icon;
}

/**
 * Progress bar.
 *
 * Пример:
 * ▰▰▰▰▰▰▰▱▱▱
 */
function createProgressBar(
  percentage,
  length = 10
) {
  const safePercentage = Math.max(
    0,
    Math.min(100, Number(percentage) || 0)
  );

  const filled = Math.round(
    (safePercentage / 100) * length
  );

  const empty = length - filled;

  return (
    '▰'.repeat(filled) +
    '▱'.repeat(empty)
  );
}

/**
 * Форматирование чисел.
 *
 * 12540 → 12 540
 * 1250000 → 1 250 000
 */
function formatNumber(number) {
  return Number(number || 0).toLocaleString('ru-RU');
}

/**
 * Защита имени пользователя от Markdown.
 */
function escapeMarkdown(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/([*_~`|>])/g, '\\$1');
}
