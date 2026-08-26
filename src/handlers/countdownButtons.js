import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

function createControlButtons(countdownId, isPaused = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`countdown_pause:${countdownId}`)
            .setLabel(isPaused ? "▶️ Продолжить" : "⏸️ Пауза")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`countdown_cancel:${countdownId}`)
            .setLabel("❌ Отмена")
            .setStyle(ButtonStyle.Danger),
    );
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [
        h > 0 ? h.toString().padStart(2, "0") : null,
        m.toString().padStart(2, "0"),
        s.toString().padStart(2, "0"),
    ]
        .filter(Boolean)
        .join(":");
}

function startCountdown(countdownId, countdownData, activeCountdowns) {
    if (countdownData.interval) {
        clearInterval(countdownData.interval);
        countdownData.interval = null;
    }

    logger.info(`Обратный отсчёт запущен: ${countdownData.title} (${countdownData.remainingTime / 1000} сек. осталось)`);

    countdownData.interval = setInterval(async () => {
        try {
            if (countdownData.isPaused) return;

            const now = Date.now();
            const remaining = Math.max(0, countdownData.endTime - now);
            countdownData.remainingTime = remaining;

            if (now - countdownData.lastUpdate >= 1000) {
                countdownData.lastUpdate = now;

                const embed = successEmbed(
                    `⏱️ ${countdownData.title}`,
                    `Осталось времени: **${formatTime(Math.ceil(remaining / 1000))}**`,
                );

                try {
                    await countdownData.message.edit({
                        embeds: [embed],
                        components: [
                            createControlButtons(
                                countdownId,
                                countdownData.isPaused,
                            ),
                        ],
                    });
                } catch (error) {
                    logger.error("Ошибка обновления сообщения обратного отсчёта:", error);
                }
            }

            if (remaining <= 0) {
                clearInterval(countdownData.interval);

                const finishedEmbed = successEmbed(
                    `⏱️ ${countdownData.title} (Завершено!)`,
                    "⏰ Время вышло!",
                );

                await countdownData.message.edit({
                    embeds: [finishedEmbed],
                    components: [],
                });

                cleanupCountdown(countdownId, activeCountdowns);
            }
        } catch (error) {
            logger.error("Ошибка обновления обратного отсчёта:", error);
            cleanupCountdown(countdownId, activeCountdowns);
        }
    }, 100);
}

function cleanupCountdown(countdownId, activeCountdowns) {
    const countdownData = activeCountdowns.get(countdownId);
    if (countdownData) {
        clearInterval(countdownData.interval);
        activeCountdowns.delete(countdownId);
    }
}

async function countdownButtonHandler(interaction, client, args) {
    try {
        const { activeCountdowns } = await import('../commands/Tools/countdown.js');
        const action = args[0];
        const countdownId = args[1];

        const countdownData = activeCountdowns.get(countdownId);

        if (!countdownData) {
            return await interaction.reply({
                content: "Этот обратный отсчёт истёк или был отменён.",
                flags: ["Ephemeral"],
            });
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return await interaction.reply({
                content: 'Вам необходимо разрешение "Управление сообщениями", чтобы управлять обратным отсчётом.',
                flags: ["Ephemeral"],
            });
        }

        switch (action) {
            case "pause":
                if (countdownData.isPaused) {
                    countdownData.isPaused = false;
                    countdownData.endTime = Date.now() + countdownData.remainingTime;
                    startCountdown(countdownId, countdownData, activeCountdowns);

                    const currentEmbed = countdownData.message.embeds[0];

                    await countdownData.message.edit({
                        embeds: [currentEmbed],
                        components: [createControlButtons(countdownId, false)],
                    });

                    await interaction.reply({
                        content: "▶️ Обратный отсчёт продолжен!",
                        flags: ["Ephemeral"],
                    });
                } else {
                    clearInterval(countdownData.interval);
                    countdownData.isPaused = true;
                    countdownData.remainingTime = countdownData.endTime - Date.now();

                    const currentEmbed = countdownData.message.embeds[0];

                    await countdownData.message.edit({
                        embeds: [currentEmbed],
                        components: [createControlButtons(countdownId, true)],
                    });

                    await interaction.reply({
                        content: "⏸️ Обратный отсчёт приостановлен!",
                        flags: ["Ephemeral"],
                    });
                }
                break;

            case "cancel":
                clearInterval(countdownData.interval);

                const embed = successEmbed(
                    `⏱️ ${countdownData.title} (Отменено)`,
                    "Обратный отсчёт был отменён.",
                );

                await countdownData.message.edit({
                    embeds: [embed],
                    components: [],
                });

                cleanupCountdown(countdownId, activeCountdowns);

                await interaction.reply({
                    content: "❌ Обратный отсчёт отменён!",
                    flags: ["Ephemeral"],
                });
                break;
        }
    } catch (error) {
        logger.error('Ошибка обработчика кнопок обратного отсчёта:', error);

        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при управлении обратным отсчётом.'
                });
            }
        } catch (err) {
            logger.error('Не удалось отправить сообщение об ошибке:', err);
        }
    }
}

export {
    createControlButtons,
    formatTime,
    startCountdown,
    cleanupCountdown,
    countdownButtonHandler
};

export default countdownButtonHandler;
