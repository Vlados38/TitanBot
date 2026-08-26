// Переведённый файл: rob.js

import { SlashCommandBuilder } from 'discord.js';
import {
    successEmbed,
    warningEmbed,
    buildUserErrorEmbed
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
import { BotConfig } from '../../config/bot.js';

const ROB_COOLDOWN =
    BotConfig.economy?.cooldowns?.rob ?? 4 * 60 * 60 * 1000;

const BASE_ROB_SUCCESS_CHANCE =
    BotConfig.economy?.robSuccessRate ?? 0.4;

const ROB_PERCENTAGE = 0.15;
const FINE_PERCENTAGE = 0.1;

// ==========================================
// ID ПОЛЬЗОВАТЕЛЯ, КОТОРОГО НЕЛЬЗЯ ОГРАБИТЬ
// ==========================================

const PROTECTED_USER_ID = '123456789012345678';

// ==========================================

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription(
            'Попытаться ограбить другого пользователя (очень рискованно)'
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которого нужно ограбить')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred =
            await InteractionHelper.safeDefer(interaction);

        if (!deferred) return;

        const robberId = interaction.user.id;
        const victimUser = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        const now = Date.now();

        // ==========================================
        // НЕЛЬЗЯ ОГРАБИТЬ СЕБЯ
        // ==========================================

        if (robberId === victimUser.id) {
            throw createError(
                'Нельзя ограбить себя',
                ErrorTypes.VALIDATION,
                'Вы не можете ограбить самого себя.',
                {
                    robberId,
                    victimId: victimUser.id
                }
            );
        }

        // ==========================================
        // НЕЛЬЗЯ ОГРАБИТЬ БОТА
        // ==========================================

        if (victimUser.bot) {
            throw createError(
                'Нельзя ограбить бота',
                ErrorTypes.VALIDATION,
                'Вы не можете ограбить бота.',
                {
                    victimId: victimUser.id,
                    isBot: true
                }
            );
        }

        // ==========================================
        // ПОЛУЧАЕМ ДАННЫЕ ЭКОНОМИКИ
        // ==========================================

        const robberData = await getEconomyData(
            client,
            guildId,
            robberId
        );

        const victimData = await getEconomyData(
            client,
            guildId,
            victimUser.id
        );

        if (!robberData || !victimData) {
            throw createError(
                'Не удалось загрузить данные экономики',
                ErrorTypes.DATABASE,
                'Не удалось загрузить данные экономики. Пожалуйста, попробуйте позже.',
                {
                    robberId: !!robberData,
                    victimId: !!victimData,
                    guildId
                }
            );
        }

        // ==========================================
        // ПРОВЕРКА COOLDOWN
        // ==========================================

        const lastRob = robberData.lastRob || 0;

        if (now < lastRob + ROB_COOLDOWN) {
            const remaining =
                lastRob + ROB_COOLDOWN - now;

            const hours = Math.floor(
                remaining / (1000 * 60 * 60)
            );

            const minutes = Math.floor(
                (remaining % (1000 * 60 * 60)) /
                (1000 * 60)
            );

            throw createError(
                'Активна перезарядка ограбления',
                ErrorTypes.RATE_LIMIT,
                `Вам нужно залечь на дно. Подождите **${hours}ч ${minutes}мин** перед следующей попыткой ограбления.`,
                {
                    remaining,
                    hours,
                    minutes,
                    cooldownType: 'rob'
                }
            );
        }

        // ==========================================
        // ПРОВЕРКА КОШЕЛЬКА ЖЕРТВЫ
        // ==========================================

        if (victimData.wallet < 500) {
            throw createError(
                'У жертвы недостаточно денег',
                ErrorTypes.VALIDATION,
                `${victimUser.username} слишком беден. У него должно быть как минимум $500 наличными, чтобы его было выгодно грабить.`,
                {
                    victimWallet: victimData.wallet,
                    required: 500
                }
            );
        }

        // ==========================================
        // ПРОВЕРКА ЛИЧНОГО СЕЙФА
        // ==========================================

        const hasSafe =
            victimData.inventory['personal_safe'] || 0;

        if (hasSafe > 0) {
            robberData.lastRob = now;

            await setEconomyData(
                client,
                guildId,
                robberId,
                robberData
            );

            return await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        warningEmbed(
                            '🛡️ Ограбление предотвращено',
                            `${victimUser.username} был готов к нападению! Ваша попытка провалилась, потому что у него есть **Личный сейф**. Вы смогли уйти без последствий, но ничего не получили.`
                        )
                    ]
                }
            );
        }

        // ==========================================
        // ОСОБАЯ ЗАЩИТА ПОЛЬЗОВАТЕЛЯ
        // ==========================================

        if (victimUser.id === PROTECTED_USER_ID) {
            const fineAmount = Math.floor(
                (robberData.wallet || 0) *
                FINE_PERCENTAGE
            );

            robberData.wallet = Math.max(
                0,
                (robberData.wallet || 0) - fineAmount
            );

            robberData.lastRob = now;

            // Сохраняем только данные грабителя.
            // Баланс защищённого пользователя НЕ МЕНЯЕМ.
            await setEconomyData(
                client,
                guildId,
                robberId,
                robberData
            );

            const resultEmbed = warningEmbed(
                '🚨 ОГРАБЛЕНИЕ ПРОВАЛЕНО',
                `😈 Вы решили ограбить **${victimUser.username}**...\n\n` +
                `💀 **Плохая идея.**\n` +
                `🛡️ Это предстовитель старых богов!\n\n` +
                `👀 Вас заметили ещё до того, как вы успели что-либо украсть.\n\n` +
                `❌ **Ограбление автоматически провалено.**\n` +
                `💸 Вы получили штраф **$${fineAmount.toLocaleString()}**.\n\n` +
                `😎 **${victimUser.username} сохранил все свои деньги.**`
            );

            resultEmbed.addFields(
                {
                    name: `💰 Ваши наличные`,
                    value: `$${robberData.wallet.toLocaleString()}`,
                    inline: true
                },
                {
                    name: `🛡️ Наличные ${victimUser.username}`,
                    value: `$${victimData.wallet.toLocaleString()}`,
                    inline: true
                }
            );

            resultEmbed.setFooter({
                text: 'Не стоило выбирать эту жертву... 😈'
            });

            return await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [resultEmbed]
                }
            );
        }

        // ==========================================
        // ОБЫЧНЫЙ ШАНС УСПЕШНОГО ОГРАБЛЕНИЯ
        // ==========================================

        const isSuccessful =
            Math.random() < BASE_ROB_SUCCESS_CHANCE;

        let resultEmbed;

        // ==========================================
        // УСПЕШНОЕ ОГРАБЛЕНИЕ
        // ==========================================

        if (isSuccessful) {
            const amountStolen = Math.floor(
                victimData.wallet * ROB_PERCENTAGE
            );

            robberData.wallet =
                (robberData.wallet || 0) +
                amountStolen;

            victimData.wallet =
                (victimData.wallet || 0) -
                amountStolen;

            resultEmbed = successEmbed(
                '💰 Ограбление успешно',
                `Вы успешно украли **$${amountStolen.toLocaleString()}** у ${victimUser.username}!`
            );
        }

        // ==========================================
        // НЕУДАЧНОЕ ОГРАБЛЕНИЕ
        // ==========================================

        else {
            const fineAmount = Math.floor(
                (robberData.wallet || 0) *
                FINE_PERCENTAGE
            );

            if (
                (robberData.wallet || 0) <
                fineAmount
            ) {
                robberData.wallet = 0;
            } else {
                robberData.wallet =
                    (robberData.wallet || 0) -
                    fineAmount;
            }

            resultEmbed = buildUserErrorEmbed(
                'unknown',
                `Ограбление провалилось, и вас поймали! Вы были оштрафованы на **$${fineAmount.toLocaleString()}** из собственных наличных.`,
                {
                    titleOverride:
                        '🚨 Ограбление провалилось'
                }
            );
        }

        // ==========================================
        // ОБНОВЛЯЕМ COOLDOWN
        // ==========================================

        robberData.lastRob = now;

        // ==========================================
        // СОХРАНЯЕМ ДАННЫЕ
        // ==========================================

        await setEconomyData(
            client,
            guildId,
            robberId,
            robberData
        );

        await setEconomyData(
            client,
            guildId,
            victimUser.id,
            victimData
        );

        // ==========================================
        // ДОБАВЛЯЕМ ИНФОРМАЦИЮ В EMBED
        // ==========================================

        resultEmbed.addFields(
            {
                name: `Ваши новые наличные (${interaction.user.username})`,
                value: `$${robberData.wallet.toLocaleString()}`,
                inline: true
            },
            {
                name: `Новые наличные жертвы (${victimUser.username})`,
                value: `$${victimData.wallet.toLocaleString()}`,
                inline: true
            }
        );

        resultEmbed.setFooter({
            text: `Следующее ограбление будет доступно через ${Math.ceil(
                ROB_COOLDOWN /
                (60 * 60 * 1000)
            )} часов.`
        });

        // ==========================================
        // ОТПРАВЛЯЕМ РЕЗУЛЬТАТ
        // ==========================================

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [resultEmbed]
            }
        );
    }, {
        command: 'rob'
    })
};
