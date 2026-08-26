/**
 * Ограничения для команд с префиксом — dashboard и расширенные процессы настройки
 * доступны только через slash-команды.
 */

/** Команды верхнего уровня, которые вообще нельзя вызвать через префикс. */
export const SLASH_ONLY_COMMANDS = new Set([
  'configwizard',
  'help',
  'embedbuilder',
  'wipedata',
  'apply',
]);

/** Подкоманды, заблокированные для всех команд при использовании префикса. */
export const GLOBAL_BLOCKED_SUBCOMMANDS = new Set([
  'dashboard',
  'setup',
]);

/** Группы подкоманд, заблокированные для всех команд при использовании префикса. */
export const GLOBAL_BLOCKED_SUBCOMMAND_GROUPS = new Set([
  'config',
]);

/** Подкоманды отдельных команд, доступные только через slash-команды
 * (помимо глобально заблокированных). */
export const COMMAND_BLOCKED_SUBCOMMANDS = {
  music: new Set([
    'shuffle',
    'loop',
    'seek',
    'remove',
    'move',
    'clear',
    '247',
  ]),
  birthday: new Set(['setchannel']),
  report: new Set(['setchannel']),
};

function collectSubcommandNames(commandJson) {
  const subcommandGroup = commandJson.options?.find((opt) => opt.type === 2);

  if (subcommandGroup) {
    const names = [];
    for (const group of subcommandGroup.options || []) {
      names.push(...(group.options?.map((opt) => opt.name) || []));
    }
    return names;
  }

  return (commandJson.options?.filter((opt) => opt.type === 1) || []).map((sub) => sub.name);
}

function isSubcommandBlocked(commandName, subcommandName) {
  if (!subcommandName) {
    return false;
  }

  if (GLOBAL_BLOCKED_SUBCOMMANDS.has(subcommandName)) {
    return true;
  }

  const commandBlocked = COMMAND_BLOCKED_SUBCOMMANDS[commandName];
  return commandBlocked?.has(subcommandName) ?? false;
}

/**
 * Возвращает информацию о том, следует ли отклонить вызов через префикс.
 * @param {object} command - Загруженный модуль команды
 * @param {string[]} args - Аргументы префикса (после имени команды)
 * @param {(name: string) => string} resolveSubcommandAlias - Функция разрешения псевдонима подкоманды
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function getPrefixRestriction(command, args, resolveSubcommandAlias) {
  if (!command?.data?.toJSON) {
    return { blocked: false };
  }

  const commandJson = command.data.toJSON();
  const commandName = commandJson.name?.toLowerCase();

  if (command.prefixOnly === false || command.slashOnly === true) {
    return {
      blocked: true,
      reason: 'Эта команда доступна только как slash-команда.',
    };
  }

  if (SLASH_ONLY_COMMANDS.has(commandName)) {
    return {
      blocked: true,
      reason: 'Эта команда доступна только как slash-команда.',
    };
  }

  const [firstArg, secondArg] = args.map((arg) => arg?.toLowerCase?.() || null);
  const resolvedFirstArg = firstArg ? resolveSubcommandAlias(firstArg) : null;
  const resolvedSecondArg = secondArg ? resolveSubcommandAlias(secondArg) : null;

  const subcommandGroup = commandJson.options?.find((opt) => opt.type === 2);

  const allSubcommandNames = collectSubcommandNames(commandJson);
  const allSubcommandsBlocked =
    allSubcommandNames.length > 0 &&
    allSubcommandNames.every((name) => isSubcommandBlocked(commandName, name));

  if (allSubcommandsBlocked) {
    return {
      blocked: true,
      reason: 'Эта команда доступна только как slash-команда.',
    };
  }

  if (firstArg && GLOBAL_BLOCKED_SUBCOMMAND_GROUPS.has(firstArg)) {
    return {
      blocked: true,
      reason: 'Этот процесс настройки доступен только как slash-команда.',
    };
  }

  if (resolvedFirstArg && isSubcommandBlocked(commandName, resolvedFirstArg)) {
    return {
      blocked: true,
      reason: 'Эта подкоманда доступна только как slash-команда.',
    };
  }

  if (subcommandGroup && resolvedSecondArg && isSubcommandBlocked(commandName, resolvedSecondArg)) {
    return {
      blocked: true,
      reason: 'Эта подкоманда доступна только как slash-команда.',
    };
  }

  return { blocked: false };
}

export function isPrefixRestrictedCommand(command, args, resolveSubcommandAlias) {
  return getPrefixRestriction(command, args, resolveSubcommandAlias).blocked;
}
