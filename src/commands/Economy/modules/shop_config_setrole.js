import { PermissionsBitField } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Вам нужны права **Управление сервером**, чтобы установить премиум-роль.',
            });
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = role.id;

            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        'Премиум-роль установлена',
                        `**Премиум-роль магазина** установлена на ${role.toString()}. Участники, которые приобретут предмет «Премиум-роль», получат эту роль.`,
                    ),
                ],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Не удалось сохранить настройки сервера.',
            });
        }
    },
};
