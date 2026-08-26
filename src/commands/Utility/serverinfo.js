import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Получить подробную информацию о сервере"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Не удалось отложить взаимодействие ServerInfo`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'serverinfo'
            });
            return;
        }

        const guild = interaction.guild;
        const owner = await guild.fetchOwner();

        const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

        const embed = createEmbed({
            title: `Информация о сервере: ${guild.name}`,
            description: `ID сервера: ${guild.id}`
        })
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
                { name: "Владелец", value: owner.user.tag, inline: true },
                { name: "Участники", value: `${guild.memberCount}`, inline: true },
                {
                    name: "Каналы",
                    value: `${guild.channels.cache.size}`,
                    inline: true,
                },
                { name: "Роли", value: `${guild.roles.cache.size}`, inline: true },
                {
                    name: "Бусты",
                    value: `Уровень ${guild.premiumTier} (${guild.premiumSubscriptionCount})`,
                    inline: true,
                },
                {
                    name: "Дата создания",
                    value: `<t:${createdTimestamp}:R>`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        logger.info(`Команда ServerInfo выполнена`, {
            userId: interaction.user.id,
            guildId: guild.id,
            guildName: guild.name,
            memberCount: guild.memberCount
        });
    },
};
