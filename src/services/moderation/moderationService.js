// moderationService.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';

function getTargetLabel(target) {
  return target.user?.tag ?? target.displayName ?? 'этого пользователя';
}

function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }) {
    if (actor === 'moderator') {
      return (
        `Вы не можете ${action} **${targetLabel}** — его роль **${targetRole.name}** находится на том же уровне или выше вашей (**${actorRole.name}**). ` +
        `В **Настройки сервера → Роли** переместите вашу роль модератора выше **${targetRole.name}**.`
      );
    }

    return (
      `Я не могу ${action} **${targetLabel}** — моя роль **${actorRole.name}** находится на том же уровне или ниже его роли (**${targetRole.name}**). ` +
      `В **Настройки сервера → Роли** переместите роль моего бота выше **${targetRole.name}**.`
    );
  }

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember = target.guild?.members?.me;
      const botRole = getHighestRole(botMember);

      if (!botRole || !targetRole) {
        return `Иерархия ролей бота заблокировала действие ${action} для ${targetLabel}`;
      }

      return `Роль бота **${botRole.name}** находится слишком низко относительно **${targetRole.name}** — переместите роль бота выше`;
    }

    const modRole = getHighestRole(moderator);

    if (!modRole || !targetRole) {
      return `Иерархия ролей заблокировала действие ${action} для ${targetLabel}`;
    }

    return `Ваша роль **${modRole.name}** находится слишком низко относительно **${targetRole.name}** — переместите вашу роль выше`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return {
        valid: false,
        error: 'Недействительный модератор или пользователь'
      };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error: 'Не удалось определить иерархию ролей. Попробуйте упомянуть пользователя или использовать slash-команду.',
      };
    }

    if (modRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRole: modRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    if (!target) {
      return {
        valid: false,
        error: 'Недействительный пользователь'
      };
    }

    const botMember = target.guild?.members?.me;

    if (!botMember) {
      return {
        valid: false,
        error: 'Бот не находится на этом сервере'
      };
    }

    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error: 'Не удалось определить иерархию ролей бота. Убедитесь, что моя роль правильно настроена на этом сервере.',
      };
    }

    if (botRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'bot',
          actorRole: botRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);

    if (!botCheck.valid) {
      throw new TitanBotError(
        botCheck.error,
        ErrorTypes.PERMISSION,
        botCheck.error
      );
    }

    const modCheck = this.validateHierarchy(moderator, target, action);

    if (!modCheck.valid) {
      throw new TitanBotError(
        modCheck.error,
        ErrorTypes.PERMISSION,
        modCheck.error
      );
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'Причина не указана',
    deleteDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Отсутствуют обязательные параметры',
          ErrorTypes.VALIDATION,
          'Необходимы сервер, пользователь и модератор'
        );
      }

      let targetMember = null;

      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Пользователь не находится на сервере, продолжаем блокировку');
      }

      if (targetMember) {
        this.assertModerationHierarchy(moderator, targetMember, 'заблокировать');
      } else {
        const isOwner = guild.ownerId === moderator.id;

        const hasHighPerms = moderator.permissions.has([
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
          throw new TitanBotError(
            'У вас недостаточно прав для блокировки пользователей, которые не находятся на сервере.',
            ErrorTypes.PERMISSION,
            'Вам необходимо иметь права **Управление сервером** или **Администратор**, чтобы блокировать пользователей, отсутствующих на сервере.'
          );
        }
      }

      await guild.members.ban(user.id, { reason });

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Пользователь заблокирован',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
            deleteDays
          }
        }
      });

      logger.info(
        `Пользователь заблокирован: ${user.tag} модератором ${moderator.user.tag} на сервере ${guild.name}`
      );

      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Ошибка при блокировке пользователя:', error);
      throw error;
    }
  }

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'Причина не указана'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Отсутствуют обязательные параметры',
          ErrorTypes.VALIDATION,
          'Необходимы сервер, пользователь и модератор'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'выгнать');

      if (!member.kickable) {
        const targetLabel = getTargetLabel(member);

        throw new TitanBotError(
          'Невозможно выгнать пользователя',
          ErrorTypes.PERMISSION,
          `Я не могу выгнать **${targetLabel}**. Возможно, у него есть право **Администратор** или управляемая/интеграционная роль. ` +
          'Убедитесь, что роль моего бота находится выше роли пользователя в **Настройки сервера → Роли**, и что у пользователя нет права Администратора.'
        );
      }

      await member.kick(reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Пользователь выгнан',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(
        `Пользователь выгнан: ${member.user.tag} модератором ${moderator.user.tag} на сервере ${guild.name}`
      );

      return {
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error('Ошибка при исключении пользователя:', error);
      throw error;
    }
  }

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'Причина не указана'
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new TitanBotError(
          'Отсутствуют обязательные параметры',
          ErrorTypes.VALIDATION,
          'Необходимы сервер, пользователь, модератор и длительность тайм-аута'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'выдать тайм-аут');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);

        throw new TitanBotError(
          'Невозможно выдать тайм-аут пользователю',
          ErrorTypes.PERMISSION,
          `Я не могу выдать тайм-аут **${targetLabel}**. Возможно, у него есть право **Администратор** или управляемая/интеграционная роль. ` +
          'Убедитесь, что роль моего бота находится выше его роли в **Настройки сервера → Роли**, и что у пользователя нет права Администратора.'
        );
      }

      await member.timeout(durationMs, reason);

      const durationMinutes = Math.floor(durationMs / 60000);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Пользователю выдан тайм-аут',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} минут`,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(
        `Пользователю выдан тайм-аут: ${member.user.tag} модератором ${moderator.user.tag} на сервере ${guild.name}`
      );

      return {
        caseId,
        user: member.user.tag,
        duration: durationMinutes,
        reason
      };
    } catch (error) {
      logger.error('Ошибка при выдаче тайм-аута пользователю:', error);
      throw error;
    }
  }

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Тайм-аут снят модератором'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Отсутствуют обязательные параметры',
          ErrorTypes.VALIDATION,
          'Необходимы сервер, пользователь и модератор'
        );
      }

      this.assertModerationHierarchy(
        moderator,
        member,
        'снять тайм-аут с'
      );

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);

        throw new TitanBotError(
          'Невозможно изменить пользователя',
          ErrorTypes.PERMISSION,
          `Я не могу изменить данные **${targetLabel}**. Возможно, у него есть право **Администратор** или управляемая/интеграционная роль. ` +
          'Убедитесь, что роль моего бота находится выше его роли в **Настройки сервера → Роли**.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        throw new TitanBotError(
          'На пользователе нет тайм-аута',
          ErrorTypes.VALIDATION,
          `${member.user.tag} в данный момент не имеет тайм-аута`
        );
      }

      await member.timeout(null, reason);

      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Тайм-аут с пользователя снят',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(
        `Тайм-аут снят: ${member.user.tag} модератором ${moderator.user.tag} на сервере ${guild.name}`
      );

      return {
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Ошибка при снятии тайм-аута:', error);
      throw error;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'Причина не указана'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Отсутствуют обязательные параметры',
          ErrorTypes.VALIDATION,
          'Необходимы сервер, пользователь и модератор'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'Пользователь не заблокирован',
          ErrorTypes.VALIDATION,
          `${user.tag} в данный момент не заблокирован на этом сервере`
        );
      }

      await guild.members.unban(user.id, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Блокировка пользователя снята',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(
        `Блокировка снята: ${user.tag} модератором ${moderator.user.tag} на сервере ${guild.name}`
      );

      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Ошибка при снятии блокировки пользователя:', error);
      throw error;
    }
  }
}
