import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../services/leveling/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Удалить уровни у пользователя')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Пользователь, у которого нужно удалить уровни')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Количество уровней для удаления')
        .setRequired(true)
        .setMinValue(1)
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
    const levelsToRemove = interaction.options.getInteger('levels');

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

    const userData = await getUserLevelData(
      client,
      interaction.guildId,
      targetUser.id
    );

    if (userData.level === 0) {
      throw new TitanBotError(
        `Пользователь ${targetUser.id} уже находится на минимальном уровне`,
        ErrorTypes.VALIDATION,
        `${targetUser.tag} уже находится на **0 уровне**, поэтому удалить уровни невозможно.`
      );
    }

    const updatedData = await removeLevels(
      client,
      interaction.guildId,
      targetUser.id,
      levelsToRemove
    );

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Уровни удалены',
          description:
            `У пользователя ${targetUser.tag} успешно удалено **${levelsToRemove}** ур. ` +
            `\n**Новый уровень:** ${updatedData.level}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] Пользователь ${interaction.user.tag} удалил ${levelsToRemove} уровней у ${targetUser.tag} на сервере ${interaction.guildId}`
    );
  }
};
