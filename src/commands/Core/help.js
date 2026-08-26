import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

// ==========================================
// ИКОНКИ КАТЕГОРИЙ
// ==========================================

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
};

// ==========================================
// ПЕРЕВОДЫ КАТЕГОРИЙ
// ==========================================

const CATEGORY_NAMES = {
    Core: "Основные",
    Moderation: "Модерация",
    Economy: "Экономика",
    Music: "Музыка",
    Fun: "Развлечения",
    Leveling: "Уровни",
    Utility: "Утилиты",
    Ticket: "Тикеты",
    Welcome: "Приветствие",
    Giveaway: "Розыгрыши",
    Counter: "Счётчики",
    Tools: "Инструменты",
    Search: "Поиск",
    "Reaction Roles": "Роли за реакции",
    Community: "Сообщество",
    Birthday: "День рождения",
    "Join To Create": "Создание голосовых каналов",
    Verification: "Верификация",
};

// ==========================================
// ФОРМАТИРОВАНИЕ НАЗВАНИЯ
// ==========================================

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

// ==========================================
// ПОЛУЧЕНИЕ РУССКОГО НАЗВАНИЯ
// ==========================================

function getCategoryDisplayName(category) {
    const formattedCategory = formatCategoryName(category);

    return (
        CATEGORY_NAMES[formattedCategory] ||
        formattedCategory
    );
}

// ==========================================
// СОЗДАНИЕ МЕНЮ HELP
// ==========================================

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(
        __dirname,
        "../../commands"
    );

    // Получаем папки категорий
    const categoryDirs = (
        await fs.readdir(commandsPath, {
            withFileTypes: true
        })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    // ==========================================
    // СОЗДАЁМ ПУНКТЫ МЕНЮ
    // ==========================================

    const options = [
        {
            label: "📋 Все команды",
            description:
                "Просмотреть все доступные команды одним списком",
            value: ALL_COMMANDS_ID,
        },

        ...categoryDirs.map((category) => {
            // Оригинальное название категории
            const categoryName =
                formatCategoryName(category);

            // Русское название для отображения
            const displayName =
                getCategoryDisplayName(category);

            // Иконка
            const icon =
                CATEGORY_ICONS[categoryName] || "🔍";

            return {
                // Показываем пользователю русский вариант
                label: `${icon} ${displayName}`,

                description:
                    `Просмотреть команды категории ${displayName}`,

                // ВАЖНО:
                // Оставляем оригинальное значение!
                // Оно используется внутри логики бота.
                value: category,
            };
        }),
    ];

    // ==========================================
    // EMBED
    // ==========================================

    const botName =
        client?.user?.username || "Бот";

    const embed = createEmbed({
        title: `📖 ${botName} — Справка`,

        description:
            `Добро пожаловать в меню помощи **${botName}**!\n\n` +
            `Здесь вы можете найти доступные команды ` +
            `и узнать, как пользоваться функциями бота.\n` +
            `Выберите нужный раздел в меню ниже.`,

        color: "primary",

        thumbnail:
            client.user?.displayAvatarURL?.({
                size: 1024
            }),

        fields: [
            {
                name: "📚 Разделы команд",

                value: [
                    "💰 **Экономика** — баланс, заработок, магазин, ограбления и другие денежные команды.",
                    "🎮 **Развлечения** — игры и другие развлекательные команды.",
                    "🛡️ **Модерация** — управление сервером и инструменты модерации.",
                    "🎵 **Музыка** — команды для работы с музыкой.",
                    "👥 **Сообщество** — социальные функции и взаимодействие с участниками.",
                    "👤 **Профиль** — информация о пользователе и его статистика.",
                ].join("\n"),

                inline: false,
            },

            {
                name: "❓ Как пользоваться?",

                value: [
                    "• Выберите нужный раздел в меню ниже.",
                    "• Найдите необходимую команду.",
                    "• Используйте её прямо в Discord.",
                    "• Дополнительные параметры команды будут указаны в её описании.",
                ].join("\n"),

                inline: false,
            },

            {
                name: "💡 Полезно знать",

                value:
                    "Не знаете, какую команду использовать? " +
                    "Выберите подходящий раздел — там будут показаны все команды этой категории.",

                inline: false,
            },

            {
                name: "\u200B",

                value:
                    `-# ${botName} • Выберите раздел ниже, чтобы начать`,

                inline: false,
            },
        ],
    });

    // ==========================================
    // FOOTER
    // ==========================================

    embed.setFooter({
        text: "Сделано с ❤️"
    });

    embed.setTimestamp();

    // ==========================================
    // КНОПКА ОШИБКИ
    // ==========================================

    const bugReportButton =
        new ButtonBuilder()
            .setCustomId(BUG_REPORT_BUTTON_ID)
            .setLabel("Сообщить об ошибке")
            .setStyle(ButtonStyle.Danger);

    // ==========================================
    // КНОПКА СЕРВЕРА ПОДДЕРЖКИ
    // ==========================================

    const supportButton =
        new ButtonBuilder()
            .setLabel("Сервер поддержки")
            .setURL("https://discord.gg/vzQjbUj4N")
            .setStyle(ButtonStyle.Link);

    // ==========================================
    // SELECT MENU
    // ==========================================

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Выберите раздел для просмотра команд",
        options
    );

    // ==========================================
    // BUTTON ROW
    // ==========================================

    const buttonRow =
        new ActionRowBuilder()
            .addComponents([
                bugReportButton,
                supportButton,
            ]);

    return {
        embeds: [embed],
        components: [
            buttonRow,
            selectRow
        ],
    };
}

// ==========================================
// /HELP
// ==========================================

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "Показывает меню помощи со всеми доступными командами"
        ),

    async execute(
        interaction,
        guildConfig,
        client
    ) {
        await InteractionHelper.safeDefer(
            interaction
        );

        const {
            embeds,
            components
        } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds,
                components,
            }
        );

        // ==========================================
        // ЗАКРЫТИЕ МЕНЮ ЧЕРЕЗ 5 МИНУТ
        // ==========================================

        setTimeout(async () => {
            try {
                if (
                    !InteractionHelper.isInteractionValid(
                        interaction
                    )
                ) {
                    return;
                }

                const closedEmbed =
                    createEmbed({
                        title: "📖 Меню помощи закрыто",

                        description:
                            "Меню помощи было закрыто из-за неактивности.\n\n" +
                            "Используйте **/help**, чтобы открыть его снова.",

                        color: "secondary",
                    });

                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        embeds: [
                            closedEmbed
                        ],
                        components: [],
                    }
                );

            } catch (error) {
                console.debug(
                    "Help menu close edit failed:",
                    error?.message
                );
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};
