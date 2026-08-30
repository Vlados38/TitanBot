import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from 'discord.js';

import {
    getUserLevelData,
    getLevelingConfig,
    getXpForLevel,
} from '../../services/leveling/leveling.js';

import { getEconomyData } from '../../utils/economy.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Посмотреть профиль пользователя')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, чей профиль нужно посмотреть')
                .setRequired(false)
        )
        .setDMPermission(false),

    category: 'Community',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);

        if (!deferred) return;

        const targetUser =
            interaction.options.getUser('user') || interaction.user;

        const guildId = interaction.guildId;

        const member = await interaction.guild.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!member) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Не удалось найти этого пользователя на сервере.',
            });
        }

        const [levelData, levelingConfig, economyData] = await Promise.all([
            getUserLevelData(client, guildId, targetUser.id),
            getLevelingConfig(client, guildId),
            getEconomyData(client, guildId, targetUser.id),
        ]);

        const level = levelData?.level ?? 0;
        const xp = Math.max(0, levelData?.xp ?? 0);
        const totalXp = Math.max(0, levelData?.totalXp ?? 0);

        const nextLevel = level + 1;
        const xpRequired = Math.max(
            0,
            getXpForLevel(nextLevel)
        );

        const progress = xpRequired > 0
            ? Math.min(100, Math.floor((xp / xpRequired) * 100))
            : 100;

        const wallet = economyData?.wallet ?? 0;
        const bank = economyData?.bank ?? 0;

        const totalMoney = wallet + bank;

        const embed = new EmbedBuilder()
            .setColor(getProfileColor(level))
            .setAuthor({
                name: member.displayName,
                iconURL: member.displayAvatarURL({
                    extension: 'png',
                    size: 128,
                }),
            })
            .setThumbnail(
                member.displayAvatarURL({
                    extension: 'png',
                    size: 256,
                })
            )
            .setDescription(
                [
                    `**${targetUser.username}**`,
                    '',
                    `✦ **LEVEL ${level}**`,
                    `${createProgressBar(progress, 20)} **${progress}%**`,
                    `\`${xp.toLocaleString('ru-RU')} / ${xpRequired.toLocaleString('ru-RU')} XP\``,
                ].join('\n')
            )
            .addFields(
                {
                    name: '💰 Баланс',
                    value: `**$${totalMoney.toLocaleString('ru-RU')}**`,
                    inline: true,
                },
                {
                    name: '⭐ Всего XP',
                    value: `**${totalXp.toLocaleString('ru-RU')}**`,
                    inline: true,
                },
                {
                    name: '🏆 Уровень',
                    value: `**${level}**`,
                    inline: true,
                },
                {
                    name: '📅 На сервере',
                    value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                    inline: true,
                },
                {
                    name: '💵 Кошелёк',
                    value: `$${wallet.toLocaleString('ru-RU')}`,
                    inline: true,
                },
                {
                    name: '🏦 Банк',
                    value: `$${bank.toLocaleString('ru-RU')}`,
                    inline: true,
                },
            )
            .setFooter({
                text: `TitanBot • ${interaction.guild.name}`,
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`profile_badges:${targetUser.id}`)
                .setLabel('Badges')
                .setEmoji('🏅')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`profile_stats:${targetUser.id}`)
                .setLabel('Statistics')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary),
        );

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [buttons],
        });
    },
};

function createProgressBar(progress, size = 20) {
    const filled = Math.round((progress / 100) * size);
    const empty = size - filled;

    return `\`${'█'.repeat(filled)}${'░'.repeat(empty)}\``;
}

function getProfileColor(level) {
    if (level >= 100) return '#f1c40f';
    if (level >= 50) return '#9b59b6';
    if (level >= 25) return '#3498db';
    if (level >= 10) return '#2ecc71';

    return '#5865F2';
}
