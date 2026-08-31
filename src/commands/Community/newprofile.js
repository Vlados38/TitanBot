import {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    getUserLevelData,
    getXpForLevel,
} from '../../services/leveling/leveling.js';

import {
    getEconomyData,
} from '../../utils/economy.js';

import {
    getUserAchievementProfile,
} from '../../services/achievements/achievementService.js';

import {
    generateProfileCard,
} from '../../services/profile/profileCard.js';

import {
    generateAchievementCard,
} from '../../services/profile/achievementCard.js';

import {
    generateStatisticsCard,
} from '../../services/profile/statisticsCard.js';


/* =========================================================
 * COMMAND
 * ======================================================= */

export default {
    data: new SlashCommandBuilder()
        .setName('newprofile')
        .setDescription('Открыть карточку авантюриста')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Пользователь')
                .setRequired(false)
        )
        .setDMPermission(false),

    category: 'Community',

    async execute(
        interaction,
        config,
        client
    ) {
        await interaction.deferReply();

        const targetUser =
            interaction.options.getUser('user') ??
            interaction.user;

        const guild =
            interaction.guild;

        if (!guild) {
            return interaction.editReply({
                content:
                    '❌ Эта команда доступна только на сервере.',
            });
        }

        const member =
            await guild.members
                .fetch(targetUser.id)
                .catch(() => null);

        if (!member) {
            return interaction.editReply({
                content:
                    '❌ Пользователь не найден на этом сервере.',
            });
        }

        try {
            const profileData =
                await loadProfileData({
                    client,
                    guild,
                    member,
                    user: targetUser,
                });

            const result =
                await renderNewProfilePage({
                    page: 'profile',
                    data: profileData,
                });

            const attachment =
                new AttachmentBuilder(
                    result.buffer,
                    {
                        name:
                            `newprofile-${targetUser.id}.png`,
                    }
                );

            return interaction.editReply({
                content: '',
                files: [attachment],
                components:
                    buildNavigationButtons(
                        targetUser.id,
                        'profile',
                        0,
                        1
                    ),
            });

        } catch (error) {
            console.error(
                '[NEWPROFILE] Failed to open profile:',
                error
            );

            return interaction.editReply({
                content:
                    '❌ Не удалось открыть эту страницу профиля.',
            });
        }
    },
};


/* =========================================================
 * LOAD PROFILE DATA
 * ======================================================= */

export async function loadProfileData({
    client,
    guild,
    member,
    user,
}) {
    const [
        levelData,
        economyData,
        achievementProfile,
    ] = await Promise.all([
        getUserLevelData(
            client,
            guild.id,
            user.id
        ),

        getEconomyData(
            client,
            guild.id,
            user.id
        ),

        getUserAchievementProfile(
            client,
            guild.id,
            user.id
        ),
    ]);

    const level =
        Math.max(
            0,
            Number(levelData?.level) || 0
        );

    const xp =
        Math.max(
            0,
            Number(levelData?.xp) || 0
        );

    const totalXp =
        Math.max(
            0,
            Number(levelData?.totalXp) || 0
        );

    const nextLevel =
        level + 1;

    let nextLevelXp = 0;

    try {
        nextLevelXp =
            Number(
                getXpForLevel(nextLevel)
            ) || 0;
    } catch {
        nextLevelXp = 0;
    }

    const wallet =
        Math.max(
            0,
            Number(
                economyData?.wallet
            ) || 0
        );

    const bank =
        Math.max(
            0,
            Number(
                economyData?.bank
            ) || 0
        );

    const totalBalance =
        wallet + bank;

    const achievements =
        Array.isArray(
            achievementProfile?.achievements
        )
            ? achievementProfile.achievements
            : [];

    const unlockedAchievements =
        achievements.filter(
            (achievement) =>
                achievement?.unlocked
        );

    const joinedAt =
        member.joinedTimestamp
            ? new Date(
                member.joinedTimestamp
            )
            : null;

    const createdAt =
        user.createdAt
            ? new Date(
                user.createdAt
            )
            : null;

    return {
        user,
        member,

        level,
        xp,
        totalXp,

        nextLevel,
        nextLevelXp,

        wallet,
        bank,
        totalBalance,

        achievements,
        unlockedAchievements,

        joinedAt,
        createdAt,
    };
}


/* =========================================================
 * NAVIGATION BUTTONS
 * ======================================================= */

export function buildNavigationButtons(
    targetUserId,
    currentPage = 'profile',
    achievementPage = 0,
    totalAchievementPages = 1
) {
    const buttons = [];


    /* -----------------------------------------------------
     * PROFILE
     * --------------------------------------------------- */

    buttons.push(
        new ButtonBuilder()
            .setCustomId(
                `newprofile:profile:${targetUserId}`
            )
            .setLabel('Профиль')
            .setEmoji('👤')
            .setStyle(
                currentPage === 'profile'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary
            )
    );


    /* -----------------------------------------------------
     * ACHIEVEMENTS
     * --------------------------------------------------- */

    buttons.push(
        new ButtonBuilder()
            .setCustomId(
                `newprofile:achievements:${targetUserId}:0`
            )
            .setLabel('Достижения')
            .setEmoji('🏆')
            .setStyle(
                currentPage === 'achievements'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary
            )
    );


    /* -----------------------------------------------------
     * STATISTICS
     * --------------------------------------------------- */

    buttons.push(
        new ButtonBuilder()
            .setCustomId(
                `newprofile:statistics:${targetUserId}`
            )
            .setLabel('Статистика')
            .setEmoji('📊')
            .setStyle(
                currentPage === 'statistics'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary
            )
    );


    /* -----------------------------------------------------
     * PAGINATION
     *
     * ВАЖНО:
     * Не используем .setEmoji('‹') / .setEmoji('›').
     *
     * ‹ и › — Unicode-символы, но Discord ожидает
     * настоящее emoji в .setEmoji().
     * Поэтому стрелки находятся непосредственно
     * в тексте кнопки.
     * --------------------------------------------------- */

    if (
        currentPage === 'achievements' &&
        totalAchievementPages > 1
    ) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(
                    `newprofile:achievements:${targetUserId}:${Math.max(
                        0,
                        achievementPage - 1
                    )}`
                )
                .setLabel('← Назад')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    achievementPage <= 0
                ),

            new ButtonBuilder()
                .setCustomId(
                    `newprofile:achievements:${targetUserId}:${Math.min(
                        totalAchievementPages - 1,
                        achievementPage + 1
                    )}`
                )
                .setLabel('Далее →')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    achievementPage >=
                    totalAchievementPages - 1
                )
        );
    }


    return [
        new ActionRowBuilder()
            .addComponents(buttons),
    ];
}


