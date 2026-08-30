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
 *
 * Поддерживаемые данные:
 * - level
 * - xp
 * - totalXp
 * - wallet
 * - bank
 * - balance
 * - daysOnServer
 * - earlyMember
 * - serverBooster
 * - robCount
 * - member
 * - user
 * - guild
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


/**
 * ============================================================
 * BUILD ACHIEVEMENT CONTEXT
 * ============================================================
 */

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
        /**
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


        /**
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


        /**
         * ======================================================
         * MEMBER
         * ======================================================
         */

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);


        /**
         * ======================================================
         * USER
         * ======================================================
         */

        const user =
            member?.user ||
            await client.users
                ?.fetch(userId)
                .catch(() => null);


        /**
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


        /**
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


        /**
         * ======================================================
         * ROB COUNT
         * ======================================================
         *
         * Поддержка будущих достижений вида:
         *
         * {
         *     type: 'robCount',
         *     value: 10
         * }
         *
         * Если счётчик ещё не существует в экономике,
         * безопасно используем 0.
         */

        const robCount =
            Number(
                economyData?.robCount
            ) || 0;


        /**
         * ======================================================
         * SERVER MEMBERSHIP
         * ======================================================
         */

        let daysOnServer = 0;

        if (
            member?.joinedTimestamp
        ) {
            const millisecondsOnServer =
                Math.max(
                    0,
                    Date.now() -
                    member.joinedTimestamp
                );

            daysOnServer =
                Math.floor(
                    millisecondsOnServer /
                    (
                        24 *
                        60 *
                        60 *
                        1000
                    )
                );
        }


        /**
         * ======================================================
         * SPECIAL — SERVER BOOSTER
         * ======================================================
         */

        const serverBooster =
            Boolean(
                member?.premiumSinceTimestamp
            );


        /**
         * ======================================================
         * SPECIAL — EARLY MEMBER
         * ======================================================
         *
         * Первые 10 участников сервера считаются
         * ранними участниками.
         *
         * Discord API не гарантирует, что обычный fetch
         * участников вернёт весь сервер.
         *
         * Поэтому:
         *
         * 1. Сначала используем уже загруженный cache.
         * 2. Если пользователя там недостаточно — пробуем
         *    получить участников через fetch.
         * 3. Ошибка не ломает систему достижений.
         */

        let earlyMember = false;

        try {
            let members =
                guild.members.cache;

            /*
             * Если пользователь уже находится в cache,
             * используем его.
             *
             * Если cache маленький, пытаемся получить
             * дополнительные данные.
             */

            if (
                !members.has(userId) ||
                members.size < 10
            ) {
                const fetchedMembers =
                    await guild.members
                        .fetch({
                            withPresences: false,
                            limit: 100,
                        })
                        .catch(() => null);

                if (
                    fetchedMembers &&
                    fetchedMembers.size > 0
                ) {
                    members =
                        fetchedMembers;
                }
            }

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
                            guildMember.id ===
                            userId
                    );

                if (
                    memberIndex !== -1 &&
                    memberIndex < 10
                ) {
                    earlyMember = true;
                }
            }
        } catch (error) {
            logger.debug(
                `[ACHIEVEMENTS] Не удалось определить earlyMember ` +
                `для ${userId}:`,
                error?.message
            );

            earlyMember = false;
        }


        /**
         * ======================================================
         * RETURN CONTEXT
         * ======================================================
         */

        return {
            /*
             * Идентификаторы
             */

            userId,
            guildId: guild.id,

            /*
             * Discord entities
             */

            guild,
            member,
            user,

            /*
             * Leveling
             */

            level,
            xp,
            totalXp,

            /*
             * Economy
             */

            wallet,
            bank,
            balance,

            /*
             * Activity
             */

            robCount,

            /*
             * Membership
             */

            daysOnServer,

            /*
             * Special
             */

            earlyMember,
            serverBooster,
        };
    } catch (error) {
        logger.error(
            `[ACHIEVEMENTS] Failed to build context for ${userId}:`,
            error
        );

        /*
         * Возвращаем безопасный context,
         * чтобы проверка достижений никогда
         * не ломала основную команду.
         */

        return {
            userId,
            guildId: guild?.id || null,

            guild,
            member: null,
            user: null,

            level: 0,
            xp: 0,
            totalXp: 0,

            wallet: 0,
            bank: 0,
            balance: 0,

            robCount: 0,

            daysOnServer: 0,

            earlyMember: false,
            serverBooster: false,
        };
    }
}
