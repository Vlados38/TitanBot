import {
  getUserLevelData,
} from '../leveling/leveling.js';

import {
  getEconomyData,
} from '../../utils/economy.js';

/**
 * Собирает данные, необходимые AchievementService.
 *
 * Это единственная точка, которая знает,
 * откуда брать реальные данные TitanBot.
 */
export async function buildAchievementContext({
  client,
  guild,
  userId,
}) {
  const [levelData, economyData] = await Promise.all([
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
  ]);

  const member = await guild.members
    .fetch(userId)
    .catch(() => null);

  const joinedAt = member?.joinedTimestamp ?? null;

  const daysOnServer = joinedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - joinedAt) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const level = Number(levelData?.level) || 0;
  const totalXp = Number(levelData?.totalXp) || 0;

  const wallet = Number(economyData?.wallet) || 0;
  const bank = Number(economyData?.bank) || 0;

  return {
    userId,
    guildId: guild.id,

    level,
    totalXp,

    wallet,
    bank,
    balance: wallet + bank,

    joinedAt,
    daysOnServer,

    /*
     * Эти поля пока намеренно оставляем false.
     *
     * Когда подключим соответствующие системы,
     * сюда можно будет передать реальные значения.
     */
    earlyMember: false,
    serverBooster: Boolean(member?.premiumSinceTimestamp),
  };
}
