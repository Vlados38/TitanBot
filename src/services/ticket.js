// ticket.js

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { buildStandardLogEmbed, formatLogLine } from '../utils/logging/logEmbeds.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData, getOpenTicketCountForUser, incrementTicketCounter } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { ensureTypedServiceError, wrapServiceBoundary } from '../utils/serviceErrorBoundary.js';
import { PRIORITY_MAP } from '../utils/helpers.js';

const TICKET_DELETE_DELAY_MS = 3000;
const TICKET_DELETE_DELAY_SECONDS = Math.floor(TICKET_DELETE_DELAY_MS / 1000);
const TICKET_SERVICE = 'ticketService';

function ticketUserError(message, userMessage, type = ErrorTypes.VALIDATION, context = {}) {
  throw createError(message, type, userMessage, { service: TICKET_SERVICE, ...context });
}

function requireTicket(ticketData, channel) {
  if (!ticketData) {
    ticketUserError(
      'Канал не является тикетом',
      'Это не канал тикета.',
      ErrorTypes.VALIDATION,
      { channelId: channel?.id, guildId: channel?.guild?.id }
    );
  }
  return ticketData;
}

function rethrowTicketError(error, operation, userMessage, context = {}) {
  throw ensureTypedServiceError(error, {
    service: TICKET_SERVICE,
    operation,
    message: `Ошибка операции с тикетом: ${operation}`,
    userMessage,
    context,
  });
}

function buildTicketControlRow({ claimedBy = null } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimedBy ? 'Закреплено' : 'Взять тикет')
      .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji('🙋')
      .setDisabled(!!claimedBy),
    new ButtonBuilder()
      .setCustomId('ticket_pin')
      .setLabel('Закрепить')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📌'),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Закрыть')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
  );
}

export const getUserTicketCount = wrapServiceBoundary(async function getUserTicketCount(guildId, userId) {
  return await getOpenTicketCountForUser(guildId, userId);
}, {
  service: TICKET_SERVICE,
  operation: 'getUserTicketCount',
  userMessage: 'Не удалось подсчитать открытые тикеты.',
  context: {},
});

export async function createTicket(guild, member, categoryId, reason = 'Причина не указана', priority = 'none') {
  try {
    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config.tickets || {};
    
    const maxTicketsPerUser = config.maxTicketsPerUser ?? 3;
    const currentTicketCount = await getUserTicketCount(guild.id, member.id);
    
    if (currentTicketCount >= maxTicketsPerUser) {
      ticketUserError(
        `Достигнут лимит открытых тикетов для ${member.id}`,
        `Вы достигли максимального количества открытых тикетов (${maxTicketsPerUser}). Пожалуйста, закройте существующие тикеты перед созданием нового.`,
        ErrorTypes.VALIDATION,
        { guildId: guild.id, userId: member.id, operation: 'createTicket' }
      );
    }
    
    let category = categoryId ? 
      guild.channels.cache.get(categoryId) :
      guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name.toLowerCase().includes('tickets')
      );
    
    if (!category && !categoryId) {
      category = await guild.channels.create({
        name: 'Тикеты',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    }
    
    const ticketNumber = await getNextTicketNumber(guild.id);
    
    let channelName = `ticket-${ticketNumber}`;
    
    if (priority !== 'none') {
      const priorityInfo = PRIORITY_MAP[priority];
      if (priorityInfo) {
        channelName = `${priorityInfo.emoji} ${channelName}`;
      }
    }
    
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...(config.ticketStaffRoleId ? [{
          id: config.ticketStaffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        }] : []),
      ],
    });
    
    const ticketData = {
      id: channel.id,
      userId: member.id,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
    };
    
    await saveTicketData(guild.id, channel.id, ticketData);
    
    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.none;
    
    const embed = createEmbed({
      title: `Тикет №${ticketNumber}`,
      description: `${member.toString()}, спасибо за создание тикета!\n\n**Причина:** ${reason}\n**Приоритет:** ${priorityInfo.emoji} ${priorityInfo.label}`,
      color: priorityInfo.color,
      fields: [
        { name: 'Статус', value: '🟢 Открыт', inline: true },
        { name: 'Закреплён за', value: 'Не закреплён', inline: true },
        { name: 'Создан', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      ],
    });
    
    const row = buildTicketControlRow();
    
    if (ticketConfig.enablePriority) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_priority:low')
          .setLabel('Низкий')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔵'),
        new ButtonBuilder()
          .setCustomId('ticket_priority:high')
          .setLabel('Высокий')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔴')
      );
    }
    
    const staffMention = config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : '';
    const messageContent = `${member.toString()}${staffMention}`;
    
    const ticketMessage = await channel.send({ 
      content: messageContent,
      embeds: [embed],
      components: [row] 
    });

    await ticketMessage.pin().catch(() => {});
    
    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,
      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber: ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason: reason,
        priority: priority || 'none',
        metadata: {
          channelId: channel.id,
          categoryName: category?.name || 'По умолчанию'
        }
      }
    });
    
    return { channel, ticketData };
    
  } catch (error) {
    rethrowTicketError(error, 'createTicket', 'Не удалось создать тикет. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: guild?.id, userId: member?.id });
  }
}

