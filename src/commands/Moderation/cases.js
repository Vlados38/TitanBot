import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('View moderation cases and audit logs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName('filter')
                .setDescription('Filter cases by type or user')
                .addChoices(
                    { name: 'All Cases', value: 'all' },
                    { name: 'Bans', value: 'Member Banned' },
                    { name: 'Kicks', value: 'Member Kicked' },
                    { name: 'Timeouts', value: 'Member Timed Out' },
                    { name: 'Warnings', value: 'User Warned' },
                ),
        )
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Filter cases by specific user'),
        )
        .addIntegerOption((option) =>
            option
                .setName('limit')
                .setDescription('Number of cases to show (default: 10)')
                .setMinValue(1)
                .setMaxValue(50),
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn('Cases interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'cases',
            });
            return;
        }

        try {
            const filterType =
                interaction.options.getString('filter') || 'all';
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 10;

            const filters = {
                limit,
                action: filterType === 'all' ? undefined : filterType,
                userId: targetUser?.id,
            };

            const cases = await getModerationCases(
                interaction.guild.id,
                filters,
            );

            if (cases.length === 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: targetUser
                        ? `No moderation cases found for **${targetUser.tag}**.`
                        : `No ${
                              filterType === 'all' ? '' : filterType + ' '
                          }cases found in this server.`,
                });
            }

            const CASES_PER_PAGE = 5;
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 1;

            const createCasesEmbed = (page) => {
                const startIndex = (page - 1) * CASES_PER_PAGE;
                const pageCases = cases.slice(
                    startIndex,
                    startIndex + CASES_PER_PAGE,
                );

                const embed = createEmbed({
                    title: 'Moderation Cases',
                    description:
                        `Showing moderation cases for **${interaction.guild.name}**\n\n` +
                        `**Page ${page} of ${totalPages}**`,
                });

                for (const case_ of pageCases) {
                    const createdAt = new Date(case_.createdAt);

                    const date = createdAt.toLocaleDateString();
                    const time = createdAt.toLocaleTimeString();

                    embed.addFields({
                        name: `Case #${case_.caseId} - ${case_.action}`,
                        value:
                            `**Target:** ${case_.target}\n` +
                            `**Moderator:** ${case_.executor}\n` +
                            `**Date:** ${date} at ${time}\n` +
                            `**Reason:** ${case_.reason || 'No reason provided'}`,
                        inline: false,
                    });
                }

                embed.setFooter({
                    text:
                        `Total cases: ${cases.length} | ` +
                        `Filter: ${filterType}` +
                        (targetUser
                            ? ` | User: ${targetUser.tag}`
                            : ''),
                });

                return embed;
            };

            const createNavigationRow = (page, disabled = false) => {
                const row = new ActionRowBuilder();

                const prevButton = new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('Previous')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || page === 1);

                const pageInfoButton = new ButtonBuilder()
                    .setCustomId('page_info')
                    .setLabel(`Page ${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Next')
                    .setEmoji('➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || page === totalPages);

                row.addComponents(
                    prevButton,
                    pageInfoButton,
                    nextButton,
                );

                return row;
            };

            const message = await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [createCasesEmbed(currentPage)],
                    components: [
                        createNavigationRow(currentPage),
                    ],
                },
            );

            if (!message) return;

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120_000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (
                    buttonInteraction.user.id !==
                    interaction.user.id
                ) {
                    await buttonInteraction.reply({
                        content:
                            'You cannot use these buttons. Run `/cases` to get your own case view.',
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {});

                    return;
                }

                await buttonInteraction.deferUpdate().catch(() => {});

                if (
                    buttonInteraction.customId === 'prev_page' &&
                    currentPage > 1
                ) {
                    currentPage--;
                } else if (
                    buttonInteraction.customId === 'next_page' &&
                    currentPage < totalPages
                ) {
                    currentPage++;
                }

                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        embeds: [createCasesEmbed(currentPage)],
                        components: [
                            createNavigationRow(currentPage),
                        ],
                    },
                );
            });

            collector.on('end', async () => {
                try {
                    await InteractionHelper.safeEditReply(
                        interaction,
                        {
                            components: [
                                createNavigationRow(
                                    currentPage,
                                    true,
                                ),
                            ],
                        },
                    );
                } catch {
                    // Message may have been deleted or expired.
                }
            });
        } catch (error) {
            logger.error('Error in cases command:', error);

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message:
                    'An error occurred while retrieving moderation cases. Please try again later.',
            }).catch(() => {});
        }
    },
};
