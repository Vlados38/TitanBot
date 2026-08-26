import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { createTicket, closeTicket, claimTicket, updateTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { replyUserError, ErrorTypes, handleInteractionError, createError } from '../utils/errorHandler.js';
import { getTicketPermissionContext } from '../utils/ticket/ticketPermissions.js';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ensureGuildContext(interaction) {
  if (interaction.inGuild()) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Это действие можно использовать только на сервере.' });
  }

  return false;
}

async function assertTicketPermission(interaction, client, actionLabel, options = {}, timeoutMs = 2500) {
  const { allowTicketCreator = false } = options;

  let context;
  try {
    const contextPromise = getTicketPermissionContext({ client, interaction });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );
    context = await Promise.race([contextPromise, timeoutPromise]);
  } catch (error) {
    if (error.message === 'Timeout') {
      throw createError(
        'Ticket permission timeout',
        ErrorTypes.RATE_LIMIT,
        'Проверка прав заняла слишком много времени. Пожалуйста, попробуйте ещё раз.'
      );
    }
    throw createError(
      'Ticket permission check failed',
      ErrorTypes.UNKNOWN,
      `Не удалось проверить права: ${error.message}`
    );
  }

  if (!context.ticketData) {
    throw createError(
      'Not a ticket channel',
      ErrorTypes.VALIDATION,
      'Это действие можно использовать только в действительном тикет-канале.'
    );
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'У вас должно быть право **Управление каналами**, настроенная **роль персонала тикетов**, либо вы должны быть **создателем тикета**.'
      : 'У вас должно быть право **Управление каналами** или настроенная **роль персонала тикетов**.';
    throw createError(
      'Ticket permission denied',
      ErrorTypes.PERMISSION,
      `${permissionMessage}\n\nВы не можете ${actionLabel}.`
    );
  }

  return context;
}

async function ensureTicketPermission(interaction, client, actionLabel, options = {}) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketPermissionContext({ client, interaction });

  if (!context.ticketData) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Это действие можно использовать только в действительном тикет-канале.' });
    return null;
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'У вас должно быть право **Управление каналами**, настроенная **роль персонала тикетов**, либо вы должны быть **создателем тикета**.'
      : 'У вас должно быть право **Управление каналами** или настроенная **роль персонала тикетов**.';

    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `${permissionMessage}\n\nВы не можете ${actionLabel}.` });
    return null;
  }

  return context;
}

const createTicketHandler = {
  name: 'create_ticket',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const rateLimitKey = `${interaction.user.id}:create_ticket`;
      const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
      if (!allowed) {
        await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Вы создаёте тикеты слишком часто. Пожалуйста, подождите минуту и попробуйте снова.' });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Вы достигли максимального количества открытых тикетов (${maxTicketsPerUser}).\n\nПожалуйста, закройте существующие тикеты перед созданием нового.\n\n**Текущие тикеты:** ${currentTicketCount}/${maxTicketsPerUser}` });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('create_ticket_modal')
        .setTitle('Создание тикета');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Почему вы создаёте этот тикет?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Опишите вашу проблему...')
        .setRequired(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error creating ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось открыть форму создания тикета.' });
      }
    }
  }
};

const createTicketModalHandler = {
  name: 'create_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      
      const { channel } = await createTicket(
        interaction.guild,
        interaction.member,
        categoryId,
        reason
      );
      await interaction.editReply({
        embeds: [successEmbed(
          'Тикет создан',
          `Ваш тикет был создан в ${channel}!`
        )]
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'button', handler: 'ticket', customId: interaction.customId });
    }
  }
};

const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'закрыть этот тикет', { allowTicketCreator: true }, 2000);

      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Закрытие тикета');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Причина закрытия (необязательно)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Укажите необязательную причину закрытия тикета...')
        .setRequired(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error closing ticket:', error);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось открыть форму закрытия тикета.' });
      }
    }
  }
};

const closeTicketModalHandler = {
  name: 'ticket_close_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'закрыть этот тикет', { allowTicketCreator: true }, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Закрыто через кнопку тикета без указания конкретной причины.';

      await closeTicket(interaction.channel, interaction.user, reason);
      await interaction.editReply({ embeds: [successEmbed('Тикет закрыт', 'Этот тикет был закрыт.')] });
    } catch (error) {
      logger.error('Error submitting close ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при закрытии тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при закрытии тикета.' });
      }
    }
  }
};

