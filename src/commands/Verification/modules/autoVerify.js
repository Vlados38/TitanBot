import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import autoVerifyDashboard from './autoVerifyDashboard.js';

const autoVerifyDefaults = botConfig.verification?.autoVerify || {};
const minAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifyDefaults.defaultAccountAgeDays ?? 7;

export default {
    data: new SlashCommandBuilder()
        .setName("autoverify")
        .setDescription("Настроить параметры автоматической верификации")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Настроить автоматическую верификацию")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Роль, которая будет выдаваться пользователям, соответствующим критериям авто-верификации")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("Критерий для автоматической верификации")
                        .addChoices(
                            { name: "Возраст аккаунта", value: "account_age" },
                            { name: "Без критериев", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Минимальный возраст аккаунта в днях (требуется для критерия возраста аккаунта)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Открыть панель автоматической верификации для настройки")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "dashboard":
                    return await autoVerifyDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Неизвестная субкоманда: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "Выбрана недействительная субкоманда.",
                        { subcommand }
                    );
            }
        }, { command: 'autoverify', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;
    const targetRole = interaction.options.getRole("role");

    await InteractionHelper.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationEnabled = Boolean(guildConfig.verification?.enabled);
        const hasAutoRoleConfigured =
            Boolean(guildConfig.autoRole) ||
            (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

        if (verificationEnabled || hasAutoRoleConfigured) {
            throw createError(
                'Активация AutoVerify заблокирована из-за конфликтующей системы приветствия',
                ErrorTypes.CONFIGURATION,
                'Вы не можете включить **AutoVerify**, пока настроена система верификации или AutoRole. Сначала отключите их.',
                {
                    guildId: guild.id,
                    verificationEnabled,
                    hasAutoRoleConfigured,
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        const botMember = guild.members.me;
        if (!botMember) {
            throw createError(
                'Участник бота не найден в кэше сервера',
                ErrorTypes.CONFIGURATION,
                'Не удалось проверить мои права на этом сервере. Пожалуйста, попробуйте ещё раз через некоторое время.',
                { guildId: guild.id }
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw createError(
                'Отсутствует разрешение ManageRoles',
                ErrorTypes.PERMISSION,
                "Мне необходимо разрешение «Управление ролями» для выдачи ролей при автоматической верификации.",
                { guildId: guild.id }
            );
        }

        if (targetRole.id === guild.id || targetRole.managed) {
            throw createError(
                'Выбрана недопустимая роль для AutoVerify',
                ErrorTypes.VALIDATION,
                'Пожалуйста, выберите обычную роль, которую можно выдавать (не @everyone и не роль, управляемую интеграцией).',
                {
                    guildId: guild.id,
                    roleId: targetRole.id,
                    managed: targetRole.managed
                }
            );
        }

        if (targetRole.position >= botMember.roles.highest.position) {
            throw createError(
                'Ошибка иерархии ролей для AutoVerify',
                ErrorTypes.PERMISSION,
                'Выбранная роль AutoVerify должна находиться ниже моей высшей роли в иерархии ролей сервера.',
                {
                    guildId: guild.id,
                    roleId: targetRole.id,
                    rolePosition: targetRole.position,
                    botRolePosition: botMember.roles.highest.position
                }
            );
        }

        validateAutoVerifyCriteria(
            criteria,
            criteria === 'account_age' ? accountAgeDays : 1
        );
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerify = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null,
            roleId: targetRole.id,
            configuredVia: 'setup'
        };

        await setGuildConfig(client, guild.id, guildConfig);

        let criteriaDescription = "";
        switch (criteria) {
            case "account_age":
                criteriaDescription = `возраст аккаунта — \`${accountAgeDays} дн.\``;
                break;
            case "none":
                criteriaDescription = "все пользователи сразу";
                break;
        }

        logger.info('Автоматическая верификация включена', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            roleId: targetRole.id
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "Автоматическая верификация настроена",
                `Автоматическая верификация успешно настроена!\n\n**Роль:** ${targetRole}\n**Критерий:** ${criteriaDescription}\n\nПользователи, соответствующие этим критериям, будут получать эту роль при входе на сервер.`
            )]
        });

    } catch (error) {
        throw error;
    }
}
