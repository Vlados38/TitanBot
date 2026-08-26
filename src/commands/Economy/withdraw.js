import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Снять деньги с банковского счёта в кошелёк')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Сумма для снятия')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getInteger("amount");

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Не удалось загрузить данные экономики",
                ErrorTypes.DATABASE,
                "Не удалось загрузить ваши данные экономики. Попробуйте позже.",
                { userId, guildId }
            );
        }

        let withdrawAmount = amountInput;

        if (withdrawAmount <= 0) {
            throw createError(
                "Некорректная сумма снятия",
                ErrorTypes.VALIDATION,
                "Сумма снятия должна быть больше нуля.",
                { amount: withdrawAmount, userId }
            );
        }

        if (withdrawAmount > userData.bank) {
            withdrawAmount = userData.bank;
        }

        if (withdrawAmount === 0) {
            throw createError(
                "Банковский счёт пуст",
                ErrorTypes.VALIDATION,
                "На вашем банковском счёте нет денег.",
                { userId, bankBalance: userData.bank }
            );
        }

        userData.wallet += withdrawAmount;
        userData.bank -= withdrawAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            'Снятие выполнено',
            `Вы успешно сняли **$${withdrawAmount.toLocaleString()}** с банковского счёта.`
        )
            .addFields(
                {
                    name: "Новый баланс кошелька",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Новый баланс банка",
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
