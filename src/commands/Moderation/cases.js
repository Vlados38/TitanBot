import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('Просмотр случаев модерации и журналов аудита')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Фильтр случаев по типу или пользователю')
                .addChoices(
                    { name: 'Все случаи', value: 'all' },
                    { name: 'Блокировки', value: 'Member Banned' },
                    { name: 'Кики', value: 'Member Kicked' },
                    { name: 'Тайм-ауты', value: 'Member Timed Out' },
                    { name: 'Предупреждения', value: 'User Warned' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Фильтр случаев по конкретному пользователю')
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Количество отображаемых случаев (по умолчанию: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Cases interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'cases'
            });
            return;
        }

        try {
            const filterType = interaction.options.getString('filter') || 'all';
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 10;

            const filters = {
                limit,
                action: filterType === 'all' ? undefined : filterType,
                userId: targetUser?.id
            };

            const cases = await getModerationCases(interaction.guild.id, filters);

            if (cases.length === 0) {
                throw new Error(targetUser 
                    ? `Для пользователя ${targetUser.tag} случаи модерации не найдены`
                    : `В этом сервере не найдено ${filterType === 'all' ? 'случаев' : `случаев типа ${filterType}`}.`
                );
            }

            const CASES_PER_PAGE = 5;
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 1;

            const createCasesEmbed = (page) => {
                const startIndex = (page - 1) * CASES_PER_PAGE;
                const endIndex = startIndex + CASES_PER_PAGE;
                const pageCases = cases.slice(startIndex, endIndex);

                const embed = createEmbed({
                    title: 'Случаи модерации',
                    description: `Случаи модерации для **${interaction.guild.name}**\n\n**Страница ${page} из ${totalPages}**`
                });

                pageCases.forEach(case_ => {
                    const date = new Date(case_.createdAt).toLocaleDateString();
                    const time = new Date(case_.createdAt).toLocaleTimeString();
                    
                    embed.addFields({
                        name: `Случай №${case_.caseId} — ${case_.action}`,
                        value: `**Нарушитель:** ${case_.target}\n**Модератор:** ${case_.executor}\n**Дата:** ${date} в ${time}\n**Причина:** ${case_.reason || 'Причина не указана'}`,
                        inline: false
                    });
                });

                embed.setFooter({
                    text: `Всего случаев: ${cases.length} | Фильтр: ${filterType}${targetUser ? ` | Пользователь: ${targetUser.tag}` : ''}`
                });

                return embed;
            };

            const createNavigationRow = (page) => {
                const row = new ActionRowBuilder();
                
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('⬅️ Предыдущая')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1);

                const pageInfoButton = new ButtonBuilder()
                    .setCustomId('page_info')
                    .setLabel(`Страница ${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Следующая ➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages);

                row.addComponents(prevButton, pageInfoButton, nextButton);
                return row;
            };

            const message = await interaction.editReply({ 
                embeds: [createCasesEmbed(currentPage)], 
                components: [createNavigationRow(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000
            });

            collector.on('collect', async (buttonInteraction) => {
                await buttonInteraction.deferUpdate();

                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.followUp({
                        content: 'Вы не можете использовать эти кнопки. Выполните `/cases`, чтобы открыть свой список случаев.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'prev_page' && currentPage > 1) {
                    currentPage--;
                } else if (customId === 'next_page' && currentPage < totalPages) {
                    currentPage++;
                }

                await interaction.editReply({
                    embeds: [createCasesEmbed(currentPage)],
                    components: [createNavigationRow(currentPage)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = createNavigationRow(currentPage);
                disabledRow.components.forEach(button => button.setDisabled(true));
                
                try {
                    await message.edit({
                        components: [disabledRow]
                    });
                } catch (error) {
                }
            });

        } catch (error) {
            logger.error('Error in cases command:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при получении случаев модерации. Пожалуйста, попробуйте позже.' });
        }
    }
};
