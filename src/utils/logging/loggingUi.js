// loggingUi.js

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { EVENT_TYPES } from '../../services/loggingService.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((accumulator, eventType) => {
  const [category] = eventType.split('.');
  if (!accumulator[category]) {
    accumulator[category] = [];
  }
  accumulator[category].push(eventType);
  return accumulator;
}, {});

export const DASHBOARD_CATEGORIES = [
  'moderation',
  'message',
  'role',
  'member',
  'leveling',
  'reactionrole',
  'giveaway',
  'counter',
  'application',
  'report',
];

const DASHBOARD_CATEGORY_EMOJIS = {
  moderation: '🔨',
  message: '✉️',
  role: '🏷️',
  member: '👥',
  leveling: '📈',
  reactionrole: '🎭',
  giveaway: '🎁',
  counter: '📊',
  application: '📝',
  report: '🚨',
};

export const DASHBOARD_CATEGORY_LABELS = {
  moderation: 'Модерация',
  message: 'Сообщения',
  role: 'Роли',
  member: 'Участники',
  leveling: 'Уровни',
  reactionrole: 'Реакционные роли',
  giveaway: 'Розыгрыши',
  counter: 'Счётчики',
  application: 'Заявки',
  report: 'Жалобы',
};

function createBackButton() {
  return new ButtonBuilder()
    .setCustomId('log_dash_back')
    .setLabel('Назад к панели')
    .setStyle(ButtonStyle.Secondary);
}

function createCategoryToggleButtons(enabledEvents = {}, loggingEnabled = false) {
  const buttons = DASHBOARD_CATEGORIES.map((category) => {
    const wildcardDisabled = enabledEvents[`${category}.*`] === false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    const allEnabled = categoryEvents.length === 0
      ? true
      : categoryEvents.every((t) => enabledEvents[t] !== false);
    const isEnabled = loggingEnabled && !wildcardDisabled && allEnabled;
    const emoji = DASHBOARD_CATEGORY_EMOJIS[category] || '📌';
    const label = DASHBOARD_CATEGORY_LABELS[category] || category;

    return new ButtonBuilder()
      .setCustomId(`log_dash_toggle:${category}.*`)
      .setLabel(`${emoji} ${label}`)
      .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

export function createLoggingMainMenuSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('log_dash_menu')
      .setPlaceholder('Выберите настройку для изменения…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Установить канал журнала аудита')
          .setDescription('Модерация, сообщения, участники, роли и т. д.')
          .setValue('set:audit')
          .setEmoji('🧾'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Установить канал заявок')
          .setDescription('Новые заявки и обновления по их рассмотрению')
          .setValue('set:applications')
          .setEmoji('📝'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Установить канал жалоб')
          .setDescription('Жалобы пользователей через /report')
          .setValue('set:reports')
          .setEmoji('🚨'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Очистить канал аудита')
          .setValue('clear:audit')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Очистить канал заявок')
          .setValue('clear:applications')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Очистить канал жалоб')
          .setValue('clear:reports')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Категории событий')
          .setDescription('Выберите, какие типы событий записывать в журнал')
          .setValue('view:categories')
          .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Управление фильтрами игнорирования')
          .setDescription('Не записывать события от определённых пользователей или из определённых каналов')
          .setValue('view:filters')
          .setEmoji('🔇'),
      ),
  );
}

export function createLoggingMainActionRow(loggingEnabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('log_dash_toggle:audit_enabled')
      .setLabel('Журнал аудита')
      .setStyle(loggingEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('log_dash_refresh')
      .setLabel('Обновить')
      .setStyle(ButtonStyle.Primary),
  );
}

export function createLoggingDashboardComponents(_enabledEvents, loggingEnabled = false) {
  return [
    createLoggingMainMenuSelect(),
    createLoggingMainActionRow(loggingEnabled),
  ];
}

export function createLoggingCategoryViewComponents(enabledEvents, loggingEnabled = false) {
  const categoryRows = createCategoryToggleButtons(enabledEvents, loggingEnabled);

  const actionRow = new ActionRowBuilder().addComponents(
    createBackButton(),
    new ButtonBuilder()
      .setCustomId('log_dash_toggle:all')
      .setLabel('Переключить все категории')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('log_dash_refresh')
      .setLabel('Обновить')
      .setStyle(ButtonStyle.Primary),
  );

  return [...categoryRows, actionRow];
}

export function createLoggingFilterComponents() {
  return [
    new ActionRowBuilder().addComponents(
      createBackButton(),
      new ButtonBuilder()
        .setCustomId('log_dash_add_filter:user')
        .setLabel('Добавить фильтр пользователя')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('log_dash_add_filter:channel')
        .setLabel('Добавить фильтр канала')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('log_dash_remove_filter')
        .setLabel('Удалить фильтр')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export { EVENT_TYPES_BY_CATEGORY };
