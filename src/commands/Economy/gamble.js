// ==================== /gamble ====================
// Команда азартной игры.
// Переведены пользовательские описания, сообщения, embed и footer.
// Логика команды не изменена.

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Испытать удачу и попытаться выиграть больше денег')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Сумма наличных для ставки')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger('amount');
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastGamble = userData.lastGamble || 0;
        let cloverCount = userData.inventory['lucky_clover'] || 0;
        let charmCount = userData.inventory['lucky_charm'] || 0;

        if (now < lastGamble + GAMBLE_COOLDOWN) {
            const remaining = lastGamble + GAMBLE_COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            throw createError(
                'Азартная игра пока недоступна',
                ErrorTypes.RATE_LIMIT,
                `Вам нужно немного отдохнуть перед следующей ставкой. Подождите **${minutes}м ${seconds}с**.`,
                { remaining, cooldownType: 'gamble' }
            );
        }

        if (userData.wallet < betAmount) {
            throw createError(
                'Недостаточно наличных для ставки',
                ErrorTypes.VALIDATION,
                `У вас только $${userData.wallet.toLocaleString()} наличных, но вы пытаетесь поставить $${betAmount.toLocaleString()}.`,
                { required: betAmount, current: userData.wallet }
            );
        }

        let winChance = BASE_WIN_CHANCE;
        let cloverMessage = '';
        let usedClover = false;
        let usedCharm = false;

        if (cloverCount > 0) {
            winChance += CLOVER_WIN_BONUS;
            userData.inventory['lucky_clover'] -= 1;
            cloverMessage = '\n🍀 **Счастливый клевер использован:** ваш шанс на победу увеличен!';
            usedClover = true;
        } else if (charmCount > 0) {
            winChance += CHARM_WIN_BONUS;
            userData.inventory['lucky_charm'] -= 1;
            cloverMessage = `\n🍀 **Счастливый амулет использован (осталось использований: ${charmCount - 1}):** ваш шанс на победу увеличен!`;
            usedCharm = true;
        }

        const win = Math.random() < winChance;
        let cashChange = 0;
        let resultEmbed;

        if (win) {
            const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);

            // Чистое изменение баланса: ставка заменяется выигрышем.
            // Ставка заранее не вычиталась из баланса.
            cashChange = amountWon - betAmount;

            resultEmbed = successEmbed(
                '🎉 Вы выиграли!',
                `Вам повезло! Ваша ставка **$${betAmount.toLocaleString()}** превратилась в **$${amountWon.toLocaleString()}**!${cloverMessage}`,
            );
        } else {
            cashChange = -betAmount;

            resultEmbed = warningEmbed(
                '💔 Вы проиграли...',
                `Удача была не на вашей стороне. Вы потеряли свою ставку в размере **$${betAmount.toLocaleString()}**.`,
            );
        }

        userData.wallet = (userData.wallet || 0) + cashChange;
        userData.lastGamble = now;

        await setEconomyData(client, guildId, userId, userData);

        const newCash = userData.wallet;

        resultEmbed.addFields({
            name: 'Новый баланс наличных',
            value: `$${newCash.toLocaleString()}`,
            inline: true,
        });

        if (usedClover) {
            resultEmbed.setFooter({
                text: `У вас осталось ${userData.inventory['lucky_clover']} счастливых клевер. Шанс на победу составлял ${Math.round(winChance * 100)}%.`,
            });
        } else if (usedCharm) {
            resultEmbed.setFooter({
                text: `У вас осталось ${userData.inventory['lucky_charm']} использований счастливого амулета. Шанс на победу составлял ${Math.round(winChance * 100)}%.`,
            });
        } else {
            resultEmbed.setFooter({
                text: `Следующая ставка будет доступна через 5 минут. Базовый шанс на победу: ${Math.round(BASE_WIN_CHANCE * 100)}%.`,
            });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [resultEmbed],
        });
    }, { command: 'gamble' }),
};
