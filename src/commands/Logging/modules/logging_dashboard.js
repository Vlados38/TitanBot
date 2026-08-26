import { EmbedBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  createLoggingDashboardComponents,
  createLoggingCategoryViewComponents,
  createLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export function getCategoryStatus(enabledEvents, category, auditEnabled) {
  if (!auditEnabled) return false;

  const events = enabledEvents || {};

  if (events[`${category}.*`] === false) return false;

  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];

  if (categoryEvents.length === 0) return true;

  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
  if (!id) return '`Не настроен`';

  const channel =
    guild.channels.cache.get(id) ??
    await guild.channels.fetch(id).catch(() => null);

  return channel
    ? channel.toString()
    : `⚠️ Не найден (${id})`;
}

function countEnabledCategories(enabledEvents, auditEnabled) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;

  return {
    enabled,
    total: DASHBOARD_CATEGORIES.length,
  };
}

export async function buildLoggingDashboardView(interaction, client) {
  const guildConfig = await getGuildConfig(client, interaction.guildId);
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);

  const auditEnabled = Boolean(loggingStatus.enabled);
  const channels = loggingStatus.channels || {};

  const auditChannel = await formatChannelMention(
    interaction.guild,
    channels.audit
  );

  const applicationsChannel = await formatChannelMention(
    interaction.guild,
    channels.applications
  );

  const reportsChannel = await formatChannelMention(
    interaction.guild,
    channels.reports
  );

  const lifecycleChannel = await formatChannelMention(
    interaction.guild,
    guildConfig.ticketLogsChannelId
  );

  const transcriptChannel = await formatChannelMention(
    interaction.guild,
    guildConfig.ticketTranscriptChannelId
  );

  const ignore = loggingStatus.ignore || {
    users: [],
    channels: [],
  };

  const {
    enabled: enabledCount,
    total,
  } = countEnabledCategories(
    loggingStatus.enabledEvents,
    auditEnabled
  );

  const embed = new EmbedBuilder()
    .setTitle('📝 Панель журналирования')
    .setDescription(
      `Управление журналированием сервера **${interaction.guild.name}**. ` +
      `Используйте меню ниже для настройки каналов, категорий и фильтров.`
    )
    .setColor(
      auditEnabled
        ? getColor('success')
        : getColor('warning')
    )
    .addFields(
      {
        name: 'Статус журналирования',
        value: auditEnabled
          ? '✅ Включено'
          : '❌ Отключено',
        inline: true,
      },
      {
        name: 'Категории событий',
        value: auditEnabled
          ? `${enabledCount}/${total} включено`
          : '`Журналирование отключено`',
        inline: true,
      },
      {
        name: 'Фильтры исключений',
        value:
          `${ignore.users?.length || 0} пользователей · ` +
          `${ignore.channels?.length || 0} каналов`,
        inline: true,
      },
      {
        name: 'Каналы журналов',
        value: [
          `**Аудит:** ${auditChannel}`,
          `**Заявки:** ${applicationsChannel}`,
          `**Жалобы:** ${reportsChannel}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Каналы тикетов (только просмотр)',
        value: [
          `**Журнал тикетов:** ${lifecycleChannel}`,
          `**Транскрипты:** ${transcriptChannel}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({
      text: 'Каналы тикетов: настройте через /ticket dashboard',
    })
    .setTimestamp();

  const components = createLoggingDashboardComponents(
    loggingStatus.enabledEvents,
    auditEnabled
  );

  return {
    embed,
    components,
  };
}

export async function buildLoggingCategoriesView(interaction, client) {
  const loggingStatus = await getLoggingStatus(
    client,
    interaction.guildId
  );

  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(
      loggingStatus.enabledEvents,
      key,
      auditEnabled
    );

    const label = DASHBOARD_CATEGORY_LABELS[key] || key;

    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 Категории событий')
    .setDescription(
      auditEnabled
        ? 'Выберите, какие типы событий будут записываться в канал аудита.'
        : '⚠️ Журналирование отключено. Включите его в главной панели, чтобы отправлять журналы.'
    )
    .setColor(getColor('info'))
    .addFields({
      name: 'Статус категорий',
      value: categoryLines,
      inline: false,
    })
    .setFooter({
      text: 'Зелёный = журналирование включено · Красный = журналирование отключено',
    })
    .setTimestamp();

  const components = createLoggingCategoryViewComponents(
    loggingStatus.enabledEvents,
    auditEnabled
  );

  return {
    embed,
    components,
  };
}

export async function buildLoggingFilterView(interaction, client) {
  const loggingStatus = await getLoggingStatus(
    client,
    interaction.guildId
  );

  const ignore = loggingStatus.ignore || {
    users: [],
    channels: [],
  };

  const userLines = (ignore.users || []).length
    ? ignore.users
        .map((id) => `• Пользователь \`${id}\``)
        .join('\n')
    : '*Нет исключённых пользователей*';

  const channelLines = (ignore.channels || []).length
    ? ignore.channels
        .map((id) => `• Канал \`${id}\``)
        .join('\n')
    : '*Нет исключённых каналов*';

  const embed = new EmbedBuilder()
    .setTitle('🔇 Фильтры исключений журналирования')
    .setDescription(
      'Пользователи и каналы из этого списка будут исключены при отправке журналов аудита.'
    )
    .setColor(getColor('info'))
    .addFields(
      {
        name: 'Исключённые пользователи',
        value: userLines.slice(0, 1024),
        inline: false,
      },
      {
        name: 'Исключённые каналы',
        value: channelLines.slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({
      text: 'Используйте кнопки ниже, чтобы добавить или удалить фильтры',
    })
    .setTimestamp();

  const components = createLoggingFilterComponents();

  return {
    embed,
    components,
  };
}

export function isCategoriesView(interaction) {
  return interaction.message?.embeds?.[0]?.title === '📋 Категории событий';
}

export function isFilterView(interaction) {
  return interaction.message?.embeds?.[0]?.title === '🔇 Фильтры исключений журналирования';
}

export async function refreshDashboardMessage(interaction, client) {
  let view;

  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(
      interaction,
      client
    );
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(
      interaction,
      client
    );
  } else {
    view = await buildLoggingDashboardView(
      interaction,
      client
    );
  }

  await interaction.message
    .edit({
      embeds: [view.embed],
      components: view.components,
      content: null,
    })
    .catch(() => {});
}

export default {
  prefixOnly: false,

  async execute(interaction, config, client) {
    try {
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ManageGuild
        )
      ) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message:
            'Для просмотра панели журналирования вам необходимо право **Управление сервером**.',
        });
      }

      await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral,
      });

      const {
        embed,
        components,
      } = await buildLoggingDashboardView(
        interaction,
        client
      );

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components,
      });
    } catch (error) {
      logger.error('logging_dashboard error:', error);

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Не удалось загрузить панель журналирования.',
      });
    }
  },
};