export async function closeTicket(channel, closer, reason = 'Причина не указана') {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const config = await getGuildConfig(channel.client, channel.guild.id);
    const dmOnClose = config.dmOnClose !== false;
    const closedCategoryId = config.ticketClosedCategoryId || null;
    let movedToClosedCategory = false;
    
    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (closedCategoryId && channel.parentId !== closedCategoryId) {
      const closedCategory = channel.guild.channels.cache.get(closedCategoryId)
        || await channel.guild.channels.fetch(closedCategoryId).catch(() => null);

      if (closedCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(closedCategoryId, { lockPermissions: false });
          movedToClosedCategory = true;
        } catch (moveError) {
            logger.warn(`Не удалось переместить тикет ${channel.id} в категорию закрытых тикетов ${closedCategoryId}: ${moveError.message}`);
        }
      } else {
        logger.warn(`Указанная категория закрытых тикетов недействительна для сервера ${channel.guild.id}: ${closedCategoryId}`);
      }
    }
    
    if (dmOnClose) {
      try {
        const ticketCreator = await channel.client.users.fetch(ticketData.userId).catch(() => null);
        if (ticketCreator) {
          const dmEmbed = createEmbed({
            title: '🎫 Ваш тикет закрыт',
            description: `Ваш тикет **${channel.name}** был закрыт.\n\n**Причина:** ${reason}\n**Закрыл:** ${closer.tag}\n**Закрыт:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nСпасибо за использование нашей системы поддержки! Если у вас остались вопросы, вы можете создать новый тикет.`,
            color: '#e74c3c',
            footer: { text: `ID тикета: ${ticketData.id}` }
          });

          await ticketCreator.send({ embeds: [dmEmbed] });

          try {
            const feedbackEmbed = createEmbed({
              title: '⭐ Как вы оцениваете работу поддержки?',
              description: `Мы хотели бы узнать, как мы справились с **${channel.name}**.\nВыберите оценку ниже — это займёт всего секунду!`,
              color: '#F1C40F',
              footer: { text: 'Ваш отзыв помогает нам становиться лучше.' },
            });

            const base = `ticket_feedback:${channel.guild.id}:${channel.id}`;
            const starsRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`${base}:1`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:2`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:3`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:4`).setLabel('⭐ 4').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:5`).setLabel('⭐ 5').setStyle(ButtonStyle.Primary),
            );
            const declineRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_comment:${channel.guild.id}:${channel.id}`)
                .setLabel('✍️ Добавить комментарий')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_decline:${channel.guild.id}:${channel.id}`)
                .setLabel('❌ Нет, спасибо')
                .setStyle(ButtonStyle.Secondary),
            );

            await ticketCreator.send({
              embeds: [feedbackEmbed],
              components: [starsRow, declineRow],
            });
          } catch (feedbackError) {
            logger.warn(`Не удалось отправить опрос обратной связи создателю тикета ${ticketData.userId}: ${feedbackError.message}`);
          }
        }
      } catch (dmError) {
          logger.warn(`Не удалось отправить личное сообщение создателю тикета ${ticketData.userId}: ${dmError.message}`);
      }
    }
    
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      const targetUser = user?.user || await channel.client.users.fetch(ticketData.userId).catch(() => null);
      
      if (targetUser) {
        const overwrite = channel.permissionOverwrites.cache.get(ticketData.userId);
        if (overwrite) {
          await overwrite.edit({
            ViewChannel: false,
            SendMessages: false,
          });
        } else {
          await channel.permissionOverwrites.create(targetUser, {
            ViewChannel: false,
            SendMessages: false,
          });
        }
      }
    } catch (permError) {
        logger.warn(`Не удалось обновить права пользователя для закрытого тикета: ${permError.message}`);
    }
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Статус');
      
      if (statusField) {
        statusField.value = '🔴 Закрыт';
      }
      
      const updatedEmbed = createEmbed({
        title: embed.title || 'Тикет',
        description: embed.description || 'Обсуждение тикета',
        color: '#e74c3c',
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ 
        embeds: [updatedEmbed],
        components: []
      });
    }
    
    const closeEmbed = createEmbed({
      title: 'Тикет закрыт',
      description: `Этот тикет был закрыт пользователем ${closer}.\n**Причина:** ${reason}${dmOnClose ? '\n\n📩 Создателю тикета было отправлено личное сообщение.' : ''}`,
      color: '#e74c3c',
      footer: { text: `ID тикета: ${ticketData.id}` }
    });
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Открыть тикет заново')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Удалить тикет')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
    
    await channel.send({ embeds: [closeEmbed], components: [controlRow] });
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason: reason,
        metadata: {
          dmSent: dmOnClose,
          closedAt: ticketData.closedAt,
          movedToClosedCategory
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'closeTicket', 'Не удалось закрыть тикет. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: channel?.guild?.id, channelId: channel?.id, closerId: closer?.id });
  }
}

