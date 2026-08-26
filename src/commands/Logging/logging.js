import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import channel from './modules/logging_channel.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Управление логированием сервера — каналы, фильтры и категории событий.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Открыть панель логирования — настроить каналы, фильтры и категории.')
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('channel')
                .setDescription('Быстро настроить канал логирования без открытия панели.')
                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('Какое назначение логирования настроить.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Аудит (модерация, сообщения, участники…)', value: 'audit' },
                            { name: 'Заявки', value: 'applications' },
                            { name: 'Жалобы', value: 'reports' },
                        ),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Текстовый канал для логов.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Установите True, чтобы очистить этот канал логирования.')
                        .setRequired(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'channel') {
                return await channel.execute(interaction, config, client);
            }

            await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Эта подкоманда не распознана.' });
        } catch (error) {
            logger.error('logging command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла непредвиденная ошибка.' }).catch(() => {});
        }
    },
};
