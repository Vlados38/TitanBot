import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Настройка параметров магазина. (Требуется право «Управление сервером»)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Установить Discord-роль, которая будет выдаваться при покупке предмета Premium Role.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Роль, которая будет выдаваться при покупке Premium Role.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
};
