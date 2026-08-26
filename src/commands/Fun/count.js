import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Управление игрой со счётом на сервере')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Запустить игру со счётом в текстовом канале')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Канал, в котором будет проходить игра')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('Система счёта, которую использовать')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Отключить игру со счётом на сервере'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Посмотреть текущий статус игры со счётом'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Сбросить текущую последовательность счёта')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('Число, с которого начать после сброса')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('Показать таблицу лидеров игры со счётом'),
    ),
  category: 'Развлечения',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral,
      });

      if (!deferSuccess) {
        logger.warn('Не удалось отложить ответ команды count', {
          userId: interaction.user.id,
          guildId: interaction.guildId,
        });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Для использования этой команды вам необходимо право **Управление сервером**.',
        });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');

        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Пожалуйста, выберите текстовый канал для игры со счётом.',
          });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: `На этом сервере уже настроен активный канал для игры со счётом: <#${config.channelId}>. Сначала отключите текущую игру или используйте уже настроенный канал.`,
          });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Игра со счётом включена',
              `Игра со счётом теперь активна в канале ${channel} с использованием системы **${getCountingSystemLabel(system)}**. Игроки должны считать начиная с **1** и не могут отправлять два числа подряд.`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              infoEmbed(
                'Игра со счётом отключена',
                'Игра со счётом уже отключена на этом сервере.',
              ),
            ],
          });
        }

        await disableCountingGame(interaction.client, guildId);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Игра со счётом отключена',
              'Игра со счётом была отключена.',
            ),
          ],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          {
            name: 'Включена',
            value: config.enabled ? 'Да' : 'Нет',
            inline: true,
          },
          {
            name: 'Канал',
            value: config.channelId ? `<#${config.channelId}>` : 'Не настроен',
            inline: true,
          },
          {
            name: 'Система',
            value: getCountingSystemLabel(config.system),
            inline: true,
          },
          {
            name: 'Следующее число',
            value: getExpectedCountValue(config),
            inline: true,
          },
          {
            name: 'Текущая серия',
            value: `${config.currentStreak}`,
            inline: true,
          },
          {
            name: 'Лучшая серия',
            value: `${config.bestStreak || 0}`,
            inline: true,
          },
          {
            name: 'Последний игрок',
            value: config.lastUserId ? `<@${config.lastUserId}>` : 'Нет',
            inline: true,
          },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Статус игры со счётом',
              description: 'Обзор текущих настроек и состояния игры со счётом.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Сначала включите игру со счётом с помощью `/count setup`.',
          });
        }

        const startNumber = interaction.options.getInteger('start') || 1;

        await resetCountingGame(
          interaction.client,
          guildId,
          startNumber,
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Игра со счётом сброшена',
              `Последовательность счёта была сброшена. Начните снова с числа **${startNumber}** в <#${config.channelId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(
          config,
          interaction.guild,
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Таблица лидеров игры со счётом',
              description:
                leaderboard.length > 0
                  ? leaderboard.join('\n')
                  : 'Пока не было зарегистрировано ни одного счёта.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Пожалуйста, выберите допустимое действие для игры со счётом.',
      });
    } catch (error) {
      logger.error('Ошибка команды count:', error);

      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Произошла ошибка при управлении игрой со счётом.',
      });
    }
  },
};
