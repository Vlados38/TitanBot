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
    '../../../assets/reactions/hugs'
);

// ============================================================
// СООБЩЕНИЯ
// ============================================================

// Объятие другого пользователя
const normalMessages = [
    '🤗 {author} крепко обнял(а) {target}!',
    '🫂 {author} подарил(а) {target} тёплое объятие!',
    '💕 {author} обнял(а) {target}!',
    '🤗 {target} получил(а) крепкие объятия от {author}!',
    '🫂 {author} решил(а) немного прижать к себе {target}!',
    '🥰 {author} нежно обнял(а) {target}!',
    '💗 {author} окружил(а) {target} заботой и объятиями!',
    '🤗 Инициировано объятие: {author} → {target}',
    '🫂 {author} внезапно набросился(ась) на {target} с объятиями!',
    '💕 {author} не смог(ла) устоять и крепко обнял(а) {target}!'
];

// Объятие самого себя
const selfMessages = [
    '🫂 {author} обнял(а) себя. Иногда лучшая компания — это ты сам! 😌',
    '🤗 {author} подарил(а) себе тёплое объятие. Самоподдержка активирована! 💕',
    '🫂 {author} решил(а), что ждать чужих объятий слишком долго!',
    '🥰 {author} обнял(а) себя. Вот это любовь к себе!',
    '🤗 {author} устроил(а) себе персональные объятия. Никто не отменял заботу о себе! 😌',
    '😂 {author} обнял(а) себя. Надёжнее человека всё равно не найти!',
    '🫂 {author}: «Иди сюда, красавчик(ца)». *обнимает себя*',
    '💕 {author} получил(а) объятие от самого надёжного человека — от себя!',
    '🤗 {author} включил(а) режим самосогревания!',
    '🫂 Самообъятие успешно выполнено. {author} доволен(на)! 😌'
];

// Объятие бота
const botMessages = [
    '🫂 {author} обнял(а) {target}! 😳 Бот явно не ожидал такого...',
    '🤗 {author} крепко обнял(а) {target}! 🤖💕 Система сообщает: уровень смущения повышается.',
    '🫂 {author} подарил(а) {target} объятие! 😳 Бот пытается сохранить невозмутимость...',
    '😳 {target} получил(а) объятие от {author} и слегка смутился(ась).',
    '🤖💕 {target} получил(а) объятие от {author} и теперь немного смущён.',
    '🫂 {author} обнял(а) {target}! 🤖 Ошибка: слишком много тепла!',
    '😤 «Я вообще-то не просил(а) меня обнимать!» — буркнул(а) {target}, не отпуская {author}.',
    '😳 «Ч-что ты делаешь?! Дурак(дура)!» — пробормотал(а) {target}, краснея от объятий.',
    '😤 {target} попытался(ась) возмутиться: «Это вовсе не значит, что мне приятно!» ...но обнимать {author} не перестал(а).',
    '🤗 {author} обнял(а) {target}! 🤖💗 Внутренние системы говорят: «Это... приятно?»',
    '🫂 {author} внезапно обнял(а) {target}! 😳 Бот завис от неожиданности.',
    '🤖 *{target} краснеет пикселями* после объятий от {author}.',
    '😤 «Не думай, что я рад(а) тебя видеть!» — сказал(а) {target}, продолжая стоять в объятиях.',
    '💕 {author} обнял(а) {target}! 🤖 Система перегружена милотой.',
    '😳 «Только никому не говори, что я тебе это позволил(а)...» — прошептал(а) {target}.'
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
        .setName('hug')
        .setDescription('Обнять пользователя')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которого вы хотите обнять')
                .setRequired(true)
        ),

    category: 'Реакции',

    async execute(interaction) {
        const target = interaction.options.getUser('user');

        try {
            let gifsFolder;
            let messageList;

            // ================================================
            // ОБНЯТЬ СЕБЯ
            // ================================================

            if (target.id === interaction.user.id) {
                gifsFolder = path.join(
                    reactionsPath,
                    'self'
                );

                messageList = selfMessages;

            // ================================================
            // ОБНЯТЬ БОТА
            // ================================================

            } else if (target.bot) {
                gifsFolder = path.join(
                    reactionsPath,
                    'bot'
                );

                messageList = botMessages;

            // ================================================
            // ОБНЯТЬ ПОЛЬЗОВАТЕЛЯ
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
                    name: 'hug.gif'
                }
            );

            // Создаём Embed
            const embed = new EmbedBuilder()
                .setColor(0xff9ecb)
                .setDescription(message)
                .setImage('attachment://hug.gif');

            // Отправляем сообщение
            await interaction.reply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('[HUG] Ошибка:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Не удалось выполнить реакцию /hug.',
                    ephemeral: true
                });
            }
        }
    }
};
