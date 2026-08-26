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

    // ─────────────────────────────────────────────
    // Система отключена
    // ─────────────────────────────────────────────

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

    // ─────────────────────────────────────────────
    // Получаем топ
    // ─────────────────────────────────────────────

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

    // ─────────────────────────────────────────────
    // Основная информация
    // ─────────────────────────────────────────────

    const guild = interaction.guild;

    const guildIcon = guild.iconURL({
      extension: 'png',
      size: 128
    });

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🏆  Рейтинг сервера')
      .setDescription(
        [
          `**${guild.name}**`,
          '',
          'Топ самых активных участников по количеству XP.'
        ].join('\n')
      )
      .setThumbnail(guildIcon || null)
      .setTimestamp();

    // ─────────────────────────────────────────────
    // Формируем рейтинг
    // ─────────────────────────────────────────────

    const leaderboardText = await Promise.all(
      leaderboard.map(async (user, index) => {
        const rank = index + 1;

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

          const xpForNextLevel = Math.max(
            0,
            getXpForLevel(level + 1)
          );

          const progress = xpForNextLevel > 0
            ? Math.min(
                100,
                Math.floor((xp / xpForNextLevel) * 100)
              )
            : 100;

          const progressBar = createProgressBar(progress, 10);

          const rankIcon = getRankIcon(rank);

          const highlight = isCurrentUser
            ? ' 👑'
            : '';

          return [
            `${rankIcon} **${escapeMarkdown(username)}**${highlight}`,
            `> **LVL ${level}**  •  ${formatNumber(totalXp)} XP`,
            `> ${progressBar} ${progress}%`
          ].join('\n');
        } catch {
          return [
            `${getRankIcon(rank)} **Пользователь**`,
            `> **LVL ${Number(user.level) || 0}**  •  ${formatNumber(Number(user.totalXp) || 0)} XP`
          ].join('\n');
        }
      })
    );

    // ─────────────────────────────────────────────
    // Добавляем рейтинг
    // ─────────────────────────────────────────────

    embed.addFields({
      name: '📊 TOP 10',
      value: leaderboardText.join('\n\n'),
      inline: false
    });

    // ─────────────────────────────────────────────
    // Информация внизу
    // ─────────────────────────────────────────────

    const currentUserIndex = leaderboard.findIndex(
      (user) => user.userId === interaction.user.id
    );

    if (currentUserIndex !== -1) {
      const currentUser = leaderboard[currentUserIndex];

      embed.addFields({
        name: '👑 Твоя позиция',
        value: [
          `**#${currentUserIndex + 1}** место`,
          `**LVL ${Number(currentUser.level) || 0}** • ${formatNumber(Number(currentUser.totalXp) || 0)} XP`
        ].join('  ')
      });
    } else {
      embed.addFields({
        name: '💡 Хочешь попасть в рейтинг?',
        value:
          'Общайся на сервере и получай XP, чтобы попасть в **TOP 10**!'
      });
    }

    embed.setFooter({
      text: `${guild.name} • Top ${leaderboard.length}`,
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

/**
 * Иконка позиции
 */
function getRankIcon(rank) {
  switch (rank) {
    case 1:
      return '🥇';

    case 2:
      return '🥈';

    case 3:
      return '🥉';

    default:
      return `**${rank}.**`;
  }
}

/**
 * Progress bar
 */
function createProgressBar(percentage, length = 10) {
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
 * Форматирование больших чисел.
 *
 * 12540 → 12 540
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
