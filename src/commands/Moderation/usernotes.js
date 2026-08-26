import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb, getUserNotesKey, getUserNotesListKey } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Управление заметками пользователей для модерации")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Добавить заметку пользователю")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Пользователь, которому нужно добавить заметку")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Текст заметки")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Тип заметки")
                        .addChoices(
                            { name: "Предупреждение", value: "warning" },
                            { name: "Положительная", value: "positive" },
                            { name: "Нейтральная", value: "neutral" },
                            { name: "Оповещение", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Просмотреть заметки пользователя")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Пользователь, чьи заметки нужно просмотреть")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Удалить определённую заметку пользователя")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Пользователь, у которого нужно удалить заметку")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("Номер заметки, которую нужно удалить")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Удалить все заметки пользователя")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Пользователь, чьи заметки нужно удалить")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Выберите действительную подкоманду.'
            });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Выберите действительную подкоманду.'
                    });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Произошла ошибка при обработке запроса. Попробуйте ещё раз позже.'
            });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Заметка не должна превышать 1000 символов.'
        });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Заметка не может быть пустой.'
        });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Заметка добавлена`,
                `Добавлена **${type}**-заметка для **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**Модератор:** ${interaction.user.tag}\n` +
                `**Всего заметок:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Нет заметок",
                    `Для пользователя **${targetUser.tag}** нет заметок.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Заметки пользователя ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Заметка №${index + 1}** (${note.type}) — ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Добавил: ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(сокращено)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Заметки пользователя (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `Укажите действительный номер заметки (1-${notes.length}).`
        });
    }

    // Команда просмотра отображает заметки от новых к старым,
    // поэтому используем тот же порядок при удалении заметки.
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const removedNote = sortedNotes[index];
    const originalIndex = notes.indexOf(removedNote);
    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Заметка удалена`,
                `Удалена заметка №${index + 1} пользователя **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Осталось заметок:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Нет заметок для удаления",
                    `У пользователя **${targetUser.tag}** нет заметок для удаления.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Заметки удалены",
                `Удалено **${noteCount}** заметок пользователя **${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}
