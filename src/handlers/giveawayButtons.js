import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError, replyUserError } from '../utils/errorHandler.js';
import { 
    getGuildGiveaways, 
    saveGiveaway, 
    isGiveawayEnded 
} from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import { 
    selectWinners,
    isUserRateLimited,
    recordUserInteraction,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction, client) {
        try {
            // Проверяем ограничение частоты взаимодействий пользователя
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.RATE_LIMIT,
                    message: 'Пожалуйста, подождите немного перед повторным взаимодействием с этим розыгрышем.'
                });
            }

            await recordUserInteraction(interaction.user.id, interaction.message.id);

            const lockKey = `giveaway:${interaction.message.id}`;

            // Блокируем одновременное изменение одного и того же розыгрыша
            await Mutex.runExclusive(lockKey, async () => {
                const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
                const giveaway = guildGiveaways.find(
                    g => g.messageId === interaction.message.id
                );

                if (!giveaway) {
                    throw new TitanBotError(
                        'Giveaway not found in database',
                        ErrorTypes.VALIDATION,
                        'Этот розыгрыш больше не активен.',
                        {
                            messageId: interaction.message.id,
                            guildId: interaction.guildId
                        }
                    );
                }

                const endedByTime = isGiveawayEnded(giveaway);
                const endedByFlag = giveaway.ended || giveaway.isEnded;

                if (endedByTime || endedByFlag) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Этот розыгрыш уже завершён.'
                    });
                }

                const participants = giveaway.participants || [];
                const userId = interaction.user.id;

                if (participants.includes(userId)) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Вы уже участвуете в этом розыгрыше! 🎉'
                    });
                }

                participants.push(userId);
                giveaway.participants = participants;

                await saveGiveaway(client, interaction.guildId, giveaway);

                logger.debug(
                    `User ${interaction.user.tag} joined giveaway ${interaction.message.id}`
                );

                const updatedEmbed = createGiveawayEmbed(giveaway, 'active');
                const updatedRow = createGiveawayButtons(false);

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [updatedRow]
                });

                await interaction.reply({
                    embeds: [
                        successEmbed(
                            'Успешно! Вы участвуете в розыгрыше! 🎉',
                            `Удачи! Сейчас участников: ${participants.length}.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            });
        } catch (error) {
            logger.error('Error in giveaway join handler:', error);

            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_join',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayEndHandler = {
    customId: 'giveaway_end',

    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Для завершения розыгрыша необходимо право «Управление сервером».'
                });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(
                g => g.messageId === interaction.message.id
            );

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'Этот розыгрыш больше не активен.',
                    {
                        messageId: interaction.message.id,
                        guildId: interaction.guildId
                    }
                );
            }

            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) {
                throw new TitanBotError(
                    'Giveaway already ended',
                    ErrorTypes.VALIDATION,
                    'Этот розыгрыш уже завершён.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            const winners = selectWinners(
                participants,
                giveaway.winnerCount
            );

            giveaway.ended = true;
            giveaway.isEnded = true;
            giveaway.winnerIds = winners;
            giveaway.endedAt = new Date().toISOString();
            giveaway.endedBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(
                `Giveaway ended via button by ${interaction.user.tag}: ${interaction.message.id}`
            );

            const updatedEmbed = createGiveawayEmbed(
                giveaway,
                'ended',
                winners
            );

            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🎉 **РОЗЫГРЫШ ЗАВЕРШЁН** 🎉',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Розыгрыш завершён. Победителей: ${winners.length}`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Приз',
                                value: giveaway.prize || 'Таинственный приз!',
                                inline: true
                            },
                            {
                                name: '🏆 Победители',
                                value: winners.length > 0
                                    ? winners.map(id => `<@${id}>`).join(', ')
                                    : 'Нет подходящих участников',
                                inline: false
                            },
                            {
                                name: '👥 Всего участников',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug(
                    'Error logging giveaway end event:',
                    logError
                );
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        'Розыгрыш завершён ✅',
                        `Розыгрыш завершён, выбрано победителей: ${winners.length}!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway end handler:', error);

            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_end',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',

    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Для повторного выбора победителей необходимо право «Управление сервером».'
                });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(
                g => g.messageId === interaction.message.id
            );

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'Этот розыгрыш больше не активен.',
                    {
                        messageId: interaction.message.id,
                        guildId: interaction.guildId
                    }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded) {
                throw new TitanBotError(
                    'Giveaway still active',
                    ErrorTypes.VALIDATION,
                    'Этот розыгрыш ещё не завершён. Сначала завершите его.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];

            if (participants.length === 0) {
                throw new TitanBotError(
                    'No participants to reroll',
                    ErrorTypes.VALIDATION,
                    'Нет участников, среди которых можно выбрать победителей.',
                    { messageId: interaction.message.id }
                );
            }

            const newWinners = selectWinners(
                participants,
                giveaway.winnerCount
            );

            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(
                `Giveaway rerolled via button by ${interaction.user.tag}: ${interaction.message.id}`
            );

            const updatedEmbed = createGiveawayEmbed(
                giveaway,
                'reroll',
                newWinners
            );

            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🔄 **ПОБЕДИТЕЛИ ПЕРЕВЫБРАНЫ** 🔄',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: 'Победители розыгрыша были перевыбраны',
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Приз',
                                value: giveaway.prize || 'Таинственный приз!',
                                inline: true
                            },
                            {
                                name: '🏆 Новые победители',
                                value: newWinners
                                    .map(id => `<@${id}>`)
                                    .join(', '),
                                inline: false
                            },
                            {
                                name: '👥 Всего участников',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug(
                    'Error logging giveaway reroll event:',
                    logError
                );
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        'Победители перевыбраны ✅',
                        'Новые победители были успешно выбраны!'
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway reroll handler:', error);

            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_reroll',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',

    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const guildGiveaways = await getGuildGiveaways(
                client,
                interaction.guildId
            );

            const giveaway = guildGiveaways.find(
                g => g.messageId === interaction.message.id
            );

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'Этот розыгрыш не удалось найти.',
                    {
                        messageId: interaction.message.id,
                        guildId: interaction.guildId
                    }
                );
            }

            if (
                !giveaway.ended &&
                !giveaway.isEnded &&
                !isGiveawayEnded(giveaway)
            ) {
                return replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Этот розыгрыш ещё не завершён, поэтому победители пока недоступны.'
                });
            }

            const winnerIds = Array.isArray(giveaway.winnerIds)
                ? giveaway.winnerIds
                : [];

            const winnerMentions = winnerIds.length > 0
                ? winnerIds.map(id => `<@${id}>`).join(', ')
                : 'Для этого розыгрыша не было выбрано подходящих победителей.';

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Победители розыгрыша «${giveaway.prize || 'Розыгрыш'}» 🎉`,
                        winnerMentions
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway view handler:', error);

            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_view',
                handler: 'giveaway'
            });
        }
    }
};
