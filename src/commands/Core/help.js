import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

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

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Все команды",
            description: "Просмотреть все доступные команды одним списком",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `Просмотреть команды категории ${categoryName}`,
                value: category,
            };
        }),
    ];

const botName = client?.user?.username || "Бот";

const embed = createEmbed({
    title: `📖 ${botName} — Справка`,
    description:
        `Добро пожаловать в меню помощи **${botName}**!\n\n` +
        `Здесь вы можете найти доступные команды и узнать, как пользоваться функциями бота. ` +
        `Выберите нужную категорию в меню ниже.`,
    color: 'primary',
    thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),

    fields: [
        {
            name: '📚 Доступные разделы',
            value: [
                '💰 **Экономика** — баланс, заработок, магазин, ограбления и другие денежные команды.',
                '🎮 **Развлечения** — игры, случайные события и другие развлекательные команды.',
                '🛡️ **Модерация** — управление сервером и инструменты для модераторов.',
                '⚙️ **Настройки** — настройка функций и параметров бота.',
                '👤 **Профиль** — информация о пользователе, статистика и достижения.',
            ].join('\n'),
            inline: false,
        },

        {
            name: '❓ Как пользоваться?',
            value: [
                '• Выберите категорию в меню ниже.',
                '• Найдите нужную команду.',
                '• Используйте её прямо в Discord.',
                '• Если команда требует дополнительных параметров, они будут указаны в её описании.',
            ].join('\n'),
            inline: false,
        },

        {
            name: '💡 Полезно знать',
            value:
                'Если вы не знаете, какую команду использовать, просто выберите подходящую категорию в меню. ' +
                'Здесь собраны все основные возможности бота.',
            inline: false,
        },

        {
            name: '\u200B',
            value: `-# ${botName} • Используйте меню ниже, чтобы начать`,
            inline: false,
        },
    ],
});


    embed.setFooter({ 
        text: "Сделано с ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Сообщить об ошибке")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Сервер поддержки")
        .setURL("https://discord.gg/vzQjbUj4N")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Выберите раздел для просмотра команд",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Показывает меню помощи со всеми доступными командами"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                const closedEmbed = createEmbed({
                    title: "Меню помощи закрыто",
                    description: "Меню помощи было закрыто. Используйте /help снова.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                logger.debug('Help menu close edit failed (interaction may have expired):', error?.message);
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};
