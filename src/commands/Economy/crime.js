// Переведённый файл: /crime

import { SlashCommandBuilder } from 'discord.js';
import {
    successEmbed,
    warningEmbed
} from '../../utils/embeds.js';

import {
    getEconomyData,
    setEconomyData
} from '../../utils/economy.js';

import {
    withErrorHandling,
    createError,
    ErrorTypes
} from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000; // 1 час
const JAIL_TIME = 2 * 60 * 60 * 1000; // 2 часа
const FINE_RATE = 0.2; // 20%

// ==========================================
// ТИПЫ ПРЕСТУПЛЕНИЙ
// ==========================================

const CRIME_TYPES = [
    {
        value: 'pickpocketing',
        name: 'Карманная кража',
        min: 100,
        max: 500,
        risk: 0.3
    },
    {
        value: 'burglary',
        name: 'Ограбление дома',
        min: 300,
        max: 1000,
        risk: 0.4
    },
    {
        value: 'bank-heist',
        name: 'Ограбление банка',
        min: 1000,
        max: 5000,
        risk: 0.6
    },
    {
        value: 'art-theft',
        name: 'Кража произведения искусства',
        min: 2000,
        max: 10000,
        risk: 0.7
    },
    {
        value: 'cybercrime',
        name: 'Киберпреступление',
        min: 5000,
        max: 20000,
        risk: 0.8
    }
];

