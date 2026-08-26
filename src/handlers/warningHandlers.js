import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/moderation/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

const warningDeleteSpecificHandler = {
  name: 'warning_delete_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Только модератор, который просматривал эти предупреждения, может удалить их.'
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_delete_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Удаление предупреждения');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Номер предупреждения (#1, #2 и т. д.)')
        .setPlaceholder('Введите номер предупреждения для удаления')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Ошибка кнопки удаления предупреждения:', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Не удалось открыть форму удаления предупреждения.'
      });
    }
  }
};

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Только модератор, который просматривал эти предупреждения, может удалить их все.'
        });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'этого пользователя';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Удаление всех предупреждений')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('delete_confirmation')
              .setLabel('Введите "DELETE", чтобы удалить все предупреждения')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('DELETE')
              .setMaxLength(6)
              .setMinLength(6)
              .setRequired(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (error) {
      logger.error('Ошибка кнопки удаления всех предупреждений:', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Не удалось открыть форму подтверждения.'
      });
    }
  }
};

async function warningDeleteModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Только исходный модератор может удалять предупреждения.'
      });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Пожалуйста, введите корректный номер предупреждения (например: 1, 2, 3).'
      });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const guildId = interaction.guildId;
    const warnings = await WarningService.getWarnings(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await replyUserError(interaction, {
        type: ErrorTypes.USER_INPUT,
        message: `Предупреждение №${warningNumber} не существует. У этого пользователя всего ${warnings.length} предупреждени(е/я/й).`
      });
    }

    const warningToDelete = warnings[warningNumber - 1];
    await WarningService.removeWarning(guildId, targetUserId, warningToDelete.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'пользователя';

    logger.info(`[МОДЕРАЦИЯ] Предупреждение удалено для ${targetUserId} на сервере ${guildId} пользователем ${interaction.user.id}`, {
      warningId: warningToDelete.id,
      reason: warningToDelete.reason,
      warningNumber
    });

    await interaction.editReply({
      embeds: [
        successEmbed(
          '✅ Предупреждение удалено',
          `Предупреждение №${warningNumber} для **${targetName}** было удалено.\n\n**Причина:** ${warningToDelete.reason.substring(0, 100)}`
        )
      ]
    });
  } catch (error) {
    logger.error('Ошибка обработчика удаления предупреждения:', error);
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Не удалось удалить предупреждение.'
    });
  }
}

async function warningClearConfirmModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Только исходный модератор может удалить все предупреждения.'
      });
    }

    const confirmation = interaction.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Для подтверждения удаления всех предупреждений необходимо точно ввести "DELETE".'
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const { count } = await WarningService.clearWarnings(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'пользователя';

    logger.info(`[МОДЕРАЦИЯ] Все предупреждения удалены для ${targetUserId} на сервере ${guildId} пользователем ${interaction.user.id}`);

    await interaction.editReply({
      embeds: [
        successEmbed(
          '✅ Предупреждения удалены',
          `Все предупреждения пользователя **${targetName}** были удалены. Удалено предупреждений: **${count}**.`
        )
      ]
    });
  } catch (error) {
    logger.error('Ошибка обработчика подтверждения удаления всех предупреждений:', error);

    if (!interaction.replied && !interaction.deferred) {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Не удалось удалить предупреждения.'
      });
    } else {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Не удалось удалить предупреждения.'
      });
    }
  }
}

export {
  warningDeleteSpecificHandler,
  warningClearAllHandler,
  warningDeleteModalHandler,
  warningClearConfirmModalHandler,
};

export default {
  name: 'warning_delete_modal',
  execute: warningDeleteModalHandler
};
