// Переведённый файл: /crime

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const JAIL_TIME = 2 * 60 * 60 * 1000;
const FINE_RATE = 0.2;

const CRIME_TYPES = [
    { name: "Карманная кража", min: 100, max: 500, risk: 0.3 },
    { name: "Ограбление дома", min: 300, max: 1000, risk: 0.4 },
    { name: "Ограбление банка", min: 1000, max: 5000, risk: 0.6 },
    { name: "Кража произведения искусства", min: 2000, max: 10000, risk: 0.7 },
    { name: "Киберпреступление", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Совершить преступление и заработать деньги (рискованно)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Тип преступления')
                .setRequired(true)
                .addChoices(
                    { name: 'Карманная кража', value: 'pickpocketing' },
                    { name: 'Ограбление дома', value: 'burglary' },
                    { name: 'Ограбление банка', value: 'bank-heist' },
                    { name: 'Кража произведения искусства', value: 'art-theft' },
                    { name: 'Киберпреступление', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastCrime = userData.cooldowns?.crime || 0;
        const isJailed = userData.jailedUntil && userData.jailedUntil > now;

        if (isJailed) {
            const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));

            throw createError(
                "Пользователь находится в тюрьме",
                ErrorTypes.RATE_LIMIT,
                `Вы находитесь в тюрьме ещё **${timeLeft} мин.**!`,
                { jailTimeRemaining: userData.jailedUntil - now }
            );
        }

        if (now < lastCrime + CRIME_COOLDOWN) {
            const timeLeft = Math.ceil(
                (lastCrime + CRIME_COOLDOWN - now) / (1000 * 60)
            );

            throw createError(
                "Кулдаун преступления активен",
                ErrorTypes.RATE_LIMIT,
                `Вам нужно подождать ещё **${timeLeft} мин.**, прежде чем совершать следующее преступление.`,
                {
                    remaining: lastCrime + CRIME_COOLDOWN - now,
                    cooldownType: 'crime'
                }
            );
        }

        const crimeType = interaction.options.getString("type").toLowerCase();

        const crime = CRIME_TYPES.find(
            c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
        );

        if (!crime) {
            throw createError(
                "Недопустимый тип преступления",
                ErrorTypes.VALIDATION,
                "Пожалуйста, выберите допустимый тип преступления.",
                { crimeType }
            );
        }

        const isSuccess = Math.random() > crime.risk;

        const amountEarned = isSuccess
            ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
            : 0;

        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.crime = now;

        if (isSuccess) {
            userData.wallet = (userData.wallet || 0) + amountEarned;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "🕵️ Преступление удалось!",
                `Вы успешно совершили преступление **${crime.name}** и заработали **${amountEarned}** монет!`
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        } else {
            // Штраф рассчитывается исходя из потенциальной добычи при попытке преступления.
            const potentialHaul = Math.floor((crime.min + crime.max) / 2);
            const fine = Math.min(
                Math.floor(potentialHaul * FINE_RATE),
                userData.wallet || 0
            );

            userData.wallet = Math.max(
                0,
                (userData.wallet || 0) - fine
            );

            userData.jailedUntil = now + JAIL_TIME;

            await setEconomyData(client, guildId, userId, userData);

            const embed = warningEmbed(
                "🚔 Преступление провалено!",
                `Вас поймали во время попытки совершить преступление **${crime.name}** и отправили в тюрьму! ` +
                `Вы заплатили штраф **${fine.toLocaleString()}** монет и проведёте в тюрьме **2 часа**.`
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }
    }, { command: 'crime' })
};