// ==========================================
// КОМАНДА
// ==========================================

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription(
            'Совершить преступление и заработать деньги (рискованно)'
        )

        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Тип преступления')
                .setRequired(true)

                .addChoices(
                    {
                        name: 'Карманная кража',
                        value: 'pickpocketing'
                    },
                    {
                        name: 'Ограбление дома',
                        value: 'burglary'
                    },
                    {
                        name: 'Ограбление банка',
                        value: 'bank-heist'
                    },
                    {
                        name: 'Кража произведения искусства',
                        value: 'art-theft'
                    },
                    {
                        name: 'Киберпреступление',
                        value: 'cybercrime'
                    }
                )
        ),

    // ==========================================
    // EXECUTE
    // ==========================================

    execute: withErrorHandling(
        async (interaction, config, client) => {

            const deferred =
                await InteractionHelper.safeDefer(interaction);

            if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            // ==========================================
            // ПОЛУЧАЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
            // ==========================================

            const userData = await getEconomyData(
                client,
                guildId,
                userId
            );

            if (!userData) {
                throw createError(
                    'Данные не найдены',
                    ErrorTypes.DATABASE,
                    'Не удалось загрузить данные вашей экономики. Попробуйте позже.',
                    {
                        userId,
                        guildId
                    }
                );
            }

            // ==========================================
            // ПРОВЕРКА ТЮРЬМЫ
            // ==========================================

            const jailedUntil =
                userData.jailedUntil || 0;

            const isJailed =
                jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil(
                    (jailedUntil - now) /
                    (1000 * 60)
                );

                throw createError(
                    'Пользователь находится в тюрьме',
                    ErrorTypes.RATE_LIMIT,
                    `🚔 Вы находитесь в тюрьме ещё **${timeLeft} мин.**!`,
                    {
                        jailTimeRemaining:
                            jailedUntil - now
                    }
                );
            }

            // ==========================================
            // ПРОВЕРКА COOLDOWN
            // ==========================================

            const lastCrime =
                userData.cooldowns?.crime || 0;

            if (
                now <
                lastCrime + CRIME_COOLDOWN
            ) {
                const timeLeft = Math.ceil(
                    (
                        lastCrime +
                        CRIME_COOLDOWN -
                        now
                    ) / (1000 * 60)
                );

                throw createError(
                    'Кулдаун преступления активен',
                    ErrorTypes.RATE_LIMIT,
                    `⏳ Вам нужно подождать ещё **${timeLeft} мин.**, прежде чем совершать следующее преступление.`,
                    {
                        remaining:
                            lastCrime +
                            CRIME_COOLDOWN -
                            now,

                        cooldownType: 'crime'
                    }
                );
            }

            // ==========================================
            // ПОЛУЧАЕМ ТИП ПРЕСТУПЛЕНИЯ
            // ==========================================

            const crimeType =
                interaction.options.getString('type');

            // ==========================================
            // ИЩЕМ ПРЕСТУПЛЕНИЕ
            // ==========================================

            const crime =
                CRIME_TYPES.find(
                    c => c.value === crimeType
                );

            if (!crime) {
                throw createError(
                    'Недопустимый тип преступления',
                    ErrorTypes.VALIDATION,
                    'Пожалуйста, выберите допустимый тип преступления.',
                    {
                        crimeType
                    }
                );
            }

            // ==========================================
            // ОПРЕДЕЛЯЕМ УСПЕХ
            // ==========================================

            /*
             * risk = вероятность провала.
             *
             * Например:
             *
             * risk 0.3 = 70% успеха
             * risk 0.4 = 60% успеха
             * risk 0.6 = 40% успеха
             * risk 0.7 = 30% успеха
             * risk 0.8 = 20% успеха
             */

            const isSuccess =
                Math.random() > crime.risk;

            // ==========================================
            // РАССЧИТЫВАЕМ ДОБЫЧУ
            // ==========================================

            const amountEarned = isSuccess
                ? Math.floor(
                    Math.random() *
                    (
                        crime.max -
                        crime.min +
                        1
                    )
                ) + crime.min
                : 0;

            // ==========================================
            // СОЗДАЁМ COOLDOWN
            // ==========================================

            userData.cooldowns =
                userData.cooldowns || {};

            userData.cooldowns.crime = now;

            // ==========================================
            // УСПЕШНОЕ ПРЕСТУПЛЕНИЕ
            // ==========================================

            if (isSuccess) {

                userData.wallet =
                    (userData.wallet || 0) +
                    amountEarned;

                await setEconomyData(
                    client,
                    guildId,
                    userId,
                    userData
                );

                const embed = successEmbed(
                    '🕵️ Преступление удалось!',
                    `Вы успешно совершили преступление **${crime.name}** и заработали **$${amountEarned.toLocaleString()}**!`
                );

                embed.addFields({
                    name: '💰 Ваш баланс',
                    value:
                        `$${userData.wallet.toLocaleString()}`,
                    inline: true
                });

                embed.setFooter({
                    text:
                        'Следующее преступление будет доступно через 1 час.'
                });

                return await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        embeds: [embed]
                    }
                );
            }

            // ==========================================
            // ПРОВАЛ ПРЕСТУПЛЕНИЯ
            // ==========================================

            const potentialHaul =
                Math.floor(
                    (crime.min + crime.max) / 2
                );

            // ==========================================
            // ШТРАФ
            // ==========================================

            const fine = Math.min(
                Math.floor(
                    potentialHaul * FINE_RATE
                ),
                userData.wallet || 0
            );

            userData.wallet =
                Math.max(
                    0,
                    (userData.wallet || 0) -
                    fine
                );

            // ==========================================
            // ОТПРАВЛЯЕМ В ТЮРЬМУ
            // ==========================================

            userData.jailedUntil =
                now + JAIL_TIME;

            // ==========================================
            // СОХРАНЯЕМ ДАННЫЕ
            // ==========================================

            await setEconomyData(
                client,
                guildId,
                userId,
                userData
            );

            // ==========================================
            // EMBED ПРОВАЛА
            // ==========================================

            const embed = warningEmbed(
                '🚔 Преступление провалено!',
                `Вас поймали во время попытки совершить преступление **${crime.name}**!\n\n` +
                `💸 Штраф: **$${fine.toLocaleString()}**\n` +
                `🔒 Тюрьма: **2 часа**\n\n` +
                `Будьте осторожнее в следующий раз!`
            );

            embed.addFields({
                name: '💰 Ваши наличные',
                value:
                    `$${userData.wallet.toLocaleString()}`,
                inline: true
            });

            embed.setFooter({
                text:
                    'Следующее преступление будет доступно через 1 час.'
            });

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [embed]
                }
            );
        },
        {
            command: 'crime'
        }
    )
};
