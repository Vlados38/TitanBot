import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/vzQjbUj4N";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Получить ссылку на сервер поддержки"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Присоединиться к серверу поддержки")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "Нужна помощь?", description: "Присоединяйтесь к нашему официальному серверу поддержки, чтобы получить помощь, сообщить об ошибке или предложить новую функцию. Если вы настраиваете этого бота, не забудьте изменить ссылку в коде!" }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'Системная ошибка', description: 'Не удалось отобразить информацию о поддержке.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};
