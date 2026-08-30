/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT CONTEXT
 * ============================================================
 *
 * Собирает актуальные данные пользователя для проверки
 * достижений.
 *
 * ВАЖНО:
 * Этот файл ничего не изменяет в БД.
 * Он только собирает данные.
 * ============================================================
 */

import {
    getUserLevelData,
} from '../leveling/leveling.js';

import {
    getEconomyData,
} from '../../utils/economy.js';

import {
    logger,
} from '../../utils/logger.js';


export async function buildAchievementContext({
    client,
    guild,
    userId,
} = {}) {
    if (
        !client ||
        !guild ||
        !userId
    ) {
        return {};
    }

    try {
        /*
         * ======================================================
         * LEVEL / XP
         * ======================================================
         */

        const levelData =
            await getUserLevelData(
                client,
                guild.id,
                userId
            );

        /*
         * ======================================================
         * ECONOMY
         * ======================================================
         */

        const economyData =
            await getEconomyData(
                client,
                guild.id,
                userId
            );

        /*
         * ======================================================
         * MEMBER
         * ======================================================
         */

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        /*
         * ======================================================
         * LEVEL
         * ======================================================
         */

        const level =
            Number(
                levelData?.level
            ) || 0;

        const xp =
            Number(
                levelData?.xp
            ) || 0;

        const totalXp =
            Number(
                levelData?.totalXp
            ) || 0;

        /*
         * ======================================================
         * ECONOMY
         * ======================================================
         */

        const wallet =
            Number(
                economyData?.wallet
            ) || 0;

        const bank =
            Number(
                economyData?.bank
            ) || 0;

        const balance =
            wallet + bank;

        /*
         * ======================================================
         * SERVER MEMBERSHIP
         * ======================================================
         */

        let daysOnServer = 0;

        if (
            member?.joinedTimestamp
        ) {
            const millisecondsOnServer =
                Date.now() -
                member.joinedTimestamp;

            daysOnServer =
                Math.floor(
                    millisecondsOnServer /
                    (24 * 60 * 60 * 1000)
                );
        }

        /*
         * ======================================================
         * SPECIAL
         * ======================================================
         */

        const serverBooster =
            Boolean(
                member?.premiumSinceTimestamp
            );

        /*
         * Early member.
         *
         * Здесь используется позиция пользователя
         * среди участников сервера.
         *
         * Первые 10 участников считаются ранними.
         *
         * Если сервер уже большой, Discord может не вернуть
         * полный список участников — поэтому ошибка безопасно
         * превращается в false.
         */

        let earlyMember = false;

        try {
            const members =
                await guild.members
                    .fetch({
                        withPresences: false,
                        limit: 100,
                    })
                    .catch(() => null);

            if (
                members &&
                members.size > 0
            ) {
                const sortedMembers =
                    [...members.values()]
                        .filter(
                            (guildMember) =>
                                guildMember.joinedTimestamp
                        )
                        .sort(
                            (a, b) =>
                                a.joinedTimestamp -
                                b.joinedTimestamp
                        );

                const memberIndex =
                    sortedMembers.findIndex(
                        (guildMember) =>
                            guildMember.id === userId
                    );

                if (
                    memberIndex !== -1 &&
                    memberIndex < 10
                ) {
                    earlyMember = true;
                }
            }
        } catch {
            earlyMember = false;
        }

        /*
         * ======================================================
         * RETURN CONTEXT
         * ======================================================
         */

        return {
            userId,
            guildId: guild.id,

            level,
            xp,
            totalXp,

            wallet,
            bank,
            balance,

            daysOnServer,

            earlyMember,
            serverBooster,

            member,
        };

    } catch (error) {
        logger.error(
            `[ACHIEVEMENTS] Failed to build context for ${userId}:`,
            error
        );

        /*
         * Возвращаем безопасный context,
         * чтобы проверка достижений не ломала команду.
         */

        return {
            userId,
            guildId: guild.id,

            level: 0,
            xp: 0,
            totalXp: 0,

            wallet: 0,
            bank: 0,
            balance: 0,

            daysOnServer: 0,

            earlyMember: false,
            serverBooster: false,

            member: null,
        };
    }
}
