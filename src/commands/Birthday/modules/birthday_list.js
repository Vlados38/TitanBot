import { EmbedBuilder } from 'discord.js';
import { getAllBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const guildId = interaction.guildId;

        const sortedBirthdays = await getAllBirthdays(client, guildId);

        if (sortedBirthdays.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Дни рождения отсутствуют')
                .setDescription('В этом сервере ещё не указаны дни рождения.');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        const userIds = sortedBirthdays.map(b => b.userId);
        const fetchedMembers = await interaction.guild.members.fetch({ user: userIds }).catch(() => null);

        let birthdayList = '';
        let displayIndex = 0;
        const staleUserIds = [];

        for (const birthday of sortedBirthdays) {
            if (fetchedMembers && !fetchedMembers.has(birthday.userId)) {
                staleUserIds.push(birthday.userId);
                continue;
            }

            displayIndex++;
            birthdayList += `${displayIndex}. <@${birthday.userId}> - ${birthday.monthName} ${birthday.day}\n`;
        }

        if (fetchedMembers && staleUserIds.length > 0) {
            for (const userId of staleUserIds) {
                deleteBirthday(client, guildId, userId).catch(() => null);
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Дни рождения отсутствуют')
                .setDescription('У нынешних участников сервера не указаны дни рождения.');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        birthdayList =
            `**${displayIndex} ${displayIndex === 1 ? 'день рождения' : 'дней рождения'} на сервере ${interaction.guild.name}**\n\n` +
            birthdayList;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Дни рождения на сервере')
            .setDescription(
                `${birthdayList}\n\n` +
                `Всего: ${displayIndex} ${displayIndex === 1 ? 'день рождения' : 'дней рождения'}`
            );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Birthday list retrieved successfully', {
            userId: interaction.user.id,
            guildId,
            birthdayCount: displayIndex,
            staleRemoved: staleUserIds.length,
            commandName: 'birthday_list'
        });
    }
};
