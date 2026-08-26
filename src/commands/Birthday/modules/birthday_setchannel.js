import { PermissionsBitField, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Недостаточно прав')
                .setDescription('Для настройки канала дней рождения вам необходимо право **Управление сервером**.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('Уведомления о днях рождения включены')
                    .setDescription(`Теперь уведомления о днях рождения будут отправляться в ${channel}.`);

                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);

                const embed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setTitle('Уведомления о днях рождения отключены')
                    .setDescription('Канал не указан — уведомления о днях рождения были отключены.');

                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            logger.error('birthday_setchannel error:', error);

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ Ошибка настройки')
                .setDescription('Не удалось сохранить настройки канала для дней рождения.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