const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'забрать тикет', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      await claimTicket(interaction.channel, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Тикет принят', 'Вы взяли этот тикет в работу.')] });
    } catch (error) {
      logger.error('Error claiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при принятии тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при принятии тикета.' });
      }
    }
  }
};

const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'изменить приоритет тикета', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const priority = args?.[0];
      if (!priority) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Необходимо указать значение приоритета.' });
        return;
      }

      await updateTicketPriority(interaction.channel, priority, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Приоритет обновлён', `Приоритет тикета установлен на **${priority.toUpperCase()}**.`)] });
    } catch (error) {
      logger.error('Error updating ticket priority:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при изменении приоритета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при изменении приоритета.' });
      }
    }
  }
};

const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'закрепить тикет', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const channel = interaction.channel;
      const category = channel.parent;

      if (!category) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Этот тикет не находится в категории.' });
        return;
      }

      const hasPingEmoji = channel.name.startsWith('📌');
      
      if (hasPingEmoji) {
        
        const newName = channel.name.replace(/^📌\s*/, '');
        await channel.edit({
          name: newName,
          position: 999 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Тикет откреплён',
            description: 'Этот тикет был откреплён и возвращён на обычную позицию.',
            color: 0x95A5A6
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Ticket unpinned', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: newName,
          userId: interaction.user.id
        });
      } else {
        
        const pinnedName = `📌 ${channel.name}`;
        await channel.edit({
          name: pinnedName,
          position: 0 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Тикет закреплён',
            description: 'Этот тикет был закреплён в верхней части категории.',
            color: 0x3498db
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Ticket pinned', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: pinnedName,
          userId: interaction.user.id
        });
      }

      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId,
        event: {
          type: hasPingEmoji ? 'unpin' : 'pin',
          ticketId: channel.id,
          ticketNumber: channel.name.replace(/[^0-9]/g, ''),
          userId: interaction.user.id,
          executorId: interaction.user.id,
          metadata: {
            isPinned: !hasPingEmoji,
            newChannelName: hasPingEmoji ? channel.name.replace(/^📌\s*/, '') : `📌 ${channel.name}`
          }
        }
      });

    } catch (error) {
      logger.error('Error pinning/unpinning ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось закрепить/открепить тикет.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось закрепить/открепить тикет.' });
      }
    }
  }
};

const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'отменить принятие тикета', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      await unclaimTicket(interaction.channel, interaction.member);
      await interaction.editReply({ embeds: [successEmbed('Тикет освобождён', 'Этот тикет больше не закреплён за вами.')] });
    } catch (error) {
      logger.error('Error unclaiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при освобождении тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при освобождении тикета.' });
      }
    }
  }
};

const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'переоткрыть тикеты', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const { movedToOpenCategory, openCategoryMoveFailed } = await reopenTicket(interaction.channel, interaction.member);
      let reopenMessage = 'Этот тикет был переоткрыт.';
      if (openCategoryMoveFailed) {
        reopenMessage += ' Примечание: не удалось переместить канал обратно в категорию открытых тикетов.';
      }
      await interaction.editReply({ embeds: [successEmbed('Тикет переоткрыт', reopenMessage)] });
    } catch (error) {
      logger.error('Error reopening ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при переоткрытии тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при переоткрытии тикета.' });
      }
    }
  }
};

const deleteTicketHandler = {
  name: 'ticket_delete',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'удалить тикеты', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { deleteTicket } = await import('../services/ticket.js');
      await deleteTicket(interaction.channel, interaction.member);
      await interaction.editReply({ embeds: [successEmbed('Тикет удалён', 'Этот тикет будет удалён в ближайшее время.')] });
    } catch (error) {
      logger.error('Error deleting ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при удалении тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при удалении тикета.' });
      }
    }
  }
};

export default createTicketHandler;
export { 
  createTicketModalHandler, 
  closeTicketModalHandler,
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler 
};
