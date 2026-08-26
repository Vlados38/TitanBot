// Переведённый файл: /buy

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Купить предмет в магазине')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID предмета для покупки')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Количество для покупки (по умолчанию: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const itemId = interaction.options.getString("item_id").toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = SHOP_ITEMS.find(i => i.id === itemId);

        if (!item) {
            throw createError(
                `Предмет ${itemId} не найден`,
                ErrorTypes.VALIDATION,
                `Предмет с ID \`${itemId}\` отсутствует в магазине.`,
                { itemId }
            );
        }

        if (quantity < 1) {
            throw createError(
                "Недопустимое количество",
                ErrorTypes.VALIDATION,
                "Вы должны купить как минимум 1 предмет.",
                { quantity }
            );
        }

        const totalCost = item.price * quantity;

        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.wallet < totalCost) {
            throw createError(
                "Недостаточно средств",
                ErrorTypes.VALIDATION,
                `Вам нужно **$${totalCost.toLocaleString()}** для покупки ${quantity}x **${item.name}**, но у вас только **$${userData.wallet.toLocaleString()}** наличными.`,
                { required: totalCost, current: userData.wallet, itemId, quantity }
            );
        }

        if (item.type === "role" && itemId === "premium_role") {
            if (!PREMIUM_ROLE_ID) {
                throw createError(
                    "Премиум-роль не настроена",
                    ErrorTypes.CONFIGURATION,
                    "Серверный администратор ещё не настроил **премиум-роль магазина**.",
                    { itemId }
                );
            }

            if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                throw createError(
                    "Роль уже имеется",
                    ErrorTypes.VALIDATION,
                    `У вас уже есть роль **${item.name}**.`,
                    { itemId, roleId: PREMIUM_ROLE_ID }
                );
            }

            if (quantity > 1) {
                throw createError(
                    "Недопустимое количество для роли",
                    ErrorTypes.VALIDATION,
                    `Вы можете приобрести роль **${item.name}** только один раз.`,
                    { itemId, quantity }
                );
            }
        }

        userData.wallet -= totalCost;

        let successDescription = `Вы успешно приобрели ${quantity}x **${item.name}** за **$${totalCost.toLocaleString()}**!`;

        if (item.type === "role" && itemId === "premium_role") {
            const member = interaction.member;

            const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

            if (!role) {
                throw createError(
                    "Роль не найдена",
                    ErrorTypes.CONFIGURATION,
                    "Настроенная премиум-роль больше не существует на этом сервере.",
                    { roleId: PREMIUM_ROLE_ID }
                );
            }

            try {
                await member.roles.add(
                    role,
                    `Purchased role: ${item.name}`,
                );

                successDescription += `\n\n**👑 Роль ${role.toString()} была выдана вам!**`;
            } catch (roleError) {
                userData.wallet += totalCost;
                await setEconomyData(client, guildId, userId, userData);

                throw createError(
                    "Не удалось выдать роль",
                    ErrorTypes.DISCORD_API,
                    "Деньги были списаны, но роль не удалось выдать. Ваши средства были возвращены.",
                    { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                );
            }
        } else if (item.type === "upgrade") {
            userData.upgrades[itemId] = true;
            successDescription += `\n\n**✨ Улучшение теперь активно!**`;
        } else if (item.type === "consumable" || item.type === "tool") {
            userData.inventory[itemId] =
                (userData.inventory[itemId] || 0) + quantity;

            if (item.type === "tool") {
                successDescription += `\n\n**🛠️ ${item.name} добавлен в ваш инвентарь!**`;
            }
        }

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            "💰 Покупка совершена",
            successDescription,
        ).addFields({
            name: "Новый баланс",
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            flags: [MessageFlags.Ephemeral]
        });
    }, { command: 'buy' })
};
