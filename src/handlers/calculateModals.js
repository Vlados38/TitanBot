import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction, client, args) {
    try {
        const operation = args[0];
        const operandInput = interaction.fields.first();
        const contextKey = operandInput?.customId?.split(':')[1];

        if (!contextKey) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Не удалось получить контекст вычисления.'
            });
        }

        const { calculationContexts } = await import('../commands/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);

        if (!context) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Срок действия этого вычисления истёк. Пожалуйста, начните новое вычисление.'
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const operand = interaction.fields.getTextInputValue(operandInput.customId);

        if (!operand || isNaN(operand)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Пожалуйста, введите корректное число.'
            });
        }

        const { expression, formattedResult, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;

        let newResult;

        try {
            newResult = evaluate(newExpression);

            let formattedNewResult;

            if (typeof newResult === "number") {
                formattedNewResult = newResult.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(newResult) > 0 &&
                    (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)
                ) {
                    formattedNewResult = newResult.toExponential(6);
                }
            } else {
                formattedNewResult = String(newResult);
            }

            const updatedEmbed = successEmbed(
                "🧮 Результат вычисления",
                `**Выражение:** \`${newExpression.replace(/`/g, "\`")}\`\n` +
                    `**Результат:** \`${formattedNewResult}\`\n\n` +
                    `*Используйте кнопки в сообщении канала, чтобы выполнить дополнительные операции.*`,
            );

            try {
                if (context.messageId && context.channelId) {
                    const channel = await client.channels.fetch(context.channelId);
                    const message = await channel.messages.fetch(context.messageId);

                    await message.edit({
                        embeds: [updatedEmbed],
                    });
                }
            } catch (editError) {
                logger.warn(
                    'Не удалось изменить исходное сообщение:',
                    editError.message
                );
            }

            calculationContexts.delete(contextKey);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        '✅ Вычислено',
                        `\`${newExpression}\` = \`${formattedNewResult}\``
                    )
                ],
            });

        } catch (calcError) {
            logger.error('Ошибка вычисления выражения:', calcError);

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Не удалось вычислить выражение.'
            });
        }

    } catch (error) {
        logger.error('Ошибка обработчика модального окна калькулятора:', error);

        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при обработке вашего вычисления.'
                });
            } else {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при обработке вашего вычисления.'
                });
            }
        } catch (err) {
            logger.error('Не удалось отправить сообщение об ошибке:', err);
        }
    }
}

export default {
    execute: calculateModalHandler
};
