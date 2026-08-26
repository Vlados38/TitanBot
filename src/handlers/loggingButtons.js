import {
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogChannel,
  updateIgnoreList,
  getIgnoreList,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { successEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import {
  buildLoggingDashboardView,
  buildLoggingCategoriesView,
  buildLoggingFilterView,
  isCategoriesView,
  isFilterView,
  refreshDashboardMessage,
} from '../commands/Logging/modules/logging_dashboard.js';

const LOGGING_CATEGORIES = [...new Set(
  Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0])
)];

const DESTINATION_LABELS = {
  audit: 'Журнал аудита',
  applications: 'Заявки',
  reports: 'Отчёты',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_back',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Для использования этой функции необходимо право **Управление сервером**.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'log_dash_refresh') {
        return handleRefresh(interaction);
      }

      if (interaction.customId === 'log_dash_back') {
        return handleBackToMain(interaction);
      }

      if (interaction.customId === 'log_dash_remove_filter') {
        return handleRemoveFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_add_filter:')) {
        return handleAddFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_toggle')) {
        return handleToggle(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        customId: interaction.customId,
        handler: 'logging',
      });
    }
  },
};

async function handleRefresh(interaction) {
  if (isCategoriesView(interaction)) {
    const { embed, components } = await buildLoggingCategoriesView(
      interaction,
      interaction.client
    );

    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (isFilterView(interaction)) {
    const { embed, components } = await buildLoggingFilterView(
      interaction,
      interaction.client
    );

    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  const { embed, components } = await buildLoggingDashboardView(
    interaction,
    interaction.client
  );

  await interaction.update({
    embeds: [embed],
    components,
    content: null,
  });
}

async function handleBackToMain(interaction) {
  const { embed, components } = await buildLoggingDashboardView(
    interaction,
    interaction.client
  );

  await interaction.update({
    embeds: [embed],
    components,
    content: null,
  });
}

async function handleToggle(interaction) {
  const eventType = interaction.customId.replace('log_dash_toggle:', '');

  if (!eventType) {
    return interaction.reply({
      content: '❌ Недопустимый тип события.',
      ephemeral: true,
    });
  }

  const status = await getLoggingStatus(
    interaction.client,
    interaction.guildId
  );

  const onCategoriesView = isCategoriesView(interaction);

  if (eventType === 'audit_enabled') {
    await setLoggingEnabled(
      interaction.client,
      interaction.guildId,
      !Boolean(status.enabled)
    );
  } else if (eventType === 'all') {
    const newState = !Object.values(status.enabledEvents)
      .every((v) => v !== false);

    const allTypes = Object.values(EVENT_TYPES);
    const categoryTypes = LOGGING_CATEGORIES.map((c) => `${c}.*`);

    await toggleEventLogging(
      interaction.client,
      interaction.guildId,
      [...allTypes, ...categoryTypes],
      newState
    );
  } else {
    const currentState = status.enabledEvents[eventType] !== false;

    await toggleEventLogging(
      interaction.client,
      interaction.guildId,
      eventType,
      !currentState
    );
  }

  if (
    onCategoriesView ||
    (eventType !== 'audit_enabled' && eventType.includes('.*'))
  ) {
    const { embed, components } = await buildLoggingCategoriesView(
      interaction,
      interaction.client
    );

    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  const { embed, components } = await buildLoggingDashboardView(
    interaction,
    interaction.client
  );

  await interaction.update({
    embeds: [embed],
    components,
    content: null,
  });
}

async function handleAddFilterModal(interaction) {
  const filterType = interaction.customId.replace(
    'log_dash_add_filter:',
    ''
  );

  if (filterType !== 'user' && filterType !== 'channel') {
    return interaction.reply({
      content: '❌ Недопустимый тип фильтра.',
      ephemeral: true,
    });
  }

  const modalCustomId = `log_dash_filter_modal:add:${filterType}`;

  let modal;

  if (filterType === 'user') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('ignore_user')
      .setPlaceholder('Выберите пользователя, которого нужно игнорировать…')
      .setMinValues(1)
      .setMaxValues(1);

    const userLabel = new LabelBuilder()
      .setLabel('Пользователь для игнорирования')
      .setDescription(
        'Выберите пользователя, действия которого не должны записываться в журнал'
      )
      .setUserSelectMenuComponent(userSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Добавить фильтр пользователя')
      .addLabelComponents(userLabel);
  } else {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('ignore_channel')
      .setPlaceholder('Выберите канал, который нужно игнорировать…')
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice
      );

    const channelLabel = new LabelBuilder()
      .setLabel('Канал для игнорирования')
      .setDescription(
        'Выберите канал, события которого не должны записываться в журнал'
      )
      .setChannelSelectMenuComponent(channelSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Добавить фильтр канала')
      .addLabelComponents(channelLabel);
  }

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === modalCustomId,
    });

    let id;

    if (filterType === 'user') {
      id = modalSubmission.fields
        .getField('ignore_user')
        ?.values?.[0];
    } else {
      id = modalSubmission.fields
        .getField('ignore_channel')
        ?.values?.[0];
    }

    if (!id) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: `Пожалуйста, выберите ${filterType === 'user' ? 'пользователя' : 'канал'}, которого нужно игнорировать.`,
      });
    }

    await updateIgnoreList(
      interaction.client,
      interaction.guildId,
      {
        action: 'add',
        type: filterType,
        id,
      }
    );

    await modalSubmission.reply({
      embeds: [
        successEmbed(
          'Фильтр добавлен',
          `${filterType === 'user' ? 'Пользователь' : 'Канал'} \`${id}\` теперь будет игнорироваться в журнале аудита.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(
        interaction,
        interaction.client
      );
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }

    logger.error('Error in add filter modal:', error);
  }
}

async function handleRemoveFilterModal(interaction) {
  const config = await getGuildConfig(
    interaction.client,
    interaction.guildId
  );

  const ignore = getIgnoreList(config);
  const options = [];

  for (const userId of ignore.users || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Пользователь ${userId}`)
        .setDescription('Удалить этого пользователя из списка игнорирования')
        .setValue(`user:${userId}`)
    );
  }

  for (const channelId of ignore.channels || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Канал ${channelId}`)
        .setDescription('Удалить этот канал из списка игнорирования')
        .setValue(`channel:${channelId}`)
    );
  }

  if (options.length === 0) {
    return replyUserError(interaction, {
      type: ErrorTypes.USER_INPUT,
      message: 'Нет фильтров игнорирования, которые можно удалить.',
    });
  }

  const modalCustomId = 'log_dash_filter_modal:remove';

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('filter_entry')
    .setPlaceholder('Выберите фильтр для удаления…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const filterLabel = new LabelBuilder()
    .setLabel('Фильтр для удаления')
    .setDescription(
      'Выберите пользователя или канал, который нужно перестать игнорировать'
    )
    .setStringSelectMenuComponent(filterSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Удалить фильтр игнорирования')
    .addLabelComponents(filterLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === modalCustomId,
    });

    const entry = modalSubmission.fields
      .getField('filter_entry')
      ?.values?.[0];

    if (!entry) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: 'Пожалуйста, выберите фильтр для удаления.',
      });
    }

    const [type, id] = entry.split(':');

    await updateIgnoreList(
      interaction.client,
      interaction.guildId,
      {
        action: 'remove',
        type,
        id,
      }
    );

    await modalSubmission.reply({
      embeds: [
        successEmbed(
          'Фильтр удалён',
          `${type === 'user' ? 'Пользователь' : 'Канал'} \`${id}\` удалён из списка игнорирования.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(
        interaction,
        interaction.client
      );
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }

    logger.error('Error in remove filter modal:', error);
  }
}

async function showChannelModal(interaction, destination) {
  const label = DESTINATION_LABELS[destination] || destination;
  const modalCustomId = `log_dash_channel_modal:${destination}`;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('log_channel')
    .setPlaceholder('Выберите текстовый канал…')
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    )
    .setRequired(true);

  const channelLabel = new LabelBuilder()
    .setLabel(`Канал для ${label}`)
    .setDescription(
      `Канал, в который будут отправляться логи категории «${label.toLowerCase()}»`
    )
    .setChannelSelectMenuComponent(channelSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Настроить канал: ${label}`)
    .addLabelComponents(channelLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === modalCustomId,
    });

    const channelId = modalSubmission.fields
      .getField('log_channel')
      .values[0];

    const channel =
      interaction.guild.channels.cache.get(channelId) ??
      await interaction.guild.channels
        .fetch(channelId)
        .catch(() => null);

    if (!channel) {
      return modalSubmission.reply({
        content: '❌ Этот канал не удалось найти.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPerms = channel.permissionsFor(
      interaction.guild.members.me
    );

    if (!botPerms?.has([
      'ViewChannel',
      'SendMessages',
      'EmbedLinks',
    ])) {
      return modalSubmission.reply({
        content: '❌ Мне необходимы права «Просмотр канала», «Отправка сообщений» и «Встраивание ссылок» в этом канале.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await setLogChannel(
      interaction.client,
      interaction.guildId,
      destination,
      channel.id
    );

    await modalSubmission.reply({
      embeds: [
        successEmbed(
          'Канал обновлён',
          `Логи категории **${label}** будут отправляться в ${channel}.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    await refreshDashboardMessage(
      interaction,
      interaction.client
    );
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }

    await handleInteractionError(interaction, error, {
      type: 'modal',
      customId: interaction.customId,
      handler: 'logging_channel',
    });
  }
}

export async function handleLoggingMenuSelect(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ Для использования этой функции необходимо право **Управление сервером**.',
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (value.startsWith('set:')) {
    const destination = value.replace('set:', '');
    return showChannelModal(interaction, destination);
  }

  if (value.startsWith('clear:')) {
    const destination = value.replace('clear:', '');

    await setLogChannel(
      interaction.client,
      interaction.guildId,
      destination,
      null
    );

    const { embed, components } = await buildLoggingDashboardView(
      interaction,
      interaction.client
    );

    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (value === 'view:categories') {
    const { embed, components } = await buildLoggingCategoriesView(
      interaction,
      interaction.client
    );

    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (value === 'view:filters') {
    const { embed, components } = await buildLoggingFilterView(
      interaction,
      interaction.client
    );

    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  return interaction.reply({
    content: '❌ Неизвестная опция.',
    ephemeral: true,
  });
}