export async function claimTicket(channel, claimer) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (ticketData.claimedBy) {
      ticketUserError(
        'Тикет уже закреплён',
        `Этот тикет уже закреплён за <@${ticketData.claimedBy}>`,
        ErrorTypes.VALIDATION,
        { channelId: channel.id, claimedBy: ticketData.claimedBy, operation: 'claimTicket' }
      );
    }

    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Закреплён за');
      
      if (claimedField) {
        claimedField.value = claimer.toString();
      }
      
      const row = buildTicketControlRow({ claimedBy: claimer.id });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const claimEmbed = createEmbed({
      title: 'Тикет закреплён',
      description: `🎉 ${claimer} закрепил этот тикет за собой!`,
      color: '#2ecc71'
    });
    
    const unclaimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_unclaim')
        .setLabel('Открепить')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
    );

    const claimStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      (m.embeds[0].title === 'Тикет закреплён' || m.embeds[0].title === 'Тикет откреплён')
    );

    if (claimStatusMessage) {
      await claimStatusMessage.edit({ embeds: [claimEmbed], components: [unclaimRow] });
    } else {
      await channel.send({ embeds: [claimEmbed], components: [unclaimRow] });
    }
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'claim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,
        metadata: {
          claimedAt: ticketData.claimedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'claimTicket', 'Не удалось закрепить тикет. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: channel?.guild?.id, channelId: channel?.id, claimerId: claimer?.id });
  }
}

