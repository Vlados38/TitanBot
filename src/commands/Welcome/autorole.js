import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

function createAutoroleInfoEmbed(description) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString() });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Управление ролями, которые автоматически выдаются новым участникам')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Добавить роль, которая будет автоматически выдаваться новым участникам')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Роль для автоматической выдачи')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Удалить роль из списка автоматически выдаваемых')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Роль для удаления')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Показать все роли, выдаваемые автоматически')),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Не удалось отложить взаимодействие Autorole`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autorole'
            });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для использования `/autorole` необходимо право **Управление сервером**.'
            });
        }

        const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role');

            const guildConfig = await getGuildConfig(client, guild.id);
            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

            if (verificationEnabled || autoVerifyEnabled) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Нельзя добавить AutoRole, пока включена система верификации или AutoVerify. Сначала отключите их.'
                });
            }

            if (role.position >= guild.members.me.roles.highest.position) {
                logger.warn(
                    `[Autorole] Пользователь ${interaction.user.tag} попытался добавить роль ${role.name} (${role.id}), которая находится выше высшей роли бота на сервере ${guild.name}`
                );

                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Я не могу выдавать роли, которые находятся выше моей высшей роли.'
                });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                const currentRoleId = existingRoles[0] || null;

                if (currentRoleId === role.id) {
                    logger.info(
                        `[Autorole] Пользователь ${interaction.user.tag} попытался повторно добавить роль ${role.name} (${role.id}) на сервере ${guild.name}`
                    );

                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `Роль ${role} уже настроена для автоматической выдачи.`
                    });
                }

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: [role.id]
                });

                logger.info(
                    `[Autorole] Установлена единственная авто-роль ${role.name} (${role.id}) на сервере ${guild.name} пользователем ${interaction.user.tag}`
                );

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createAutoroleInfoEmbed(
                            currentRoleId
                                ? `✅ Авто-роль изменена на ${role}. Можно настроить только одну авто-роль.`
                                : `✅ Авто-роль установлена: ${role}.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(
                    `[Autorole] Не удалось добавить роль на сервере ${guild.id}:`,
                    error
                );

                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при добавлении роли. Попробуйте ещё раз.'
                });
            }
        }

        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];

                if (!existingRoles.includes(role.id)) {
                    logger.info(
                        `[Autorole] Пользователь ${interaction.user.tag} попытался удалить несуществующую авто-роль ${role.name} (${role.id}) на сервере ${guild.name}`
                    );

                    return await replyUserError(interaction, {
                        type: ErrorTypes.USER_INPUT,
                        message: `Роль ${role} не настроена для автоматической выдачи.`
                    });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(
                    `[Autorole] Роль ${role.name} (${role.id}) удалена из авто-ролей на сервере ${guild.name} пользователем ${interaction.user.tag}`
                );

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createAutoroleInfoEmbed(
                            `✅ Роль ${role} удалена из автоматически выдаваемых ролей.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(
                    `[Autorole] Не удалось удалить роль на сервере ${guild.id}:`,
                    error
                );

                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при удалении роли. Попробуйте ещё раз.'
                });
            }
        }

        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

                const conflictSummary = [
                    verificationEnabled ? 'Система верификации включена' : null,
                    autoVerifyEnabled ? 'AutoVerify включён' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds)
                    ? config.roleIds
                    : [];

                const singleRoleIds = autoRoles.length > 1
                    ? [autoRoles[0]]
                    : autoRoles;

                if (singleRoleIds.length !== autoRoles.length) {
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: singleRoleIds
                    });

                    logger.info(
                        `[Autorole] Список авто-ролей сокращён до одной роли на сервере ${interaction.guild.name}`
                    );
                }

                if (singleRoleIds.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            createAutoroleInfoEmbed(
                                `ℹ️ Ни одна роль не настроена для автоматической выдачи.${conflictSummary ? `\n\n⚠️ Проблемы с настройкой:\n${conflictSummary}` : ''}`
                            )
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles = [];
                const invalidRoleIds = [];

                for (const roleId of singleRoleIds) {
                    const role = roles.get(roleId);

                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                if (invalidRoleIds.length > 0) {
                    logger.info(
                        `[Autorole] Очистка ${invalidRoleIds.length} недействительной роли (ролей) на сервере ${interaction.guild.name}`
                    );

                    const updatedRoles = singleRoleIds.filter(
                        id => !invalidRoleIds.includes(id)
                    );

                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            createAutoroleInfoEmbed(
                                `ℹ️ Действительная авто-роль не найдена. Все недействительные роли были удалены.${conflictSummary ? `\n\n⚠️ Проблемы с настройкой:\n${conflictSummary}` : ''}`
                            )
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('Автоматически выдаваемая роль')
                    .setDescription(
                        `${validRoles[0]}${conflictSummary ? `\n\n⚠️ Проблемы с настройкой:\n${conflictSummary}` : ''}`
                    )
                    .setFooter({
                        text: 'Можно настроить только одну авто-роль.'
                    });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(
                    `[Autorole] Не удалось получить список ролей на сервере ${guild.id}:`,
                    error
                );

                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при отображении автоматически выдаваемых ролей. Попробуйте ещё раз.'
                });
            }
        }
    },
};
