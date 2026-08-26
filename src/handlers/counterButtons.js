import { MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_delete.js';
import { logger } from '../utils/logger.js';
import { ErrorTypes, replyUserError, handleInteractionError } from '../utils/errorHandler.js';

export const counterDeleteActionHandler = {
  name: 'counter-delete',

  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("Не удалось отложить обработку взаимодействия с кнопкой:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Это действие можно использовать только на сервере.'
        }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Данные для удаления счётчика отсутствуют.'
        }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Только пользователь, инициировавший удаление, может использовать эти кнопки.'
        }).catch(logger.error);
        return;
      }

      if (action === 'cancel') {
        await interaction.editReply({
          embeds: [createEmbed({
            title: '❌ Отменено',
            description: 'Удаление счётчика отменено.',
            color: 'error'
          })],
          components: []
        }).catch(logger.error);

        return;
      }

      if (action !== 'confirm') {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Неизвестное действие удаления счётчика.'
        }).catch(logger.error);
        return;
      }

      const { message } = await performDeletionByCounterId(
        client,
        interaction.guild,
        counterId
      );

      await interaction.editReply({
        embeds: [successEmbed(message)],
        components: []
      }).catch(logger.error);

    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        handler: 'counter_delete',
        customId: interaction.customId,
      });
    }
  }
};

export default counterDeleteActionHandler;
