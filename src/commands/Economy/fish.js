// ==================== /fish ====================
// Команда рыбалки.
// Пользовательские сообщения, описания и embed переведены на русский.
// Логика команды не изменена.

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000;
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Окунь', emoji: '🐟', rarity: 'common' },
    { name: 'Лосось', emoji: '🐟', rarity: 'common' },
    { name: 'Форель', emoji: '🐟', rarity: 'common' },
    { name: 'Тунец', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Меч-рыба', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Осьминог', emoji: '🐙', rarity: 'rare' },
    { name: 'Омар', emoji: '🦞', rarity: 'rare' },
    { name: 'Акула', emoji: '🦈', rarity: 'epic' },
    { name: 'Кит', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    'Вы забрасываете удочку в кристально чистую воду...',
    'Вы терпеливо ждёте, пока поплавок покачивается на воде...',
    'После нескольких минут ожидания вы чувствуете поклёвку...',
    'По воде расходятся круги — кто-то клюнул на вашу наживку...',
    'Вы мастерски вытаскиваете свой улов...',
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Отправиться на рыбалку и поймать рыбу, чтобы заработать деньги'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastFish = userData.lastFish || 0;
        const hasFishingRod = userData.inventory['fishing_rod'] || 0;

        if (now < lastFish + FISH_COOLDOWN) {
            const remaining = lastFish + FISH_COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor(
                (remaining % (1000 * 60 * 60)) / (1000 * 60),
            );

            throw createError(
                'Рыбалка пока недоступна',
                ErrorTypes.RATE_LIMIT,
                `Вы слишком устали для рыбалки. Отдохните ещё **${hours}ч ${minutes}м**, прежде чем отправляться снова.`,
                { remaining, cooldownType: 'fish' }
            );
        }

        const rand = Math.random();
        let fishCaught;

        if (rand < 0.5) {
            fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[
                Math.floor(Math.random() * 3)
            ];
        } else if (rand < 0.75) {
            fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[
                Math.floor(Math.random() * 2)
            ];
        } else if (rand < 0.9) {
            fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[
                Math.floor(Math.random() * 2)
            ];
        } else if (rand < 0.98) {
            fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
        } else {
            fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
        }

        const baseEarned = Math.floor(
            Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
        ) + BASE_MIN_REWARD;

        let finalEarned = baseEarned;
        let multiplierMessage = '';

        if (hasFishingRod > 0) {
            finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
            multiplierMessage = '\n🎣 **Бонус удочки: +50%**';
        }

        const catchMessage =
            CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

        userData.wallet += finalEarned;
        userData.lastFish = now;

        await setEconomyData(client, guildId, userId, userData);

        const rarityColors = {
            common: '#95A5A6',
            uncommon: '#2ECC71',
            rare: '#3498DB',
            epic: '#9B59B6',
            legendary: '#F1C40F',
        };

        const rarityNames = {
            common: 'Обычная',
            uncommon: 'Необычная',
            rare: 'Редкая',
            epic: 'Эпическая',
            legendary: 'Легендарная',
        };

        const embed = createEmbed({
            title: '🎣 Рыбалка успешна!',
            description:
                `${catchMessage}\n\n` +
                `Вы поймали **${fishCaught.emoji} ${fishCaught.name}**! ` +
                `Вы продали её за **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
            color: rarityColors[fishCaught.rarity],
        })
            .addFields(
                {
                    name: 'Новый баланс наличных',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: 'Редкость',
                    value: rarityNames[fishCaught.rarity],
                    inline: true,
                }
            )
            .setFooter({
                text: 'Следующая рыбалка будет доступна через 45 минут.',
            });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    }, { command: 'fish' }),
};
