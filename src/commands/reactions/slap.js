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
    '../../../assets/reactions/slap'
);

// ============================================================
// ПЕРСОНАЛЬНЫЕ РЕАКЦИИ
// ============================================================

const specialReactions = {
    // ID пользователя
    '718716021497790504': {
        messages: [
            '👋 {author} попытался ответить {target} особенную пощёчину, но получил кару!',
            '💥 {author} шлепнул(а)... ну почти шлёпнул(а) {target}!'
        ],

        folder: path.join(
            reactionsPath,
            'special',
            '718716021497790504'
        )
    }
};

// ============================================================
// СООБЩЕНИЯ
// ============================================================

// Пощёчина другого пользователя
const normalMessages = [
    '👋 {author} дал(а) {target} пощёчину!',
    '💥 {author} отвесил(а) {target} звонкую пощёчину!',
    '👋 {author} шлёпнул(а) {target} по щеке!',
    '😤 {author} не выдержал(а) и дал(а) {target} пощёчину!',
    '💢 {author} решил(а) слегка проучить {target}!',
    '👋 {author} внезапно дал(а) {target} пощёчину! 😳',
    '💥 {author} атаковал(а) {target} пощёчиной!',
    '😈 {author} с размаху хлопнул(а) {target} по щеке!',
    '👋 {author}: «Получай!» — и дал(а) {target} пощёчину.',
    '💢 {author} решил(а), что {target} заслуживает пощёчины!'
];

// Пощёчина самому себе
const selfMessages = [
    '👋 {author} дал(а) себе пощёчину. Иногда нужен строгий разговор с собой.',
    '😂 {author} решил(а) сам(а) себя проучить!',
    '👋 {author} шлёпнул(а) себя по щеке. Самообслуживание на высшем уровне!',
    '😤 {author} посмотрел(а) в зеркало и решил(а): «Ты заслужил(а)!»',
    '💥 {author} получил(а) пощёчину от самого(ой) себя!',
    '😂 {author} решил(а) не ждать помощи и справился(ась) самостоятельно.',
    '👋 {author} дал(а) себе пощёчину. Конфликт исчерпан!',
    '😳 {author} только что устроил(а) драку с самим(ой) собой.',
    '💢 {author} и {author} немного не сошлись во мнениях.',
    '👋 {author}: «Надо было думать головой!» — *шлёп*'
];

// Пощёчина боту
const botMessages = [
    '👋 {author} дал(а) {target} пощёчину! 🤖 Бот задумался о смысле жизни.',
    '💥 {author} шлёпнул(а) {target}! 🤖 Система зарегистрировала критический уровень обиды.',
    '👋 {author} дал(а) {target} пощёчину! 🤖 Бот делает вид, что ему не больно.',
    '😳 {author} ударил(а) {target}! 🤖 Ошибка: эмоциональный ущерб обнаружен.',
    '💢 {author} отвесил(а) {target} пощёчину! 🤖 Память об этом событии сохранена.',
    '👋 {author} хлопнул(а) {target} по щеке! 🤖 *перезагрузка чувства собственного достоинства*',
    '💥 {author} атаковал(а) {target}! 🤖 Зафиксирована пощёчина.',
    '😤 {author} решил(а) проучить {target}! 🤖 Бот обещает запомнить это.',
    '👋 {target} получил(а) пощёчину от {author}! 🤖 «Это было необходимо?»',
    '💢 {author} шлёпнул(а) {target}! 🤖 Внутренние системы требуют сатисфакции.'
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
        .setName('slap')
        .setDescription('Дать пользователю пощёчину')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которого вы хотите шлёпнуть')
                .setRequired(true)
        ),

    category: 'Реакции',

    async execute(interaction) {
        const target = interaction.options.getUser('user');

        try {
            let gifsFolder;
            let messageList;

            // ================================================
            // ПЕРСОНАЛЬНАЯ РЕАКЦИЯ
            // ================================================

            const specialReaction = specialReactions[target.id];

            if (specialReaction) {
                gifsFolder = specialReaction.folder;
                messageList = specialReaction.messages;

            // ================================================
            // ПОЩЁЧИНА СЕБЕ
            // ================================================

            } else if (target.id === interaction.user.id) {
                gifsFolder = path.join(
                    reactionsPath,
                    'self'
                );

                messageList = selfMessages;

            // ================================================
            // ПОЩЁЧИНА БОТУ
            // ================================================

            } else if (target.bot) {
                gifsFolder = path.join(
                    reactionsPath,
                    'bot'
                );

                messageList = botMessages;

            // ================================================
            // ПОЩЁЧИНА ПОЛЬЗОВАТЕЛЮ
            // ================================================

            } else {
                gifsFolder = path.join(
                    reactionsPath,
                    'user'
                );

                messageList = normalMessages;
            }

            // Получаем GIF
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
                    name: 'slap.gif'
                }
            );

            // Embed
            const embed = new EmbedBuilder()
                .setColor(0xff4444)
                .setDescription(message)
                .setImage('attachment://slap.gif');

            // Отправляем
            await interaction.reply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('[SLAP] Ошибка:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Не удалось выполнить реакцию /slap.',
                    ephemeral: true
                });
            }
        }
    }
};