export async function reopenTicket(channel, reopener) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (ticketData.status !== 'closed') {
      ticketUserError(
        'Тикет не закрыт',
        'Этот тикет в данный момент не закрыт.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, operation: 'reopenTicket' }
      );
    }

    const config = await getGuildConfig(channel.client, channel.guild.id);
    const openCategoryId = config.ticketCategoryId || null;
    let movedToOpenCategory = false;
    let openCategoryMoveFailed = false;
    
    ticketData.status = 'open';
    ticketData.closedBy = null;
    ticketData.closedAt = null;
    ticketData.closeReason = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (openCategoryId && channel.parentId !== openCategoryId) {
      const openCategory = channel.guild.channels.cache.get(openCategoryId)
        || await channel.guild.channels.fetch(openCategoryId).catch(() => null);

      if (openCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(openCategoryId, { lockPermissions: false });
          movedToOpenCategory = true;
        } catch (moveError) {
          openCategoryMoveFailed = true;
          logger.warn(`Не удалось переместить вновь открытый тикет ${channel.id} в категорию открытых тикетов ${openCategoryId}: ${moveError.message}`);
        }
      } else {
        openCategoryMoveFailed = true;
        logger.warn(`Указанная категория открытых тикетов недействительна для сервера ${channel.guild.id}: ${openCategoryId}`);
      }
    }
    
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await channel.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
      }
    } catch (error) {
      logger.warn(`Не удалось восстановить доступ пользователю ${ticketData.userId}:`, error.message);
    }
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Статус');
      
      if (statusField) {
        statusField.value = '🟢 Открыт';
      }
      
      const row = buildTicketControlRow({ claimedBy: ticketData.claimedBy });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const reopenEmbed = createEmbed({
      title: 'Тикет вновь открыт',
      description: `🔓 ${reopener} вновь открыл этот тикет!`,
      color: '#2ecc71'
    });

    const closeStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title === 'Тикет закрыт' &&
      m.components.length > 0 &&
      m.components[0].components.some(c => c.customId === 'ticket_reopen')
    );

    if (closeStatusMessage) {
      await closeStatusMessage.edit({ embeds: [reopenEmbed], components: [] });
    } else {
      await channel.send({ embeds: [reopenEmbed] });
    }
    
    return { ticketData, movedToOpenCategory, openCategoryMoveFailed };
    
  } catch (error) {
    rethrowTicketError(error, 'reopenTicket', 'Не удалось вновь открыть тикет. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: channel?.guild?.id, channelId: channel?.id, reopenerId: reopener?.id });
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function generateTranscript(channel) {
  try {
    logger.debug('Создание транскрипта для канала', {
      channelId: channel.id,
      channelName: channel.name
    });

    const messages = [];
    let before = undefined;
    let batch;
    do {
      batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
    } while (batch.size === 100);

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const escape = (str) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const rows = messages.map((msg) => {
      const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
      const author = escape(msg.author?.tag ?? msg.author?.username ?? 'Неизвестно');
      const content = escape(msg.content || (msg.embeds.length ? '[вложение embed]' : '[вложение]'));
      return `<tr><td class="ts">${ts}</td><td class="author">${author}</td><td class="msg">${content}</td></tr>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Транскрипт – #${escape(channel.name)}</title>
<style>
body{font-family:sans-serif;background:#36393f;color:#dcddde;margin:0;padding:16px}
h1{color:#fff;font-size:1.2rem;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{background:#2f3136;color:#8e9297;padding:6px 8px;text-align:left;border-bottom:2px solid #202225}
td{padding:4px 8px;border-bottom:1px solid #40444b;vertical-align:top}
.ts{color:#72767d;white-space:nowrap;width:160px}
.author{color:#7289da;white-space:nowrap;width:160px}
.msg{word-break:break-word}
</style>
</head>
<body>
<h1>📜 Транскрипт – #${escape(channel.name)}</h1>
<p style="color:#72767d">${messages.length} сообщ. экспортировано ${new Date().toUTCString()}</p>
<table>
<thead><tr><th>Время (UTC)</th><th>Автор</th><th>Сообщение</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf8');
    const attachment = new AttachmentBuilder(buffer, { name: `ticket-${channel.id}.html` });

    logger.info('✅ Транскрипт успешно создан', {
      channelId: channel.id,
      channelName: channel.name,
      messageCount: messages.length,
      size: buffer.length
    });

    return attachment;
  } catch (error) {
    logger.error('❌ Не удалось создать транскрипт:', {
      channelId: channel.id,
      channelName: channel.name,
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack
    });
    return null;
  }
}

export async function deleteTicket(channel, deleter) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const deleteEmbed = createEmbed({
      title: 'Тикет удалён',
      description: `🗑️ Этот тикет будет окончательно удалён через ${TICKET_DELETE_DELAY_SECONDS} сек.`,
      color: '#e74c3c',
      footer: { text: `ID тикета: ${ticketData.id}` }
    });
    
    await channel.send({ embeds: [deleteEmbed] });
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'delete',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: deleter.id,
        metadata: {
          deletedAt: new Date().toISOString()
        }
      }
    });

    setTimeout(async () => {
      try {
        logger.debug('Начало процесса удаления тикета', {
          channelId: channel.id,
          ticketId: ticketData.id
        });

        let attachment = null;
        try {
          attachment = await generateTranscript(channel);
          if (attachment) {
            logger.info('Транскрипт успешно создан, выполняется отправка', {
              channelId: channel.id,
              ticketNumber: ticketData.id
            });
          } else {
            logger.warn('Генерация транскрипта вернула null', {
              channelId: channel.id,
              ticketNumber: ticketData.id
            });
          }
        } catch (transcriptError) {
          logger.error('Ошибка при создании транскрипта', {
            channelId: channel.id,
            ticketNumber: ticketData.id,
            error: transcriptError.message
          });
        }

        if (attachment) {
          try {
            const guildConfig = await getGuildConfig(channel.client, channel.guild.id);
            if (!guildConfig.ticketTranscriptChannelId) {
              logger.warn('Канал для транскриптов не настроен, отправка пропущена', {
                channelId: channel.id,
                ticketNumber: ticketData.id
              });
            } else {
              const transcriptChannel = await channel.client.channels.fetch(guildConfig.ticketTranscriptChannelId).catch(() => null);
              
              if (!transcriptChannel) {
                logger.error('Не удалось получить канал для транскриптов', {
                  channelId: channel.id,
                  transcriptChannelId: guildConfig.ticketTranscriptChannelId
                });
              } else if (!transcriptChannel.isSendable()) {
                logger.error('Канал транскриптов существует, но в него нельзя отправлять сообщения', {
                  channelId: channel.id,
                  transcriptChannelId: transcriptChannel.id
                });
              } else {
                
                const transcriptEmbed = buildStandardLogEmbed({
                  color: 0x3498db,
                  title: 'Транскрипт тикета',
                  description: [
                    formatLogLine('Тикет', `#${ticketData.id}`),
                    formatLogLine('Канал', `#${channel.name}`),
                    formatLogLine('Создан', `<t:${Math.floor(Date.now() / 1000)}:F>`),
                  ].join('\n'),
                  footer: deleter?.username
                    ? { text: `Удалил: ${deleter.username}`, iconURL: deleter.displayAvatarURL?.() }
                    : undefined,
                  timestamp: true,
                });

                await transcriptChannel.send({
                  embeds: [transcriptEmbed],
                  files: [attachment]
                });

                logger.info('✅ Транскрипт успешно отправлен', {
                  channelId: channel.id,
                  ticketNumber: ticketData.id,
                  transcriptChannelId: transcriptChannel.id
                });
              }
            }
          } catch (sendError) {
            logger.error('Не удалось отправить транскрипт в канал:', {
              channelId: channel.id,
              ticketNumber: ticketData.id,
              error: sendError.message
            });
          }
        }

        try {
          await channel.delete('Тикет удалён окончательно');
          logger.info('✅ Канал удалён', {
            channelId: channel.id,
            channelName: channel.name,
            ticketNumber: ticketData.id
          });
        } catch (deleteError) {
          logger.error('❌ Не удалось удалить канал тикета:', {
            channelId: channel.id,
            channelName: channel.name,
            ticketNumber: ticketData.id,
            errorMessage: deleteError.message,
            errorCode: deleteError.code,
            errorName: deleteError.name
          });
        }
      } catch (error) {
        logger.error('❌ Непредвиденная ошибка во время удаления тикета:', {
          channelId: channel.id,
          channelName: channel?.name,
          ticketNumber: ticketData?.id,
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack
        });
      }
    }, TICKET_DELETE_DELAY_MS);
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'deleteTicket', 'Не удалось удалить тикет. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: channel?.guild?.id, channelId: channel?.id, deleterId: deleter?.id });
  }
}

