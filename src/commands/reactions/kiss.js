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

// Папка с GIF:
// assets/reactions/kiss/
const gifsPath = path.join(
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
            // Проверяем существование папки
            if (!fs.existsSync(gifsPath)) {
                return interaction.reply({
                    content: '❌ Папка с GIF для /kiss не найдена.',
                    ephemeral: true
                });
            }

            // Получаем все GIF
            const gifs = fs
                .readdirSync(gifsPath)
                .filter(file => file.toLowerCase().endsWith('.gif'));

            // Проверяем наличие GIF
            if (gifs.length === 0) {
                return interaction.reply({
                    content: '❌ В папке с GIF для /kiss нет ни одного файла.',
                    ephemeral: true
                });
            }

            // Выбираем случайный GIF
            const randomGif = randomItem(gifs);
            const gifPath = path.join(gifsPath, randomGif);

            // Выбираем случайное сообщение
            let messageList;

            if (target.id === interaction.user.id) {
                messageList = selfMessages;
            } else if (target.bot) {
                messageList = botMessages;
            } else {
                messageList = normalMessages;
            }

            const message = formatMessage(
                randomItem(messageList),
                interaction.user,
                target
            );

            // Прикрепляем GIF
            const attachment = new AttachmentBuilder(gifPath, {
                name: 'kiss.gif'
            });

            // Создаём Embed
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
