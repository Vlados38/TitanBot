import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("Одновременно заблокировать нескольких пользователей на сервере")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("ID или упоминания пользователей для блокировки (через пробел или запятую)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Причина массовой блокировки")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("delete_days")
                .setDescription("Количество дней сообщений для удаления (0–7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Massban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'massban'
            });
            return;
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "Массовая блокировка — причина не указана";
        const deleteDays = interaction.options.getInteger("delete_days") || 0;

        try {
            const userIds = usersInput
                .replace(/<@!?(\d+)>/g, '$1')
                .split(/[\s,]+/)
                .filter(id => id && /^\d+$/.test(id))
                .slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Укажите действительные ID или упоминания пользователей. Максимум — 20 пользователей за раз.'
                });
            }

            if (userIds.includes(interaction.user.id)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Вы не можете включить себя в массовую блокировку.'
                });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Вы не можете включить бота в массовую блокировку.'
                });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    
                    if (!user) {
                        results.failed.push({ userId, reason: "Пользователь не найден" });
                        continue;
                    }

                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    
                    if (member) {
                        const modCheck = ModerationService.validateHierarchy(interaction.member, member, 'ban');
                        if (!modCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'ban'),
                            });
                            continue;
                        }

                        const botCheck = ModerationService.validateBotHierarchy(member, 'ban');
                        if (!botCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'ban', 'bot'),
                            });
                            continue;
                        }
                    }

                    await interaction.guild.members.ban(userId, {
                        reason: reason,
                        deleteMessageSeconds: deleteDays * 24 * 60 * 60
                    });

                    results.successful.push({
                        user: user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Banned",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Ban)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to ban user ${userId}:`, error);
                    const reason = error instanceof TitanBotError
                        ? (error.userMessage || error.message)
                        : (error.message || "Неизвестная ошибка");
                    results.failed.push({ 
                        userId, 
                        reason,
                    });
                }
            }

            let description = `**Результаты массовой блокировки:**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **Успешно заблокировано (${results.successful.length}):**\n`;
                results.successful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });
                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **Пропущено (${results.skipped.length}):**\n`;
                results.skipped.forEach(result => {
                    description += `• ${result.user} — ${result.reason}\n`;
                });
                description += '\n';
            }

            if (results.failed.length > 0) {
                description += `❌ **Не удалось заблокировать (${results.failed.length}):**\n`;
                results.failed.forEach(result => {
                    description += `• ${result.userId} — ${result.reason}\n`;
                });
            }

            const embed = results.successful.length > 0 ? successEmbed : warningEmbed;
            
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `🔨 Массовая блокировка завершена`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in massban command:", error);
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Произошла ошибка при выполнении массовой блокировки. Пожалуйста, попробуйте позже.'
            });
        }
    }
};
