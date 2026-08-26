// Переведённый файл: mine.js

import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MINE_COOLDOWN = 60 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    "заброшенная золотая шахта",
    "тёмная сырая пещера",
    "каменный карьер на заднем дворе",
    "вулканический обсидиановый разлом",
    "глубоководная минеральная впадина",
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Отправиться на добычу полезных ископаемых и заработать деньги'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastMine = userData.lastMine || 0;
        const hasDiamondPickaxe = userData.inventory["diamond_pickaxe"] || 0;
        const hasPickaxe = userData.inventory["pickaxe"] || 0;

        if (now < lastMine + MINE_COOLDOWN) {
            const remaining = lastMine + MINE_COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor(
                (remaining % (1000 * 60 * 60)) / (1000 * 60),
            );

            throw createError(
                "Активна перезарядка шахты",
                ErrorTypes.RATE_LIMIT,
                `Ваша кирка ещё не готова к использованию. Подождите **${hours}ч ${minutes}мин** перед следующей добычей.`,
                { remaining, cooldownType: 'mine' }
            );
        }

        const baseEarned =
            Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
            ) + BASE_MIN_REWARD;

        let finalEarned = baseEarned;
        let multiplierMessage = "";

        if (hasDiamondPickaxe > 0) {
            finalEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
            multiplierMessage = `\n💎 **Бонус алмазной кирки: +100%**`;
        } else if (hasPickaxe > 0) {
            finalEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
            multiplierMessage = `\n⛏️ **Бонус кирки: +20%**`;
        }

        const location =
            MINE_LOCATIONS[
                Math.floor(Math.random() * MINE_LOCATIONS.length)
            ];

        userData.wallet += finalEarned;
        userData.lastMine = now;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            "💰 Успешная экспедиция!",
            `Вы исследовали **${location}** и нашли полезных ископаемых на сумму **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
        )
            .addFields({
                name: "Новый баланс наличных",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            })
            .setFooter({ text: `Следующая добыча будет доступна через 1 час.` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
};
