import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || '{username} - Комната';
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Создать комнату',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                '✅ Настройка «Создать комнату» завершена',
                `Канал-триггер создан: ${triggerChannel}\n\n` +
                `**Настройки:**\n` +
                `• Шаблон имени временной комнаты: \`${nameTemplate}\`\n` +
                `• Лимит пользователей: ${userLimit === 0 ? 'Без ограничений' : userLimit + ' пользователей'}\n` +
                `• Битрейт: ${bitrate} кбит/с\n` +
                `${category ? `• Категория: ${category.name}` : '• Категория: Нет (корневой уровень)'}\n\n` +
                `Когда пользователь зайдёт в этот канал, для него автоматически будет создан временный голосовой канал.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Ошибка при ответе на взаимодействие:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('Не удалось выполнить ни одну попытку ответа:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Ошибка при настройке «Создать комнату»:', error);
            throw new TitanBotError(
                `Настройка завершилась с ошибкой: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'Не удалось настроить систему автоматического создания голосовых комнат.'
            );
        }
    }
};
