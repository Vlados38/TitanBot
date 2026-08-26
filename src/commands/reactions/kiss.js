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

    category: 'Реакции',

    async execute(interaction) {
        const target = interaction.options.getUser('user');

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Нельзя использовать эту команду на самом себе!',
                ephemeral: true
            });
        }

        if (target.bot) {
            return interaction.reply({
                content: '❌ Нельзя использовать эту команду на ботов!',
                ephemeral: true
            });
        }

        try {
            if (!fs.existsSync(gifsPath)) {
                return interaction.reply({
                    content: '❌ Папка с GIF для /kiss не найдена.',
                    ephemeral: true
                });
            }

            const gifs = fs
                .readdirSync(gifsPath)
                .filter(file => file.toLowerCase().endsWith('.gif'));

            if (gifs.length === 0) {
                return interaction.reply({
                    content: '❌ В папке с GIF для /kiss нет файлов.',
                    ephemeral: true
                });
            }

            const randomGif =
                gifs[Math.floor(Math.random() * gifs.length)];

            const gifPath = path.join(gifsPath, randomGif);

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
            console.error('[KISS] Ошибка:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Не удалось отправить GIF.',
                    ephemeral: true
                });
            }
        }
    }
};
