import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Получить подробную информацию о пользователе")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("Пользователь для просмотра (по умолчанию — вы)"),
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`Не удалось отложить взаимодействие UserInfo`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      return;
    }

    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

    const embed = createEmbed({ title: `Информация о пользователе: ${user.username}` })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Бот", value: user.bot ? "Да" : "Нет", inline: true },
        {
          name: "Роли",
          value:
            member && member.roles.cache.size > 1
              ? member.roles.cache
                  .map((r) => r.name)
                  .slice(0, 5)
                  .join(", ")
              : "Нет",
          inline: true,
        },
        {
          name: "Аккаунт создан",
          value: `<t:${createdTimestamp}:R>`,
          inline: false,
        },
        {
          name: "Присоединился к серверу",
          value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Не состоит на сервере",
          inline: false,
        },
        {
          name: "Высшая роль",
          value: member?.roles?.highest?.name || "Нет",
          inline: true,
        },
      );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`Команда UserInfo выполнена`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  },
};
