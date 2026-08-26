// ==================== /deposit ====================
// Переведено на русский: все пользовательские сообщения,
// описания команды, названия полей и ошибки.

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Внести деньги из кошелька в банк')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Сумма для внесения (число или "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString('amount');

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                'Не удалось загрузить данные экономики',
                ErrorTypes.DATABASE,
                'Не удалось загрузить данные вашей экономики. Пожалуйста, попробуйте позже.',
                { userId, guildId }
            );
        }

        const maxBank = getMaxBankCapacity(userData);
        let depositAmount;

        if (amountInput.toLowerCase() === 'all') {
            depositAmount = userData.wallet;
        } else {
            depositAmount = parseInt(amountInput, 10);

            if (isNaN(depositAmount) || depositAmount <= 0) {
                throw createError(
                    'Некорректная сумма депозита',
                    ErrorTypes.VALIDATION,
                    `Введите корректное число или \`all\`. Вы ввели: \`${amountInput}\``,
                    { amountInput, userId }
                );
            }
        }

        if (depositAmount === 0) {
            throw createError(
                'Нулевая сумма депозита',
                ErrorTypes.VALIDATION,
                'У вас нет наличных для внесения в банк.',
                { userId, walletBalance: userData.wallet }
            );
        }

        if (depositAmount > userData.wallet) {
            depositAmount = userData.wallet;

            await interaction.followUp({
                embeds: [
                    buildUserErrorEmbed(
                        'validation',
                        `Вы попытались внести больше денег, чем у вас есть. Будет внесено оставшееся количество наличных: **$${depositAmount.toLocaleString()}**`
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const availableSpace = maxBank - userData.bank;

        if (availableSpace <= 0) {
            throw createError(
                'Банк заполнен',
                ErrorTypes.VALIDATION,
                `Ваш банк уже заполнен (максимальная вместимость: $${maxBank.toLocaleString()}). Приобретите **улучшение банка**, чтобы увеличить лимит.`,
                { maxBank, currentBank: userData.bank, userId }
            );
        }

        if (depositAmount > availableSpace) {
            depositAmount = availableSpace;

            if (amountInput.toLowerCase() !== 'all') {
                await interaction.followUp({
                    embeds: [
                        buildUserErrorEmbed(
                            'validation',
                            `В вашем банке было место только для **$${depositAmount.toLocaleString()}** (максимум: $${maxBank.toLocaleString()}). Остальные деньги останутся у вас в наличных.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        if (depositAmount === 0) {
            throw createError(
                'Недостаточно места или денег для депозита',
                ErrorTypes.VALIDATION,
                'Сумма депозита оказалась равна 0 или превысила вместимость банка после проверки вашего баланса.',
                { depositAmount, availableSpace, walletBalance: userData.wallet }
            );
        }

        userData.wallet -= depositAmount;
        userData.bank += depositAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            'Депозит успешно внесён',
            `Вы успешно внесли **$${depositAmount.toLocaleString()}** на свой банковский счёт.`
        )
            .addFields(
                {
                    name: 'Новый баланс наличных',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: 'Новый баланс банка',
                    value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};
