import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Заблокировать пользователя на сервере")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Пользователь, которого нужно заблокировать")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Причина блокировки"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "Причина не указана";

        if (!user) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'Вы должны указать пользователя для блокировки.',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotError(
                'Cannot ban self',
                ErrorTypes.VALIDATION,
                'Вы не можете заблокировать себя.',
            );
        }
        if (user.id === client.user.id) {
            throw new TitanBotError(
                'Cannot ban bot',
                ErrorTypes.VALIDATION,
                'Вы не можете заблокировать бота.',
            );
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild,
            user,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `🚫 **Пользователь заблокирован** ${user.tag}`,
                    `**Причина:** ${reason}\n**ID случая:** #${result.caseId}`,
                ),
            ],
        });
    },
};
