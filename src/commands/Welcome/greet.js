import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import greetDashboard from './modules/greet_dashboard.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Управление настройками приветствия и прощания')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Открыть панель настройки приветствий и прощаний'),
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Для использования `/greet` необходимо право **Управление сервером**.'
                });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Неизвестная подкоманда /greet: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: error.userMessage || 'Что-то пошло не так.'
                });
            }

            await handleInteractionError(interaction, error, { command: 'greet' });
        }
    },
};
