// ==================== /eleaderboard ====================
// Таблица лидеров экономики сервера.
// Пользовательские описания, сообщения и текст embed переведены на русский.

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyPrefix } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('eleaderboard')
        .setDescription('Показать 10 самых богатых пользователей сервера.')
        .setDMPermission(false),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Leaderboard requested`, { guildId });

        const prefix = getEconomyPrefix(guildId);

        let allKeys = await client.db.list(prefix);

        if (!Array.isArray(allKeys)) {
            allKeys = [];
        }

        if (allKeys.length === 0) {
            throw createError(
                'Данные экономики отсутствуют',
                ErrorTypes.VALIDATION,
                'Данные экономики для этого сервера не найдены.'
            );
        }

        const allUserData = [];

        for (const key of allKeys) {
            const userId = key.replace(prefix, '');
            const userData = await client.db.get(key);

            if (userData) {
                allUserData.push({
                    userId,
                    net_worth: (userData.wallet || 0) + (userData.bank || 0),
                });
            }
        }

        allUserData.sort((a, b) => b.net_worth - a.net_worth);

        const topUsers = allUserData.slice(0, 10);

        const userRank =
            allUserData.findIndex((u) => u.userId === interaction.user.id) + 1;

        const rankEmoji = ['🥇', '🥈', '🥉'];
        const leaderboardEntries = [];

        for (let i = 0; i < topUsers.length; i++) {
            const user = topUsers[i];
            const rank = i + 1;
            const emoji = rankEmoji[i] || `**#${rank}**`;

            leaderboardEntries.push(
                `${emoji} <@${user.userId}> — 💰 ${user.net_worth.toLocaleString()}`
            );
        }

        logger.info(`[ECONOMY] Leaderboard generated`, {
            guildId,
            userCount: allUserData.length,
            userRank,
        });

        const description = leaderboardEntries.length > 0
            ? leaderboardEntries.join('\n')
            : 'Данные экономики для этого сервера пока отсутствуют.';

        const embed = createEmbed({
            title: 'Таблица лидеров экономики',
            description,
            footer: `Ваше место: ${userRank > 0 ? `#${userRank}` : 'Нет данных о рейтинге'}`,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    }, { command: 'eleaderboard' }),
};
