import { SlashCommandBuilder } from 'discord.js';

import {
    successEmbed,
} from '../../utils/embeds.js';

import {
    getEconomyData,
    setEconomyData,
} from '../../utils/economy.js';

import {
    withErrorHandling,
    createError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import {
    logger,
} from '../../utils/logger.js';

import {
    InteractionHelper,
} from '../../utils/interactionHelper.js';

import {
    botConfig,
} from '../../config/bot.js';

import {
    processEconomyAchievementEvent,
} from '../../services/achievements/achievementEvents.js';


const WORK_COOLDOWN =
    botConfig.economy?.cooldowns?.work ??
    30 * 60 * 1000;

const MIN_WORK_AMOUNT =
    botConfig.economy?.workMin ??
    10;

const MAX_WORK_AMOUNT =
    botConfig.economy?.workMax ??
    100;

const LAPTOP_MULTIPLIER =
    1.5;


const WORK_JOBS = [
    'Разработчик программного обеспечения',
    'Бариста',
    'Уборщик',
    'Ютубер',
    'Разработчик Discord-ботов',
    'Кассир',
    'Курьер пиццы',
    'Библиотекарь',
    'Садовник',
    'Аналитик данных',
];


export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription(
            'Поработать и заработать немного денег'
        ),

    execute: withErrorHandling(
        async (
            interaction,
            config,
            client
        ) => {
            const deferred =
                await InteractionHelper.safeDefer(
                    interaction
                );

            if (!deferred) {
                return;
            }

            const userId =
                interaction.user.id;

            const guildId =
                interaction.guildId;

            const now =
                Date.now();

            const userData =
                await getEconomyData(
                    client,
                    guildId,
                    userId
                );

            if (!userData) {
                throw createError(
                    'Не удалось загрузить данные экономики для работы',
                    ErrorTypes.DATABASE,
                    'Не удалось загрузить ваши данные экономики. Попробуйте позже.',
                    {
                        userId,
                        guildId,
                    }
                );
            }

            logger.debug(
                `[ECONOMY] Команда Work запущена для ${userId}`,
                {
                    userId,
                    guildId,
                }
            );

            const lastWork =
                userData.lastWork || 0;

            const inventory =
                userData.inventory || {};

            const extraWorkShifts =
                inventory['extra_work'] || 0;

            const hasLaptop =
                inventory['laptop'] || 0;

            /*
             * ==================================================
             * COOLDOWN
             * ==================================================
             */

            const cooldownActive =
                now <
                lastWork +
                WORK_COOLDOWN;

            let usedConsumable =
                false;

            if (cooldownActive) {
                if (
                    extraWorkShifts > 0
                ) {
                    inventory['extra_work'] =
                        extraWorkShifts - 1;

                    usedConsumable =
                        true;
                } else {
                    const remaining =
                        lastWork +
                        WORK_COOLDOWN -
                        now;

                    throw createError(
                        'Кулдаун работы активен',
                        ErrorTypes.RATE_LIMIT,
                        `Вы работаете слишком быстро! Подождите **${Math.floor(remaining / 3600000)}ч ${Math.floor((remaining % 3600000) / 60000)}м** перед следующей работой.`,
                        {
                            timeRemaining:
                                remaining,

                            cooldownType:
                                'work',
                        }
                    );
                }
            }

            /*
             * ==================================================
             * REWARD
             * ==================================================
             */

            let earned =
                Math.floor(
                    Math.random() *
                    (
                        MAX_WORK_AMOUNT -
                        MIN_WORK_AMOUNT +
                        1
                    )
                ) +
                MIN_WORK_AMOUNT;

            const job =
                WORK_JOBS[
                    Math.floor(
                        Math.random() *
                        WORK_JOBS.length
                    )
                ];

            let multiplierMessage =
                '';

            /*
             * ==================================================
             * LAPTOP BONUS
             * ==================================================
             */

            if (
                hasLaptop > 0
            ) {
                earned =
                    Math.floor(
                        earned *
                        LAPTOP_MULTIPLIER
                    );

                multiplierMessage =
                    '\n💻 **Бонус ноутбука:** +50% к заработку!';
            }

            /*
             * ==================================================
             * UPDATE ECONOMY
             * ==================================================
             */

            userData.wallet =
                (userData.wallet || 0) +
                earned;

            userData.lastWork =
                now;

            /*
             * Сохраняем изменённый инвентарь,
             * если был использован extra_work.
             */

            userData.inventory =
                inventory;

            await setEconomyData(
                client,
                guildId,
                userId,
                userData
            );

            logger.info(
                `[ECONOMY_TRANSACTION] Работа завершена`,
                {
                    userId,
                    guildId,
                    amount: earned,
                    job,
                    usedConsumable,
                    hasLaptop:
                        hasLaptop > 0,
                    newWallet:
                        userData.wallet,
                    timestamp:
                        new Date().toISOString(),
                }
            );

            /*
             * ==================================================
             * ACHIEVEMENTS
             * ==================================================
             *
             * Проверяем достижения ПОСЛЕ сохранения
             * нового баланса.
             *
             * Например:
             *
             * 1000 монет
             * 10000 монет
             * 100000 монет
             * 1000000 монет
             *
             * будут обнаружены сразу после /work.
             */

            await processEconomyAchievementEvent({
                client,

                guild:
                    interaction.guild,

                userId,

                channel:
                    interaction.channel,
            });

            /*
             * ==================================================
             * RESPONSE
             * ==================================================
             */

            const embed =
                successEmbed(
                    '💼 Работа завершена!',
                    `Вы работали в качестве **${job}** и заработали **$${earned.toLocaleString()}**!${multiplierMessage}`
                )
                    .addFields(
                        {
                            name:
                                'Новый баланс',

                            value:
                                `$${userData.wallet.toLocaleString()}`,

                            inline:
                                true,
                        },

                        {
                            name:
                                'Следующая работа',

                            value:
                                `<t:${Math.floor((now + WORK_COOLDOWN) / 1000)}:R>`,

                            inline:
                                true,
                        }
                    )

                    .setFooter({
                        text:
                            `Запросил: ${interaction.user.tag}`,

                        iconURL:
                            interaction.user.displayAvatarURL(),
                    });

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        embed,
                    ],
                }
            );
        },
        {
            command:
                'work',
        }
    ),
};
