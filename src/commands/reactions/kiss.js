import {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder
} from 'discord.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь:
// src/commands/Reactions
//        ↓
// src/commands
//        ↓
// src
//        ↓
// TitanBot
//        ↓
// assets/reactions/kiss
const gifsPath = path.join(
    __dirname,
    '../../../assets/reactions/kiss'
);

export default {
    data: new SlashCommandBuilder()
        .setName('kiss')
        .setDescription('Поцеловать пользователя')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которого вы хотите поцеловать')
                .setRequired(true)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser('user');

        // Нельзя поцеловать самого себя
        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Нельзя использовать эту команду на самом себе!',
                ephemeral: true
            });
        }

        // Нельзя использовать реакцию на бота
        if (target.bot) {
            return interaction.reply({
                content: '❌ Нельзя использовать эту команду на ботов!',
                ephemeral: true
            });
        }

        try {
            // Получаем все GIF из папки kiss
            const gifs = fs
                .readdirSync(gifsPath)
                .filter(file => file.toLowerCase().endsWith('.gif'));

            // Если GIF нет
            if (gifs.length === 0) {
                return interaction.reply({
                    content: '❌ GIF для реакции /kiss не найдены.',
                    ephemeral: true
                });
            }

            // Выбираем случайный GIF
            const randomGif =
                gifs[Math.floor(Math.random() * gifs.length)];

            const gifPath = path.join(gifsPath, randomGif);

            // Прикрепляем GIF к сообщению
            const attachment = new AttachmentBuilder(gifPath, {
                name: 'kiss.gif'
            });

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setDescription(
                    `💋 ${interaction.user} поцеловал(а) ${target}!`
                )
                .setImage('attachment://kiss.gif');

            await interaction.reply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('Ошибка при выполнении команды /kiss:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Произошла ошибка при выполнении команды.',
                    ephemeral: true
                });
            }
        }
    }
};
