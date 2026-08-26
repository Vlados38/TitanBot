import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Удалить все ваши личные данные из бота (необратимо)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **ЭТО ДЕЙСТВИЕ НЕОБРАТИМО!** ⚠️\n\n` +
            `Это навсегда удалит **ВСЕ** ваши данные с этого сервера, включая:\n` +
            `• 💰 Баланс экономики (кошелёк и банк)\n` +
            `• 📊 Уровни и XP\n` +
            `• 🎒 Предметы инвентаря\n` +
            `• 🛍️ Покупки в магазине\n` +
            `• 🎂 Информацию о дне рождения\n` +
            `• 🔢 Данные счётчиков\n` +
            `• 📋 Все остальные личные данные\n\n` +
            `**Это действие нельзя отменить. Вы действительно уверены?**`;

        const embed = warningEmbed('Удаление всех данных', warningMessage);

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [confirmButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Команда Wipedata выполнена — показано окно подтверждения`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};
