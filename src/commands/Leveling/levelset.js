import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { setUserLevel, getLevelingConfig } from '../../services/leveling/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription('Установить пользователю определённый уровень')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Пользователь, которому нужно установить уровень')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Уровень, который нужно установить')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'Для использования этой команды вам необходимо право **Управление сервером**.'
    );

    if (!hasPermission) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);

    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('Система уровней в данный момент отключена на этом сервере.')
        ],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    const targetUser = interaction.options.getUser('user');
    const newLevel = interaction.options.getInteger('level');

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new TitanBotError(
        `Пользователь ${targetUser.id} не найден на этом сервере`,
        ErrorTypes.USER_INPUT,
        'Указанный пользователь не находится на этом сервере.'
      );
    }

    const userData = await setUserLevel(
      client,
      interaction.guildId,
      targetUser.id,
      newLevel
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Уровень установлен',
          description:
            `Пользователю ${targetUser.tag} успешно установлен уровень **${newLevel}**.` +
            `\n**Всего XP:** ${userData.totalXp}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] Пользователь ${interaction.user.tag} установил ${targetUser.tag} уровень ${newLevel} на сервере ${interaction.guildId}`
    );
  }
};
