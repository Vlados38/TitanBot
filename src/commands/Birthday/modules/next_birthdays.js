import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

        if (next5.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Дни рождения не найдены')
                .setDescription('На этом сервере ещё не указаны дни рождения. Используйте `/birthday set`, чтобы добавить свой день рождения!');

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let displayIndex = 0;

        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);

            if (!member) {
                deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                continue;
            }

            displayIndex++;

            let timeUntil = '';

            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Сегодня!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Завтра!**';
            } else {
                timeUntil = `Через ${birthday.daysUntil} ${birthday.daysUntil > 1 ? 'дн.' : 'день'}`;
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Предстоящих дней рождения нет')
                .setDescription('У текущих участников сервера нет предстоящих дней рождения.');

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let birthdayList =
            `🎂 **Ближайшие 5 дней рождения**\n\n` +
            `Вот ближайшие 5 дней рождения на сервере ${interaction.guild.name}:\n\n`;

        displayIndex = 0;

        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);

            if (!member) {
                continue;
            }

            displayIndex++;

            let timeUntil = '';

            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Сегодня!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Завтра!**';
            } else {
                timeUntil = `Через ${birthday.daysUntil} ${birthday.daysUntil > 1 ? 'дн.' : 'день'}`;
            }

            birthdayList +=
                `${displayIndex}. **${member.displayName}**\n` +
                `<@${birthday.userId}>\n` +
                `📅 **Дата:** ${birthday.monthName} ${birthday.day}\n` +
                `⏰ **Когда:** ${timeUntil}\n\n`;
        }

        birthdayList += `Используйте /birthday set, чтобы добавить свой день рождения!`;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Ближайшие 5 дней рождения')
            .setDescription(birthdayList);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Next birthdays retrieved successfully', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'next_birthdays'
        });
    }
};