/* =========================================================
 * RENDER PAGE
 * ======================================================= */

export async function renderNewProfilePage({
    page,
    data,
    achievementPage = 0,
}) {
    /* -----------------------------------------------------
     * PROFILE
     * --------------------------------------------------- */

    if (page === 'profile') {
        return {
            buffer:
                await generateProfileCard(
                    data
                ),

            currentPage:
                'profile',

            achievementPage:
                0,

            totalAchievementPages:
                1,
        };
    }


    /* -----------------------------------------------------
     * ACHIEVEMENTS
     * --------------------------------------------------- */

    if (page === 'achievements') {
        const result =
            await generateAchievementCard(
                data,
                achievementPage
            );

        return {
            buffer:
                result.buffer,

            currentPage:
                'achievements',

            achievementPage:
                result.page,

            totalAchievementPages:
                result.totalPages,
        };
    }


    /* -----------------------------------------------------
     * STATISTICS
     * --------------------------------------------------- */

    if (page === 'statistics') {
        return {
            buffer:
                await generateStatisticsCard(
                    data
                ),

            currentPage:
                'statistics',

            achievementPage:
                0,

            totalAchievementPages:
                1,
        };
    }


    throw new Error(
        `Unknown newprofile page: ${page}`
    );
}


/* =========================================================
 * HANDLE BUTTON
 * ======================================================= */

export async function handleNewProfileButton(
    interaction,
    client
) {
    const customId =
        interaction.customId;

    if (
        !customId ||
        !customId.startsWith(
            'newprofile:'
        )
    ) {
        return false;
    }


    console.log(
        `[NEWPROFILE BUTTON] ${customId}`
    );


    /* -----------------------------------------------------
     * PARSE
     * --------------------------------------------------- */

    const parts =
        customId.split(':');

    const action =
        parts[1];

    const targetUserId =
        parts[2];

    const achievementPage =
        parts[3]
            ? Number(parts[3])
            : 0;


    if (
        !action ||
        !targetUserId
    ) {
        return false;
    }


    /* -----------------------------------------------------
     * ACKNOWLEDGE BUTTON
     * --------------------------------------------------- */

    await interaction.deferUpdate();


    try {
        const guild =
            interaction.guild;

        if (!guild) {
            return true;
        }


        /* -------------------------------------------------
         * TARGET USER
         * ----------------------------------------------- */

        const targetUser =
            await client.users.fetch(
                targetUserId
            );


        /* -------------------------------------------------
         * MEMBER
         * ----------------------------------------------- */

        const member =
            await guild.members
                .fetch(targetUserId)
                .catch(() => null);

        if (!member) {
            await interaction.editReply({
                content:
                    '❌ Пользователь больше не находится на сервере.',
                embeds: [],
                files: [],
                components: [],
            });

            return true;
        }


        /* -------------------------------------------------
         * LOAD DATA
         * ----------------------------------------------- */

        const profileData =
            await loadProfileData({
                client,
                guild,
                member,
                user: targetUser,
            });


        /* -------------------------------------------------
         * DETERMINE PAGE
         * ----------------------------------------------- */

        let page;

        if (action === 'profile') {
            page = 'profile';
        } else if (action === 'achievements') {
            page = 'achievements';
        } else if (action === 'statistics') {
            page = 'statistics';
        } else {
            throw new Error(
                `Unknown newprofile action: ${action}`
            );
        }


        /* -------------------------------------------------
         * RENDER
         * ----------------------------------------------- */

        const result =
            await renderNewProfilePage({
                page,
                data: profileData,
                achievementPage,
            });


        /* -------------------------------------------------
         * ATTACHMENT
         * ----------------------------------------------- */

        const attachment =
            new AttachmentBuilder(
                result.buffer,
                {
                    name:
                        `newprofile-${targetUserId}.png`,
                }
            );


        /* -------------------------------------------------
         * BUTTONS
         * ----------------------------------------------- */

        const components =
            buildNavigationButtons(
                targetUserId,
                result.currentPage,
                result.achievementPage,
                result.totalAchievementPages
            );


        /* -------------------------------------------------
         * UPDATE ORIGINAL MESSAGE
         * ----------------------------------------------- */

        await interaction.editReply({
            content: '',
            embeds: [],
            files: [attachment],
            components,
        });


        return true;

    } catch (error) {
        console.error(
            '[NEWPROFILE BUTTON] Failed:',
            error
        );

        try {
            await interaction.editReply({
                content:
                    '❌ Не удалось открыть эту страницу профиля.',
                embeds: [],
                files: [],
                components: [],
            });
        } catch (editError) {
            console.error(
                '[NEWPROFILE BUTTON] Failed to send error:',
                editError
            );
        }

        return true;
    }
}
