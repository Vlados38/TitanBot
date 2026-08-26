import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Бросает кости по стандартной записи (например, 2d20, 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("Запись броска (например, 2d6, 1d20 + 4)")
        .setRequired(true)
        .setMaxLength(50),
    ),

  category: 'Развлечения',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const notation = interaction.options
      .getString("notation")
      .toLowerCase()
      .replace(/\s/g, "");

    const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

    if (!match) {
      throw new TitanBotError(
        `Некорректная запись броска: ${notation}`,
        ErrorTypes.USER_INPUT,
        'Некорректная запись. Используйте формат вроде `1d20` или `3d6+5`.'
      );
    }

    const numDice = parseInt(match[1] || "1", 10);
    const numSides = parseInt(match[2], 10);
    const modifier = parseInt(match[3] || "0", 10);

    if (numDice < 1 || numDice > 20) {
      throw new TitanBotError(
        `Запрошено слишком много костей: ${numDice}`,
        ErrorTypes.VALIDATION,
        'Количество костей должно быть от 1 до 20.'
      );
    }

    if (numSides < 1 || numSides > 1000) {
      throw new TitanBotError(
        `Некорректное количество граней: ${numSides}`,
        ErrorTypes.VALIDATION,
        'Количество граней должно быть от 1 до 1000.'
      );
    }

    const rolls = [];
    let totalRoll = 0;

    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;
      rolls.push(roll);
      totalRoll += roll;
    }

    const finalTotal = totalRoll + modifier;

    const resultsDetail =
      numDice > 1 ? `**Броски:** ${rolls.join(" + ")}\n` : "";

    const modifierText = modifier !== 0
      ? `+ (${modifier})`
      : "";

    const embed = successEmbed(
      `🎲 Бросок ${numDice}d${numSides}${modifier !== 0 ? match[3] : ""}`,
      `${resultsDetail}**Сумма бросков:** ${totalRoll}${modifierText} = **${finalTotal}**`,
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [embed],
    });

    logger.debug(
      `Команда roll выполнена пользователем ${interaction.user.id} с записью ${notation} на сервере ${interaction.guildId}`
    );
  },
};
