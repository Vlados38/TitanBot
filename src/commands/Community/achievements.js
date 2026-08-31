/**
 * ============================================================
 * TITANBOT — /achievements
 * ============================================================
 *
 * Отдельная команда достижений.
 *
 * Без Canvas / PNG.
 * Использует обычные Discord Embeds + Buttons.
 */

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getUserAchievementProfile,
    getAchievementRarity,
    getAchievementCategory,
} from '../../services/achievements/achievementService.js';

export const data = new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('Просмотреть достижения пользователя')
    .addUserOption(option =>
        option
            .setName('user')
            .setDescription('Пользователь, достижения которого посмотреть')
            .setRequired(false)
    );

export const category = 'Community';

export async function execute(
    interaction,
    guildConfig,
    client
) {
    const targetUser =
        interaction.options.getUser('user') ||
        interaction.user;

    if (!interaction.guild) {
        return interaction.reply({
            content:
                '❌ Эта команда доступна только на сервере.',
            ephemeral: true,
        });
    }

    await interaction.deferReply();

    const profile =
        await getUserAchievementProfile(
            client,
            interaction.guild.id,
            targetUser.id
        );

    const page = 0;

    const payload =
        buildAchievementsPage({
            profile,
            targetUser,
            page,
        });

    await interaction.editReply(payload);
}

/**
 * ============================================================
 * PAGE BUILDER
 * ============================================================
 */

export function buildAchievementsPage({
    profile,
    targetUser,
    page = 0,
}) {
    const achievements =
        Array.isArray(profile?.achievements)
            ? profile.achievements
            : [];

    const progress =
        profile?.progress || {
            total: achievements.length,
            unlocked: 0,
            remaining: achievements.length,
            percentage: 0,
        };

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                achievements.length / ACHIEVEMENTS_PER_PAGE
            )
        );

    const safePage =
        Math.min(
            Math.max(Number(page) || 0, 0),
            totalPages - 1
        );

    const start =
        safePage * ACHIEVEMENTS_PER_PAGE;

    const pageAchievements =
        achievements.slice(
            start,
            start + ACHIEVEMENTS_PER_PAGE
        );

    const embed =
        new EmbedBuilder()
            .setColor('#5865F2')
            .setAuthor({
                name:
                    `🏆 Достижения • ${targetUser.displayName}`,
                iconURL:
                    targetUser.displayAvatarURL({
                        extension: 'png',
                        size: 128,
                    }),
            })
            .setDescription(
                [
                    `**Прогресс:** ${progress.unlocked}/${progress.total}`,
                    `${createProgressBar(progress.percentage)} **${progress.percentage}%**`,
                    '',
                    'Здесь отображаются все доступные достижения пользователя.',
                ].join('\n')
            );

    if (pageAchievements.length === 0) {
        embed.addFields({
            name: '📭 Пока пусто',
            value:
                'Достижения для отображения отсутствуют.',
        });
    } else {
        for (const achievement of pageAchievements) {
            embed.addFields(
                createAchievementField(
                    achievement
                )
            );
        }
    }

    embed
        .setFooter({
            text:
                `Страница ${safePage + 1}/${totalPages} • Всего достижений: ${progress.total}`,
        })
        .setTimestamp();

    return {
        embeds: [embed],
        components:
            buildAchievementsComponents({
                page: safePage,
                totalPages,
            }),
    };
}

/**
 * ============================================================
 * ACHIEVEMENT FIELD
 * ============================================================
 */

function createAchievementField(
    achievement
) {
    const rarity =
        getAchievementRarity(
            achievement.rarity
        );

    const category =
        getAchievementCategory(
            achievement.category
        );

    const unlocked =
        Boolean(achievement.unlocked);

    const icon =
        unlocked
            ? achievement.emoji || '🏆'
            : '🔒';

    const status =
        unlocked
            ? '✅ **Получено**'
            : '🔒 **Не получено**';

    const requirement =
        achievement.requirementText
            ? `Требование: **${achievement.requirementText}**`
            : '';

    const lines = [
        achievement.description ||
            'Описание отсутствует.',
        '',
        `${rarity.emoji} **${rarity.name}**`,
        category
            ? `${category.emoji} ${category.name}`
            : null,
        requirement || null,
        '',
        status,
    ].filter(Boolean);

    return {
        name:
            `${icon} ${achievement.name}`,
        value:
            lines.join('\n'),
        inline: true,
    };
}

/**
 * ============================================================
 * COMPONENTS
 * ============================================================
 */

function buildAchievementsComponents({
    page,
    totalPages,
}) {
    const navigation =
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `achievements:page:${page - 1}`
                )
                .setLabel('Назад')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 0),

            new ButtonBuilder()
                .setCustomId(
                    'achievements:current'
                )
                .setLabel(
                    `${page + 1} / ${totalPages}`
                )
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),

            new ButtonBuilder()
                .setCustomId(
                    `achievements:page:${page + 1}`
                )
                .setLabel('Далее')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(
                    page >= totalPages - 1
                )
        );

    return [navigation];
}

/**
 * ============================================================
 * PROGRESS BAR
 * ============================================================
 */

function createProgressBar(
    percentage
) {
    const total = 10;

    const filled =
        Math.round(
            (Math.max(
                0,
                Math.min(
                    100,
                    Number(percentage) || 0
                )
            ) /
                100) *
                total
        );

    return (
        '▰'.repeat(filled) +
        '▱'.repeat(total - filled)
    );
}

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const ACHIEVEMENTS_PER_PAGE = 6;
