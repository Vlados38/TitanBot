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

// Основная папка реакции
const reactionsPath = path.join(
    __dirname,
    '../../../assets/reactions/kiss'
);

// ============================================================
// СООБЩЕНИЯ
// ============================================================

// Поцелуй другого пользователя
const normalMessages = [
    '💋 {author} поцеловал(а) {target}!',
    '💕 {author} подарил(а) {target} нежный поцелуй!',
    '🥰 {author} чмокнул(а) {target}!',
    '💋 {target} получил(а) поцелуй от {author}!',
    '❤️ {author} отправил(а) {target} воздушный поцелуй!',
    '😘 {author} решил(а), что {target} заслуживает поцелуя!',
    '💗 Кажется, {author} только что поцеловал(а) {target}!',
    '🌸 {author} нежно поцеловал(а) {target}!',
    '💕 Один поцелуй от {author} для {target}!',
    '💋 {author} внезапно чмокнул(а) {target}! 😳'
];

// Поцелуй самого себя
const selfMessages = [
    '💋 {author} поцеловал(а) себя! Ну а кто ещё достоин такой любви? 😌',
    '😘 {author} подарил(а) себе поцелуй. Вот это здоровые отношения! 😂',
    '💋 {author} решил(а) не ждать чужих поцелуев и справился(ась) самостоятельно! 😎',
    '🥰 {author} устроил(а) свидание с самым прекрасным человеком — с собой!',
    '💗 {author} поцеловал(а) себя. Взаимность гарантирована! 😂',
    '😌 {author} настолько прекрасен(на), что решил(а) не упускать возможность поцеловать себя.',
    '💋 {author} чмокнул(а) зеркало... Зеркало ответило взаимностью! 🪞💕',
    '😂 {author} поцеловал(а) себя. Самолюбование вышло на новый уровень!',
    '😘 {author} отправил(а) себе поцелуй. Надёжнее партнёра не найти!',
    '💋 {author} решил(а): «Если хочешь поцелуй — сделай это сам!»'
];

// Поцелуй бота
const botMessages = [
    '💋 {author} поцеловал(а) {target}! 😳 Кажется, бот немного смутился...',
    '😘 {author} чмокнул(а) {target}! 🤖💕 Система сообщает: уровень смущения 99%.',
    '💋 {author} подарил(а) {target} поцелуй! 😳 Бот делает вид, что ничего не произошло...',
    '💕 {author} поцеловал(а) {target}! 🤖 Ошибка: слишком много смущения!',
    '😳 {target} получил(а) поцелуй от {author} и теперь не знает, что ответить...',
    '💋 {author} поцеловал(а) {target}! 🤖💗 Внутренние системы перегружены от смущения.',
    '😘 {author} чмокнул(а) {target}! 😳 Бот на секунду забыл, как работать.',
    '💗 {author} поцеловал(а) {target}! 🤖 *краснеет пикселями*',
    '😳 {target}: «Э-э... Это было неожиданно...»',
    '💋 {author} атаковал(а) {target} поцелуем! 🤖💕 Бот капитулировал от смущения.'
];

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function formatMessage(message, author, target) {
    return message
        .replaceAll('{author}', author.toString())
        .replaceAll('{target}', target.toString());
}

function getGifs(folder) {
    if (!fs.existsSync(folder)) {
        return [];
    }

    return fs
        .readdirSync(folder)
        .filter(file => file.toLowerCase().endsWith('.gif'));
}

// ============================================================
// КОМАНДА
// ============================================================

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

        try {
            let gifsFolder;
            let messageList;

            // ================================================
            // ПОЦЕЛУЙ СЕБЯ
            // ================================================

            if (target.id === interaction.user.id) {
                gifsFolder = path.join(
                    reactionsPath,
                    'self'
                );

                messageList = selfMessages;

            // ================================================
            // ПОЦЕЛУЙ БОТА
            // ================================================

            } else if (target.bot) {
                gifsFolder = path.join(
                    reactionsPath,
                    'bot'
                );

                messageList = botMessages;

            // ================================================
            // ПОЦЕЛУЙ ПОЛЬЗОВАТЕЛЯ
            // ================================================

            } else {
                gifsFolder = path.join(
                    reactionsPath,
                    'user'
                );

                messageList = normalMessages;
            }

            // Получаем GIF из нужной папки
            const gifs = getGifs(gifsFolder);

            if (gifs.length === 0) {
                return interaction.reply({
                    content: '❌ Для этой реакции пока нет GIF.',
                    ephemeral: true
                });
            }

            // Случайный GIF
            const randomGif = randomItem(gifs);

            const gifPath = path.join(
                gifsFolder,
                randomGif
            );

            // Случайное сообщение
            const message = formatMessage(
                randomItem(messageList),
                interaction.user,
                target
            );

            // Прикрепляем GIF
            const attachment = new AttachmentBuilder(
                gifPath,
                {
                    name: 'kiss.gif'
                }
            );

            // Embed
            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setDescription(message)
                .setImage('attachment://kiss.gif');

            // Отправляем
            await interaction.reply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('[KISS] Ошибка:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Не удалось выполнить реакцию /kiss.',
                    ephemeral: true
                });
            }
        }
    }
};
