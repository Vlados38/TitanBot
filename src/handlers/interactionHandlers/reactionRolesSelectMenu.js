import { EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { getReactionRoleMessage } from '../../services/reactionRoleService.js';

export async function handleReactionRolesSelectMenu(interaction, client) {
    try {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        if (!interaction.inGuild() || !interaction.guild || !interaction.member) {
            throw createError(
                'Взаимодействие с ролями по реакции использовано вне сервера',
                ErrorTypes.VALIDATION,
                'Это меню ролей по реакции можно использовать только внутри сервера.',
                { userId: interaction.user.id }
            );
        }

        logger.debug(`Взаимодействие с меню ролей по реакции от ${interaction.user.tag} для сообщения ${interaction.message.id}`);

        const reactionRoleData = await getReactionRoleMessage(client, interaction.guildId, interaction.message.id);

        if (!reactionRoleData) {
            logger.warn(`Данные ролей по реакции не найдены для сообщения ${interaction.message.id} на сервере ${interaction.guildId}`);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ Это сообщение с ролями по реакции больше не активно.')
                        .setColor(getColor('error'))
                ]
            });
        }

        const member = interaction.member;
        const selectedRoleIds = interaction.values;

        const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);

        if (!me) {
            throw createError(
                'Не удалось получить данные участника бота для проверки прав',
                ErrorTypes.PERMISSION,
                'Не удалось проверить мои права на сервере. Пожалуйста, попробуйте ещё раз.',
                { guildId: interaction.guildId }
            );
        }

        if (!me.permissions.has('ManageRoles')) {
            throw createError(
                'У бота отсутствует право ManageRoles',
                ErrorTypes.PERMISSION,
                'У меня нет разрешения на управление ролями на этом сервере.',
                { guildId: interaction.guildId }
            );
        }

        const botRolePosition = me.roles.highest.position;

        const availableRoleIds = Array.isArray(reactionRoleData.roles)
            ? reactionRoleData.roles
            : (typeof reactionRoleData.roles === 'object' ? Object.values(reactionRoleData.roles) : []);

        const addedRoles = [];
        const removedRoles = [];
        const skippedRoles = [];

        for (const roleId of selectedRoleIds) {
            if (!availableRoleIds.includes(roleId)) {
                logger.warn(`Роль ${roleId} отсутствует среди доступных ролей для сообщения ${interaction.message.id}`);
                continue;
            }

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) {
                logger.warn(`Роль ${roleId} не найдена на сервере ${interaction.guildId}`);
                skippedRoles.push(roleId);
                continue;
            }

            const roleHasDangerousPermissions = role.permissions.has([
                'Administrator',
                'ManageGuild',
                'ManageRoles',
                'ManageChannels',
                'ManageWebhooks',
                'BanMembers',
                'KickMembers',
                'MentionEveryone'
            ]);

            if (role.managed || roleHasDangerousPermissions) {
                logger.warn(`Заблокирована самостоятельная выдача защищённой роли ${role.name} (${roleId})`);
                skippedRoles.push(role.name);
                continue;
            }

            if (role.position >= botRolePosition) {
                logger.warn(`Невозможно выдать роль ${role.name} (${roleId}) из-за иерархии ролей`);
                skippedRoles.push(role.name);
                continue;
            }

            if (!member.roles.cache.has(roleId)) {
                try {
                    await member.roles.add(role);
                    addedRoles.push(role.name);
                    logger.debug(`Роль ${role.name} добавлена пользователю ${member.user.tag}`);
                } catch (roleError) {
                    logger.error(`Не удалось добавить роль ${role.name} пользователю ${member.user.tag}:`, roleError);
                    skippedRoles.push(role.name);
                }
            }
        }

        for (const roleId of availableRoleIds) {
            if (selectedRoleIds.includes(roleId)) continue;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue;

            if (role.position >= botRolePosition) continue;

            if (member.roles.cache.has(roleId)) {
                try {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                    logger.debug(`Роль ${role.name} удалена у пользователя ${member.user.tag}`);
                } catch (roleError) {
                    logger.error(`Не удалось удалить роль ${role.name} у пользователя ${member.user.tag}:`, roleError);
                }
            }
        }

        let description = '🎭 **Роли успешно обновлены!**\n\n';

        if (addedRoles.length > 0) {
            description += `✅ **Добавлены:** ${addedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }

        if (removedRoles.length > 0) {
            description += `❌ **Удалены:** ${removedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }

        if (addedRoles.length === 0 && removedRoles.length === 0) {
            description += 'Изменений в ваших ролях не внесено.';
        }

        if (skippedRoles.length > 0) {
            description += `\n⚠️ **Пропущено:** ${skippedRoles.length} роль${skippedRoles.length !== 1 ? 'ей' : ''} (проблемы с правами)`;
        }

        const responseEmbed = new EmbedBuilder()
            .setDescription(description)
            .setColor(getColor('success'))
            .setTimestamp();

        await interaction.editReply({ embeds: [responseEmbed] });

        if (addedRoles.length > 0 || removedRoles.length > 0) {
            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.REACTION_ROLE_UPDATE,
                    data: {
                        description: `Роли по реакции обновлены для ${member.user.tag}`,
                        userId: member.user.id,
                        channelId: interaction.channelId,
                        fields: [
                            {
                                name: '👤 Участник',
                                value: `${member.user.tag} (${member.user.id})`,
                                inline: false
                            },
                            ...(addedRoles.length > 0 ? [{
                                name: '✅ Добавленные роли',
                                value: addedRoles.join(', '),
                                inline: false
                            }] : []),
                            ...(removedRoles.length > 0 ? [{
                                name: '❌ Удалённые роли',
                                value: removedRoles.join(', '),
                                inline: false
                            }] : [])
                        ]
                    }
                });
            } catch (logError) {
                logger.warn('Не удалось записать изменение ролей по реакции в журнал:', logError);
            }
        }

        logger.info(`Роли по реакции обновлены для ${member.user.tag}: +${addedRoles.length}, -${removedRoles.length}`);

    } catch (error) {
        await handleInteractionError(interaction, error, {
            type: 'select_menu',
            customId: 'reaction_roles'
        });
    }
}