export async function unclaimTicket(channel, unclaimer) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (!ticketData.claimedBy) {
      ticketUserError(
        'Тикет не закреплён',
        'Этот тикет в данный момент ни за кем не закреплён.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, operation: 'unclaimTicket' }
      );
    }
    
    if (ticketData.claimedBy !== unclaimer.id && !unclaimer.permissions.has(PermissionFlagsBits.ManageChannels)) {
      ticketUserError(
        'Нельзя открепить тикет',
        'Вы можете открепить только тикеты, закреплённые за вами, либо вам необходимо право «Управление каналами».',
        ErrorTypes.PERMISSION,
        { channelId: channel.id, operation: 'unclaimTicket' }
      );
    }
    
    const previousClaimer = ticketData.claimedBy;
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Закреплён за');
      
      if (claimedField) {
        claimedField.value = 'Не закреплён';
      }
      
      const row = buildTicketControlRow();
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const claimMessage = messages.find(m => 
      m.embeds.length > 0 && 
      (m.embeds[0].title === 'Тикет закреплён' || m.embeds[0].title === 'Тикет откреплён')
    );
    
    if (claimMessage) {
      const unclaimEmbed = createEmbed({
        title: 'Тикет откреплён',
        description: `🔓 ${unclaimer} открепил этот тикет!`,
        color: '#f39c12'
      });
      
      await claimMessage.edit({ 
        embeds: [unclaimEmbed],
        components: []
      });
    } else {
      const unclaimEmbed = createEmbed({
        title: 'Тикет откреплён',
        description: `🔓 ${unclaimer} открепил этот тикет!`,
        color: '#f39c12'
      });
      
      await channel.send({ embeds: [unclaimEmbed] });
    }
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'unclaim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,
        metadata: {
          previousClaimer: previousClaimer
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'unclaimTicket', 'Не удалось открепить тикет. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: channel?.guild?.id, channelId: channel?.id, unclaimerId: unclaimer?.id });
  }
}

