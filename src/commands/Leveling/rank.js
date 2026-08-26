import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  getUserLevelData,
  getLevelingConfig,
  getXpForLevel
} from '../../services/leveling/leveling.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Проверить свой или чужой ранг и уровень')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Пользователь, ранг которого нужно проверить')
        .setRequired(false)
    )
    .setDMPermission(false),

  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(
      client,
      interaction.guildId
    );

    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('⚠️ Система уровней отключена')
            .setDescription(
              'Система уровней в данный момент отключена на этом сервере.'
            )
        ],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    // Пользователь из аргумента или автор команды
    const targetUser =
      interaction.options.getUser('user') || interaction.user;

    // Получаем участника сервера
    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new TitanBotError(
        `Пользователь ${targetUser.id} не найден на сервере`,
        ErrorTypes.USER_INPUT,
        'Не удалось найти указанного пользователя на этом сервере.'
      );
    }

    // Данные уровня
    const userData = await getUserLevelData(
      client,
      interaction.guildId,
      targetUser.id
    );

    const safeUserData = {
      level: userData?.level ?? 0,
      xp: userData?.xp ?? 0,
      totalXp: userData?.totalXp ?? 0
    };

    const currentLevel = safeUserData.level;
    const nextLevel = currentLevel + 1;

    // XP для следующего уровня
    const xpNeeded = Math.max(0, getXpForLevel(nextLevel));

    // Защита от некорректных данных
    const currentXp = Math.max(0, safeUserData.xp);

    const progress =
      xpNeeded > 0
        ? Math.min(100, Math.floor((currentXp / xpNeeded) * 100))
        : 100;

    const progressBar = createProgressBar(progress, 20);

    // Красивое отображение чисел
    const formattedXp = currentXp.toLocaleString('ru-RU');
    const formattedXpNeeded = xpNeeded.toLocaleString('ru-RU');
    const formattedTotalXp = safeUserData.totalXp.toLocaleString('ru-RU');

    // XP осталось до следующего уровня
    const xpRemaining = Math.max(0, xpNeeded - currentXp);

    // Если пользователь достиг максимума текущей системы
    const isMaxLevel =
      currentLevel >= 1000;

    // Цвет карточки
    const embedColor = getLevelColor(currentLevel);

const embed = new EmbedBuilder()
  .setColor(config.primary)

      /*
       * Верхняя часть
       */
      .setAuthor({
        name: `${member.displayName}`,
        iconURL: member.displayAvatarURL({
          extension: 'png',
          size: 128
        })
      })

      .setTitle(`✨ LEVEL ${currentLevel}`)

      .setThumbnail(
        member.displayAvatarURL({
          extension: 'png',
          size: 256
        })
      )

      /*
       * XP
       */
      .addFields({
        name: '⭐ Опыт',
        value: isMaxLevel
          ? `**${formattedTotalXp} XP**\nМаксимальный уровень достигнут!`
          : [
              `**${formattedXp} / ${formattedXpNeeded} XP**`,
              `${progressBar} **${progress}%**`
            ].join('\n'),
        inline: false
      })

      /*
       * Статистика
       */
      .addFields(
        {
          name: '🏆 Уровень',
          value: `**${currentLevel}**`,
          inline: true
        },
        {
          name: '💎 Всего XP',
          value: `**${formattedTotalXp}**`,
          inline: true
        },
        {
          name: '🚀 Следующий',
          value: isMaxLevel
            ? '**MAX**'
            : `**${nextLevel}**`,
          inline: true
        }
      );

    /*
     * XP до следующего уровня
     */
    if (!isMaxLevel) {
      embed.addFields({
        name: '📈 До следующего уровня',
        value: `Осталось **${xpRemaining.toLocaleString('ru-RU')} XP**`,
        inline: false
      });
    }

    /*
     * Footer
     */
    embed
      .setFooter({
        text: `${interaction.guild.name} • ${targetUser.username}`,
        iconURL: interaction.guild.iconURL({
          extension: 'png',
          size: 64
        }) || undefined
      })
      .setTimestamp();

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [embed]
    });

    logger.debug(
      `Проверен ранг пользователя ${targetUser.id} на сервере ${interaction.guildId}`
    );
  }
};

/**
 * Создаёт красивый progress bar.
 *
 * Пример:
 * ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ 40%
 */
function createProgressBar(percentage, length = 20) {
  const safePercentage = Math.max(
    0,
    Math.min(100, Number(percentage) || 0)
  );

  const filled = Math.round(
    (safePercentage / 100) * length
  );

  const empty = length - filled;

  return `▰`.repeat(filled) + `▱`.repeat(empty);
}

/**
 * Цвет карточки в зависимости от уровня.
 */
function getLevelColor(level) {
  if (level >= 100) {
    return '#FFD700'; // Золото
  }

  if (level >= 75) {
    return '#FF7A00'; // Оранжевый
  }

  if (level >= 50) {
    return '#A855F7'; // Фиолетовый
  }

  if (level >= 25) {
    return '#3B82F6'; // Синий
  }

  if (level >= 10) {
    return '#22C55E'; // Зелёный
  }

  return '#5865F2'; // Discord Blurple
}
