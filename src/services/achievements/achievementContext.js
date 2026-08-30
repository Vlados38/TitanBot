import {
  getUserLevelData,
} from '../leveling/leveling.js';

import {
  getEconomyData,
} from '../../utils/economy.js';

/**
 * ============================================================
 * TITANBOT — ACHIEVEMENT CONTEXT
 * ============================================================
 *
 * Собирает актуальные данные пользователя,
 * необходимые AchievementService для проверки
 * условий достижений.
 *
 * Здесь НЕ выдаются достижения.
 * Здесь только собирается context.
 * ============================================================
 */

export async function buildAchievementContext({
  client,
  guild,
  userId,
}) {
  if (
    !client ||
    !guild ||
    !userId
  ) {
    return {
      userId,
      guildId: guild?.id ?? null,

      level: 0,
      totalXp: 0,

      wallet: 0,
      bank: 0,
      balance: 0,

      joinedAt: null,
      daysOnServer: 0,

      earlyMember: false,
      serverBooster: false,
    };
  }

  /*
   * ==========================================================
   * USER DATA
   * ==========================================================
   */

  const [
    levelData,
    economyData,
    member,
  ] = await Promise.all([
    getUserLevelData(
      client,
      guild.id,
      userId
    ),

    getEconomyData(
      client,
      guild.id,
      userId
    ),

    guild.members
      .fetch(userId)
      .catch(() => null),
  ]);

  /*
   * ==========================================================
   * LEVELING
   * ==========================================================
   */

  const level =
    Number(
      levelData?.level
    ) || 0;

  const totalXp =
    Number(
      levelData?.totalXp
    ) || 0;

  /*
   * ==========================================================
   * ECONOMY
   * ==========================================================
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
   * ==========================================================
   * SERVER MEMBERSHIP
   * ==========================================================
   */

  const joinedAt =
    member?.joinedTimestamp ??
    null;

  const daysOnServer =
    joinedAt
      ? Math.max(
          0,
          Math.floor(
            (
              Date.now() -
              joinedAt
            ) /
              (
                1000 *
                60 *
                60 *
                24
              )
          )
        )
      : 0;

  /*
   * ==========================================================
   * SERVER BOOSTER
   * ==========================================================
   *
   * premiumSinceTimestamp существует,
   * если пользователь сейчас бустит сервер.
   */

  const serverBooster =
    Boolean(
      member?.premiumSinceTimestamp
    );

  /*
   * ==========================================================
   * EARLY MEMBER
   * ==========================================================
   *
   * Пока оставляем false.
   *
   * Логику "раннего участника" подключим отдельно,
   * потому что нужно определить конкретное правило:
   *
   * например:
   * - первые 10 участников;
   * - первые 25;
   * - первые 50.
   *
   * Это нельзя надёжно определить только по
   * joinedTimestamp без дополнительного правила.
   */

  const earlyMember = false;

  /*
   * ==========================================================
   * RETURN CONTEXT
   * ==========================================================
   */

  return {
    userId,
    guildId:
      guild.id,

    /*
     * Progression / Activity
     */

    level,
    totalXp,

    /*
     * Economy
     */

    wallet,
    bank,
    balance,

    /*
     * Membership
     */

    joinedAt,
    daysOnServer,

    /*
     * Special
     */

    earlyMember,
    serverBooster,
  };
}
