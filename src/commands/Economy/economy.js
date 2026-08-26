// ==================== /economy ====================
// Команда управления экономикой сервера.
// Все пользовательские описания переведены на русский.

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import economyDashboard from './modules/economy_dashboard.js';

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Команды управления экономикой')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Открыть панель управления экономикой')
        ),

    category: 'Экономика',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });

        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            await economyDashboard.execute(interaction, config, client);
        }
    }
};
