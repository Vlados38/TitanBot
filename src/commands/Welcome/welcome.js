import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Настройка системы приветствия')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Настроить приветственное сообщение')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Канал, в который будут отправляться приветственные сообщения')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Приветственное сообщение. Переменные: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL изображения, которое будет добавлено в приветственное сообщение')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Упоминать ли пользователя в приветственном сообщении')
                        .setRequired(false))),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Не удалось отложить взаимодействие Welcome`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'welcome'
                });
                return;
            }
        } catch (deferError) {
            logger.error(`Ошибка при отложенной обработке Welcome`, { error: deferError.message });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Для использования `/welcome` вам необходимо право **Управление сервером**.'
            });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);

            if (existingConfig?.channelId) {
                logger.info(
                    `[Welcome] Настройка заблокирована, поскольку конфигурация уже существует в канале ${existingConfig.channelId} для сервера ${guild.id}`
                );

                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `Welcome уже настроен для <#${existingConfig.channelId}>. Используйте **/greet dashboard**, чтобы изменить канал, сообщение, упоминание или изображение.`
                });
            }
            
            if (!message || message.trim().length === 0) {
                logger.warn(
                    `[Welcome] Пользователь ${interaction.user.tag} указал пустое сообщение на сервере ${guild.name}`
                );

                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Приветственное сообщение не может быть пустым.'
                });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(
                        `[Welcome] Пользователь ${interaction.user.tag} указал недействительный URL изображения: ${image}`
                    );

                    return await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Пожалуйста, укажите корректный URL изображения (он должен начинаться с http:// или https://).'
                    });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    enabled: true,
                    channelId: channel.id,
                    welcomeMessage: message,
                    welcomeImage: image || undefined,
                    welcomePing: ping
                });

                logger.info(
                    `[Welcome] Настройка выполнена пользователем ${interaction.user.tag} для сервера ${guild.name} (${guild.id})`
                );

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('Система приветствия настроена')
                    .setDescription(`Приветственные сообщения теперь будут отправляться в ${channel}`)
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
                        text: 'Совет: используйте /greet dashboard для настройки параметров приветствия'
                    });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            } catch (error) {
                logger.error(
                    `[Welcome] Не удалось настроить систему приветствия для сервера ${guild.id}:`,
                    error
                );

                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Произошла ошибка при настройке системы приветствия. Пожалуйста, попробуйте ещё раз.'
                });
            }
        }
    },
};
