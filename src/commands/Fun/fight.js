import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const rand = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
  data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Начать симулированную текстовую битву 1 на 1.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("Пользователь, с которым вы будете сражаться.")
        .setRequired(true),
    ),

  category: 'Развлечения',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");

    if (challenger.id === opponent.id) {
      const embed = warningEmbed(
        "⚔️ Недопустимый вызов",
        `**${challenger.username}**, вы не можете сражаться с самим собой! Это ничья ещё до начала битвы.`
      );

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
      });
    }

    if (opponent.bot) {
      const embed = warningEmbed(
        "⚔️ Недопустимый противник",
        "Вы не можете сражаться с ботами! Выберите настоящего пользователя."
      );

      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
      });
    }

    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser =
      winner.id === challenger.id ? opponent : challenger;

    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log = [];

    log.push(
      `💥 **${challenger.username}** вызывает **${opponent.username}** на дуэль! (Лучший из ${rounds} раундов)`,
    );

    for (let i = 1; i <= rounds; i++) {
      const attacker =
        rand(0, 1) === 0 ? challenger : opponent;

      const target =
        attacker.id === challenger.id ? opponent : challenger;

      const action = [
        "наносит размашистый удар",
        "наносит критический удар",
        "использует слабое заклинание",
        "парирует атаку и контратакует",
      ][rand(0, 3)];

      log.push(
        `\n**Раунд ${i}:** ${attacker.username} ${action} по ${target.username} и наносит ${rand(1, damage)} урона!`,
      );
    }

    const outcomeText = log.join("\n");

    const winnerText =
      `👑 **${winner.username}** побеждает ${loser.username} и забирает победу!`;

    const fullDescription =
      `${outcomeText}\n\n${winnerText}`;

    const description =
      fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

    const embed = successEmbed(
      "🏆 Дуэль завершена!",
      description
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [embed],
    });

    logger.debug(
      `Команда fight выполнена между ${challenger.id} и ${opponent.id} на сервере ${interaction.guildId}`
    );
  },
};
