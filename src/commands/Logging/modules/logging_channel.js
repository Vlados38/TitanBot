import { PermissionsBitField, ChannelType } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

const DESTINATION_LABELS = {
  audit: 'Журнал аудита',
  applications: 'Заявки',
  reports: 'Жалобы',
};

export default {
  prefixOnly: false,

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Для настройки каналов журналирования вам необходимо право **Управление сервером**.',
        });
      }

      await InteractionHelper.safeDefer(interaction, { ephemeral: true });

      const destination = interaction.options.getString('destination');
      const channel = interaction.options.getChannel('channel');
      const disable = interaction.options.getBoolean('disable') ?? false;

      if (disable) {
        await setLogChannel(client, interaction.guildId, destination, null);

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Канал отключён',
              `Канал **${DESTINATION_LABELS[destination]}** был удалён из настроек.`,
            ),
          ],
        });
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        return await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Пожалуйста, укажите действительный текстовый канал.',
        });
      }

      const botPerms = channel.permissionsFor(interaction.guild.members.me);

      if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: `Мне необходимы права **Просмотр канала**, **Отправка сообщений** и **Встраивание ссылок** в ${channel}.`,
        });
      }

      await setLogChannel(
        client,
        interaction.guildId,
        destination,
        channel.id
      );

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Канал обновлён',
            `Журналы **${DESTINATION_LABELS[destination]}** теперь будут отправляться в ${channel}.\nИспользуйте \`/logging dashboard\`, чтобы настроить категории событий.`,
          ),
        ],
      });
    } catch (error) {
      logger.error('logging_channel error:', error);

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Не удалось обновить канал журнала.',
      });
    }
  },
};
