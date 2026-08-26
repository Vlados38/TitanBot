import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Показать аватар пользователя")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription(
                    "Пользователь, чей аватар вы хотите посмотреть (по умолчанию — вы)",
                ),
        ),

    async execute(interaction) {
        const user = interaction.options.getUser("target") || interaction.user;
        const avatarUrl = user.displayAvatarURL({ size: 2048, dynamic: true });

        const embed = createEmbed({
            title: `Аватар пользователя ${user.username}`,
            description: `[Скачать аватар](${avatarUrl})`
        })
            .setImage(avatarUrl);

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });

        logger.info(`Команда avatar выполнена`, {
            userId: interaction.user.id,
            targetUserId: user.id,
            guildId: interaction.guildId
        });
    }
};
