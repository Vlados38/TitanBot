// constants.js

export const DEFAULT_ECONOMY_DATA = {
    wallet: 0,
    bank: 0,
    bankLevel: 0,
    xp: 0,
    level: 1,
    lastDaily: 0,
    lastWork: 0,
    lastCrime: 0,
    lastRob: 0,
    lastMine: 0,
    lastGamble: 0,
    lastFish: 0,
    dailyStreak: 0,
    lastWeekly: 0,
    lastDeposit: 0,
    lastWithdraw: 0,
    inventory: {},
    upgrades: {},
    cooldowns: {}
};

export const DEFAULT_GUILD_CONFIG = {
    enabledCommands: {},
    birthdayChannelId: null,
    premiumRoleId: null,
    modRole: null,
    adminRole: null,
    welcomeChannel: null,
    autoRole: null,
    logging: {
        enabled: false,
        channels: { audit: null, applications: null, reports: null },
        ignore: { users: [], channels: [] },
        enabledEvents: {},
    },
    verification: {
        enabled: false
    }
};

export const INTERACTION_TIMEOUTS = {
    EXPIRE: 15 * 60 * 1000,      // Время истечения: 15 минут
    DEFER_TIMEOUT: 3000,         // Таймаут отложенного ответа: 3 секунды
    REPLY_TIMEOUT: 3000          // Таймаут ответа: 3 секунды
};

export const STORAGE_LIMITS = {
    MAX_EMBED_TITLE: 256,                    // Максимальная длина заголовка Embed
    MAX_EMBED_DESCRIPTION: 4096,             // Максимальная длина описания Embed
    MAX_EMBED_FIELDS: 25,                    // Максимальное количество полей Embed
    MAX_EMBED_FIELD_NAME: 256,               // Максимальная длина названия поля Embed
    MAX_EMBED_FIELD_VALUE: 1024,             // Максимальная длина значения поля Embed
    MAX_BUTTON_LABEL: 80,                    // Максимальная длина текста кнопки
    MAX_BUTTON_CUSTOM_ID: 100,               // Максимальная длина custom ID кнопки
    MAX_SELECT_PLACEHOLDER: 150,             // Максимальная длина текста-заполнителя меню
    MAX_USER_INPUT: 2000,                    // Максимальная длина пользовательского ввода
    MAX_CUSTOM_ID_PATTERN: /^[a-zA-Z0-9_-]+$/, // Допустимые символы custom ID
    MAX_BUTTONS_PER_ROW: 5                   // Максимальное количество кнопок в строке
};

export const DEFAULTS = {
    EMPTY_ARRAY: [],       // Пустой массив
    EMPTY_OBJECT: {},      // Пустой объект
    EMPTY_STRING: '',      // Пустая строка
    ZERO: 0,               // Ноль
    FALSE: false,          // Ложное значение
    NULL: null             // Пустое значение
};

export const ERROR_DEFAULTS = {
    INVALID_INPUT: 'Предоставлены некорректные вводные данные',
    DATABASE_ERROR: 'Ошибка операции с базой данных',
    NOT_FOUND: 'Не найдено',
    INSUFFICIENT_PERMISSIONS: 'Недостаточно прав',
    INVALID_FORMAT: 'Некорректный формат'
};

export const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
};

export default {
    DEFAULT_ECONOMY_DATA,
    DEFAULT_GUILD_CONFIG,
    INTERACTION_TIMEOUTS,
    STORAGE_LIMITS,
    DEFAULTS,
    ERROR_DEFAULTS,
    TIME
};
