// Переведённый файл: /beg

import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Попросить небольшую сумму денег'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        let userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Не удалось загрузить данные экономики",
                ErrorTypes.DATABASE,
                "Не удалось загрузить ваши данные экономики. Попробуйте позже.",
                { userId, guildId }
            );
        }

        const lastBeg = userData.lastBeg || 0;
        const remainingTime = lastBeg + COOLDOWN - Date.now();

        if (remainingTime > 0) {
            const minutes = Math.floor(remainingTime / 60000);
            const seconds = Math.floor((remainingTime % 60000) / 1000);

            const timeMessage =
                minutes > 0 ? `${minutes} мин.` : `${seconds} сек.`;

            throw createError(
                "Кулдаун попрошайничества активен",
                ErrorTypes.RATE_LIMIT,
                `Вы устали попрошайничать! Попробуйте снова через **${timeMessage}**.`,
                { remainingTime, minutes, seconds, cooldownType: 'beg' }
            );
        }

        const success = Math.random() < SUCCESS_CHANCE;

        let replyEmbed;
        let newCash = userData.wallet;

        if (success) {
            const amountWon =
                Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

            newCash += amountWon;

            const successMessages = [
                `Добрый незнакомец бросил **$${amountWon.toLocaleString()}** в вашу кружку.`,
                `Вы заметили бесхозный кошелёк! Вы схватили **$${amountWon.toLocaleString()}** и убежали.`,
                `Кому-то стало вас жалко, и он дал вам **$${amountWon.toLocaleString()}**!`,
                `Вы нашли **$${amountWon.toLocaleString()}** под скамейкой в парке.`,
            ];

            replyEmbed = successEmbed(
                'Попрошайничество удалось',
                successMessages[
                    Math.floor(Math.random() * successMessages.length)
                ]
            );
        } else {
            const failMessages = [
                'Полиция прогнала вас. Вы ничего не получили.',
                'Кто-то крикнул: «Найди работу!» — и прошёл мимо.',
                'Белка украла последнюю монетку, которая у вас была.',
                'Вы попытались попрошайничать, но вам стало слишком стыдно, и вы сдались.',
            ];

            replyEmbed = warningEmbed(
                'Неудача',
                failMessages[Math.floor(Math.random() * failMessages.length)]
            );
        }

        userData.wallet = newCash;
        userData.lastBeg = Date.now();

        await setEconomyData(client, guildId, userId, userData);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [replyEmbed]
        });
    }, { command: 'beg' })
};
