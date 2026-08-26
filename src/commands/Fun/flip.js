import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Подбрасывает монетку (Орёл или Решка)."),

  category: 'Развлечения',

  async execute(interaction, config, client) {
    const result = Math.random() < 0.5 ? "Орёл" : "Решка";
    const emoji = result === "Орёл" ? "🪙" : "🔮";

    const embed = successEmbed(
      "Орёл или Решка?",
      `Монетка упала на... **${result}** ${emoji}!`,
    );

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });

    logger.debug(
      `Команда flip выполнена пользователем ${interaction.user.id} на сервере ${interaction.guildId}`
    );
  },
};
