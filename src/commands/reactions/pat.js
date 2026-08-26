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

const reactionsPath = path.join(
    __dirname,
    '../../../assets/reactions/pat'
);

// ============================================================
// СООБЩЕНИЯ
// ============================================================

const normalMessages = [
    '🥰 {author} нежно погладил(а) {target} по голове!',
    '🫳 {author} ласково погладил(а) {target} по голове.',
    '💕 {author} потрепал(а) {target} по голове.',
    '🥺 {author} решил(а) немного приласкать {target}.',
    '🫳 {author} погладил(а) {target} по голове. Хороший {target}! 💕',
    '🥰 {author} нежно потрепал(а) {target} по волосам.',
    '💗 {author} подарил(а) {target} немного заботы.',
    '🫳 {author} погладил(а) {target}. Кто тут хороший?',
    '🌸 {author} ласково провёл(а) рукой по голове {target}.',
    '🥰 {author} решил(а), что {target} сегодня заслужил(а) немного ласки.'
];

const selfMessages = [
    '🫳 {author} погладил(а) себя по голове. Молодец! 😌',
    '🥰 {author} решил(а) немного себя похвалить.',
    '🫳 {author} погладил(а) себя по голове. Сам себе лучший друг!',
    '💕 {author} подарил(а) себе немного нежности.',
    '😂 {author} погладил(а) себя. Когда больше некому — приходится самому!',
    '🥺 {author} решил(а), что тоже заслуживает ласки.',
    '🫳 *погладил(а) себя по голове* — {author} явно знает, как себя поддержать.',
    '🥰 {author}: «Хороший мальчик/девочка». *гладит себя по голове*',
    '💗 {author} активировал(а) режим самозаботы!',
    '😌 {author} получил(а) заслуженное поглаживание от самого себя.'
];

const botMessages = [
    '🫳 {author} погладил(а) {target} по голове! 🤖💕',
    '🥰 {author} нежно погладил(а) {target}. Кажется, бот немного смутился.',
    '🫳 {author} потрепал(а) {target} по голове! 😳 Бот пытается не показывать эмоции.',
    '🤖💕 {target} получил(а) поглаживание и явно не знает, как на это реагировать.',

    '😳 «Эй! Я вообще-то не домашний питомец!» — возмутился(ась) {target}, но не отстранился(ась).',
    '😤 «Я не нуждаюсь в твоих поглаживаниях!» — заявил(а) {target}, заметно покраснев.',
    '😳 «Н-не думай, что мне это нравится!» — пробормотал(а) {target}, пока {author} продолжал(а) гладить его(её).',
    '😤 {target}: «Хватит меня гладить!» ...через секунду: «...можешь ещё немного.»',

    '🥰 {author} погладил(а) {target} по голове. 🤖 *система обнаружила неизвестное чувство: комфорт*',
    '🫳 {author} погладил(а) {target}! 🤖 Ошибка: уровень милоты превышен.',
    '😳 {target} покраснел(а) от поглаживания и сделал(а) вид, что ничего не произошло.',
    '🤖 *{target} тихо мурлычет...* 😳 «Я ничего не говорил(а)!»',

    '😤 «Это только потому, что ты попросил(а)!» — сказал(а) {target}, явно наслаждаясь поглаживанием.',
    '💕 {author} погладил(а) {target}. Кажется, бот уже ждёт следующего поглаживания.',
    '😳 «Только не прекращай так внезапно...» — тихо сказал(а) {target}.'
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
        .setName('pat')
        .setDescription('Погладить пользователя по голове')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которого вы хотите погладить')
                .setRequired(true)
        ),

    category: 'Реакции',

    async execute(interaction) {
        const target = interaction.options.getUser('user');

        try {
            let gifsFolder;
            let messageList;

            if (target.id === interaction.user.id) {
                gifsFolder = path.join(
                    reactionsPath,
                    'self'
                );

                messageList = selfMessages;

            } else if (target.bot) {
                gifsFolder = path.join(
                    reactionsPath,
                    'bot'
                );

                messageList = botMessages;

            } else {
                gifsFolder = path.join(
                    reactionsPath,
                    'user'
                );

                messageList = normalMessages;
            }

            const gifs = getGifs(gifsFolder);

            if (gifs.length === 0) {
                return interaction.reply({
                    content: '❌ Для этой реакции пока нет GIF.',
                    ephemeral: true
                });
            }

            const randomGif = randomItem(gifs);

            const gifPath = path.join(
                gifsFolder,
                randomGif
            );

            const message = formatMessage(
                randomItem(messageList),
                interaction.user,
                target
            );

            const attachment = new AttachmentBuilder(
                gifPath,
                {
                    name: 'pat.gif'
                }
            );

            const embed = new EmbedBuilder()
                .setColor(0xffb6d9)
                .setDescription(message)
                .setImage('attachment://pat.gif');

            await interaction.reply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('[PAT] Ошибка:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Не удалось выполнить реакцию /pat.',
                    ephemeral: true
                });
            }
        }
    }
};
