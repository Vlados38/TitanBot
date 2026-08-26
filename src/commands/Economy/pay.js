// Переведённый файл: pay.js

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Передать другому пользователю часть своих наличных')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которому нужно заплатить')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Сумма для передачи')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const senderId = interaction.user.id;
        const receiver = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Pay command initiated`, {
            senderId,
            receiverId: receiver.id,
            amount,
            guildId
        });

        if (receiver.bot) {
            throw createError(
                "Нельзя заплатить боту",
                ErrorTypes.VALIDATION,
                "Вы не можете заплатить боту.",
                { receiverId: receiver.id, isBot: true }
            );
        }

        if (receiver.id === senderId) {
            throw createError(
                "Нельзя заплатить самому себе",
                ErrorTypes.VALIDATION,
                "Вы не можете заплатить самому себе.",
                { senderId, receiverId: receiver.id }
            );
        }

        if (amount <= 0) {
            throw createError(
                "Недопустимая сумма платежа",
                ErrorTypes.VALIDATION,
                "Сумма должна быть больше нуля.",
                { amount, senderId }
            );
        }

        const [senderData, receiverData] = await Promise.all([
            getEconomyData(client, guildId, senderId),
            getEconomyData(client, guildId, receiver.id)
        ]);

        if (!senderData) {
            throw createError(
                "Не удалось загрузить данные отправителя",
                ErrorTypes.DATABASE,
                "Не удалось загрузить данные вашей экономики. Пожалуйста, попробуйте позже.",
                { userId: senderId, guildId }
            );
        }

        if (!receiverData) {
            throw createError(
                "Не удалось загрузить данные получателя",
                ErrorTypes.DATABASE,
                "Не удалось загрузить данные экономики получателя. Пожалуйста, попробуйте позже.",
                { userId: receiver.id, guildId }
            );
        }

        await EconomyService.transferMoney(
            client,
            guildId,
            senderId,
            receiver.id,
            amount
        );

        const updatedSenderData = await getEconomyData(client, guildId, senderId);
        const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

        const embed = successEmbed(
            'Платёж успешно выполнен',
            `Вы успешно передали **${receiver.username}** сумму **$${amount.toLocaleString()}**!`
        )
            .addFields(
                {
                    name: "Сумма платежа",
                    value: `$${amount.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Ваш новый баланс",
                    value: `$${updatedSenderData.wallet.toLocaleString()}`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Получатель: ${receiver.tag}`,
                iconURL: receiver.displayAvatarURL(),
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        logger.info(`[ECONOMY] Payment sent successfully`, {
            senderId,
            receiverId: receiver.id,
            amount,
            senderBalance: updatedSenderData.wallet,
            receiverBalance: updatedReceiverData.wallet
        });

        try {
            const receiverEmbed = createEmbed({
                title: "Вам поступил платёж!",
                description: `${interaction.user.username} передал вам **$${amount.toLocaleString()}**.`
            }).addFields({
                name: "Ваши новые наличные",
                value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                inline: true,
            });

            await receiver.send({ embeds: [receiverEmbed] });
        } catch (e) {
            logger.warn(`Не удалось отправить ЛС пользователю ${receiver.id}: ${e.message}`);
        }
    }, { command: 'pay' })
};