async function getNextTicketNumber(guildId) {
  return await incrementTicketCounter(guildId);
}

export async function updateTicketPriority(channel, priority, updater) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const priorityInfo = PRIORITY_MAP[priority];
    if (!priorityInfo) {
      ticketUserError(
        'Недопустимый уровень приоритета',
        'Недопустимый уровень приоритета.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, priority, operation: 'updateTicketPriority' }
      );
    }
    
    ticketData.priority = priority;
    ticketData.priorityUpdatedBy = updater.id;
    ticketData.priorityUpdatedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const currentName = channel.name;
    const priorityEmojis = [...new Set(Object.values(PRIORITY_MAP).map((item) => item.emoji).filter(Boolean))];
    const escapedPriorityEmojis = priorityEmojis.map((emoji) => emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const cleanName = escapedPriorityEmojis.length > 0
      ? currentName.replace(new RegExp(`(?:${escapedPriorityEmojis.join('|')})`, 'g'), '').trim()
      : currentName.trim();
    const newName = priority === 'none' ? cleanName : `${priorityInfo.emoji} ${cleanName}`;

    if (newName && newName !== currentName) {
      try {
        await channel.setName(newName);
      } catch (nameError) {
        logger.warn(`Не удалось изменить название канала в соответствии с приоритетом: ${nameError.message}`);
      }
    }
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      
      const updatedEmbed = createEmbed({
        title: embed.title || 'Тикет',
        description: embed.description?.split('\n**Priority:**')[0] + `\n**Приоритет:** ${priorityInfo.emoji} ${priorityInfo.label}`,
        color: priorityInfo.color,
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ embeds: [updatedEmbed] });
    }
    
    const updateEmbed = createEmbed({
      title: 'Приоритет обновлён',
      description: `📊 Приоритет тикета изменён на **${priorityInfo.emoji} ${priorityInfo.label}** пользователем ${updater}`,
      color: priorityInfo.color
    });
    
    await channel.send({ embeds: [updateEmbed] });
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'priority',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: updater.id,
        priority: priority,
        metadata: {
          previousPriority: ticketData.priority,
          updatedAt: ticketData.priorityUpdatedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'updateTicketPriority', 'Не удалось изменить приоритет тикета. Пожалуйста, попробуйте ещё раз через некоторое время.', { guildId: channel?.guild?.id, channelId: channel?.id, updaterId: updater?.id, priority });
  }
}
