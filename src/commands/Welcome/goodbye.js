import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Настройка системы сообщений при выходе участников')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Настроить сообщение при выходе')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Канал, в который будут отправляться сообщения при выходе')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Сообщение при выходе. Переменные: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL изображения, которое будет добавлено в сообщение при выходе')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Упоминать ли пользователя в сообщении при выходе')
                        .setRequired(false))),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Не удалось отложить взаимодействие Goodbye`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для использования `/goodbye` необходимо право **Управление сервером**.'
            });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);

            if (existingConfig?.goodbyeChannelId) {
                logger.info(
                    `[Goodbye] Настройка заблокирована, поскольку конфигурация уже существует в канале ${existingConfig.goodbyeChannelId} для сервера ${guild.id}`
                );

                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `Goodbye уже настроен для <#${existingConfig.goodbyeChannelId}>. Используйте **/greet dashboard**, чтобы изменить канал, сообщение, упоминание или изображение.`
                });
            }

            if (!message || message.trim().length === 0) {
                logger.warn(
                    `[Goodbye] Пользователь ${interaction.user.tag} указал пустое сообщение на сервере ${guild.name}`
                );

                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Сообщение при выходе не может быть пустым.'
                });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(
                        `[Goodbye] Пользователь ${interaction.user.tag} указал недействительный URL изображения: ${image}`
                    );

                    return await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Пожалуйста, укажите действительный URL изображения (он должен начинаться с http:// или https://).'
                    });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    leaveEmbed: {
                        title: "Прощай, {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `До свидания от ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.info(
                    `[Goodbye] Настройка выполнена пользователем ${interaction.user.tag} для сервера ${guild.name} (${guild.id})`
                );

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('Система Goodbye настроена')
                    .setDescription(`Сообщения при выходе теперь будут отправляться в ${channel}`)
                    .addFields(
                        {
                            name: 'Предпросмотр сообщения',
                            value: truncateForEmbedField(previewMessage)
                        },
                        {
                            name: 'Упоминать пользователя',
                            value: ping ? 'Да' : 'Нет'
                        },
                        {
                            name: 'Статус',
                            value: 'Включено'
                        }
                    )
                    .setFooter({
                        text: 'Совет: используйте /greet dashboard для настройки параметров Goodbye'
                    });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });

            } catch (error) {
                logger.error(
                    `[Goodbye] Не удалось настроить систему Goodbye для сервера ${guild.id}:`,
                    error
                );

                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при настройке системы сообщений при выходе. Попробуйте ещё раз.'
                });
            }
        }
    },
};
