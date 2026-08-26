import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Вычислить математическое выражение")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "Математическое выражение для вычисления (например: 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Не удалось отложить взаимодействие Calculate`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression");

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: '**Содержит неподдерживаемые символы.**\n\n' +
                    '✅ **Поддерживается:** числа, десятичные дроби, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n' +
                    '❌ **Не поддерживается:** квадратные скобки, фигурные скобки и другие символы'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '**Обнаружены запрещённые конструкции кода.**\n\n' +
                        '🚫 **Запрещено:** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, циклы, async/await\n\n' +
                        'Синтаксис, похожий на программный код, не разрешён в вычислениях.'
                });
            }
        }

        let result;

        try {
            result = evaluate(expression);

            let formattedResult;

            if (typeof result === "number") {
                formattedResult = result.toLocaleString("ru-RU", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "true" : "false";
            } else if (result === null || result === undefined) {
                formattedResult = "Нет результата";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n```";
            } else {
                formattedResult = String(result);
            }

            const userId = interaction.user.id;

            if (!calculationHistory.has(userId)) {
                calculationHistory.set(userId, []);
            }

            const history = calculationHistory.get(userId);

            history.unshift({
                expression,
                result: formattedResult,
                timestamp: Date.now(),
            });

            if (history.length > MAX_HISTORY) {
                history.pop();
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_add`)
                    .setLabel("+")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_subtract`)
                    .setLabel("-")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_multiply`)
                    .setLabel("×")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_divide`)
                    .setLabel("÷")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_history`)
                    .setLabel("История")
                    .setStyle(ButtonStyle.Secondary),
            );

            const embed = successEmbed(
                "🧮 Результат вычисления",
                `**Выражение:** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**Результат:** \`${formattedResult}\`\n\n` +
                    `*Используйте кнопки ниже, чтобы выполнить операции с результатом.*`,
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            });

            const filter = (i) =>
                i.customId.startsWith(`calc_${interaction.id}`) &&
                i.user.id === interaction.user.id;

            const BUTTON_TIMEOUT = 300000;

            const collector =
                interaction.channel.createMessageComponentCollector({
                    filter,
                    time: BUTTON_TIMEOUT,
                });

            collector.on("collect", async (i) => {
                try {
                    const operation = i.customId.split("_")[2];

                    if (operation === "history") {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate().catch(console.error);
                        }

                        const userHistory =
                            calculationHistory.get(userId) || [];

                        if (userHistory.length === 0) {
                            await i.followUp({
                                content: "История вычислений не найдена.",
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        const historyText = userHistory
                            .map(
                                (item, index) =>
                                    `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                    `<t:${Math.floor(item.timestamp / 1000)}:R>`,
                            )
                            .join("\n\n");

                        await i.followUp({
                            content: `📜 **Ваша история вычислений**\n\n${historyText}`,
                            flags: ["Ephemeral"],
                        });

                        return;
                    }

                    let operator = "";

                    switch (operation) {
                        case "add":
                            operator = "+";
                            break;

                        case "subtract":
                            operator = "-";
                            break;

                        case "multiply":
                            operator = "*";
                            break;

                        case "divide":
                            operator = "/";
                            break;
                    }

                    try {
                        const contextKey = `${i.user.id}_${operation}`;

                        calculationContexts.set(contextKey, {
                            expression,
                            formattedResult,
                            operator,
                            messageId: interaction.message?.id,
                            channelId: interaction.channelId,
                            userId: i.user.id
                        });

                        await i.showModal({
                            customId: `calc_modal:${operation}`,
                            title: `Введите число для операции ${operator}`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            customId: `operand:${contextKey}`,
                                            label: `Число для операции ${operator} с ${formattedResult}`,
                                            placeholder: "Введите число...",
                                            style: 1,
                                            required: true,
                                            maxLength: 50,
                                        },
                                    ],
                                },
                            ],
                        });
                    } catch (modalError) {
                        logger.error("Не удалось открыть модальное окно:", modalError);

                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "Не удалось открыть калькулятор. Попробуйте ещё раз.",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }

                        return;
                    }

                } catch (error) {
                    logger.error("Ошибка взаимодействия с кнопкой:", error);

                    if (!i.deferred && !i.replied) {
                        await i.followUp({
                            content: "Произошла ошибка при обработке вашего запроса.",
                            flags: ["Ephemeral"],
                        }).catch(console.error);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "timeout") {
                    const disabledRow =
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `calc_${interaction.id}_expired`,
                                )
                                .setLabel("Калькулятор истёк")
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                        );

                    interaction
                        .editReply({
                            components: [disabledRow],
                            content:
                                "⏱️ Срок действия этого калькулятора истёк. Используйте команду снова, чтобы выполнить новые вычисления.",
                        })
                        .catch(console.error);
                } else {
                    const disabledRow = ActionRowBuilder.from(
                        row,
                    ).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );

                    interaction
                        .editReply({ components: [disabledRow] })
                        .catch(console.error);
                }
            });

        } catch (error) {
            logger.error('Ошибка вычисления:', error);

            let errorMessage = 'Не удалось вычислить выражение.';

            if (error.message.includes('Unexpected type')) {
                errorMessage +=
                    ' Выражение содержит неподдерживаемую операцию или функцию.';
            } else if (error.message.includes('Undefined symbol')) {
                errorMessage +=
                    ' Выражение содержит неопределённую переменную или функцию.';
            } else if (error.message.includes('Brackets not balanced')) {
                errorMessage += ' В выражении неправильно расставлены скобки.';
            } else if (
                error.message.includes('Unexpected operator') ||
                error.message.includes('Unexpected character')
            ) {
                errorMessage +=
                    ' Выражение содержит недопустимый оператор или символ.';
            } else {
                errorMessage += ' Проверьте синтаксис и попробуйте ещё раз.';
            }

            await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: errorMessage,
            });
        }
    },
};
