// errorRegistry.js

const ErrorCodes = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DISCORD_API_ERROR: 'DISCORD_API_ERROR',
  USER_INPUT_ERROR: 'USER_INPUT_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERACTION_INVALID: 'INTERACTION_INVALID',
  INTERACTION_EXPIRED: 'INTERACTION_EXPIRED',
  INTERACTION_RESPONSE_FAILED: 'INTERACTION_RESPONSE_FAILED',
  INTERACTION_UNHANDLED: 'INTERACTION_UNHANDLED',
  TASK_ERROR: 'TASK_ERROR',
  UNHANDLED_REJECTION: 'UNHANDLED_REJECTION',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

const ErrorCodeRegistry = Object.freeze({
  [ErrorCodes.VALIDATION_FAILED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Проверяйте входные данные команд перед обработкой и предоставляйте подсказки по каждому конкретному полю.'
  },
  [ErrorCodes.PERMISSION_DENIED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Проверьте права ролей бота/пользователя и необходимые разрешения Discord для этой команды.'
  },
  [ErrorCodes.CONFIGURATION_ERROR]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Проверьте необходимые переменные окружения и конфигурацию функций сервера.'
  },
  [ErrorCodes.DATABASE_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Проверьте подключение к Postgres, загрузку пула соединений, тайм-ауты запросов и последние миграции.'
  },
  [ErrorCodes.NETWORK_ERROR]: {
    severity: 'medium',
    retryable: true,
    remediation: 'Проверьте доступность сети, статус внешнего сервиса и корректность механизма повторных попыток с задержкой.'
  },
  [ErrorCodes.DISCORD_API_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Проверьте состояние API Discord, ответы с ограничениями частоты запросов и действительность токена бота.'
  },
  [ErrorCodes.USER_INPUT_ERROR]: {
    severity: 'low',
    retryable: false,
    remediation: 'Проверяйте ID/упоминания, введённые пользователем, и предоставляйте более понятные примеры ввода.'
  },
  [ErrorCodes.RATE_LIMITED]: {
    severity: 'low',
    retryable: true,
    remediation: 'Используйте повторные попытки с учётом задержек и уменьшайте количество одновременных выполнений команд.'
  },
  [ErrorCodes.INTERACTION_INVALID]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Убедитесь, что объект взаимодействия существует и является действительным перед отправкой ответа.'
  },
  [ErrorCodes.INTERACTION_EXPIRED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Откладывайте или отправляйте ответы на взаимодействия раньше, чтобы избежать истечения 15-минутного срока.'
  },
  [ErrorCodes.INTERACTION_RESPONSE_FAILED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Проверьте состояние подтверждения взаимодействия и коды ошибок ответа Discord.'
  },
  [ErrorCodes.INTERACTION_UNHANDLED]: {
    severity: 'high',
    retryable: false,
    remediation: 'Добавьте обработчик для этого типа взаимодействия или зарегистрируйте отсутствующий обработчик кнопки, модального окна или меню выбора.'
  },
  [ErrorCodes.TASK_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Проверьте указанную фоновую задачу на наличие выброшенных ошибок или промисов без await.'
  },
  [ErrorCodes.UNHANDLED_REJECTION]: {
    severity: 'high',
    retryable: false,
    remediation: 'Найдите промис, который был отклонён без обработчика catch, и передайте его через runSafeTask или явный catch.'
  },
  [ErrorCodes.UNKNOWN_ERROR]: {
    severity: 'high',
    retryable: false,
    remediation: 'Сохраните контекст трассировки и стек вызовов, а затем классифицируйте эту ошибку под конкретным кодом.'
  }
});

const TypeToErrorCode = Object.freeze({
  validation: ErrorCodes.VALIDATION_FAILED,
  permission: ErrorCodes.PERMISSION_DENIED,
  configuration: ErrorCodes.CONFIGURATION_ERROR,
  database: ErrorCodes.DATABASE_ERROR,
  network: ErrorCodes.NETWORK_ERROR,
  discord_api: ErrorCodes.DISCORD_API_ERROR,
  user_input: ErrorCodes.USER_INPUT_ERROR,
  rate_limit: ErrorCodes.RATE_LIMITED,
  unknown: ErrorCodes.UNKNOWN_ERROR
});

function normalizeErrorCode(errorCode) {
  if (errorCode === null || errorCode === undefined) {
    return null;
  }

  return String(errorCode).trim().toUpperCase();
}

export function getErrorMetadata(errorCode) {
  const normalized = normalizeErrorCode(errorCode);
  if (!normalized) {
    return ErrorCodeRegistry[ErrorCodes.UNKNOWN_ERROR];
  }

  return ErrorCodeRegistry[normalized] || ErrorCodeRegistry[ErrorCodes.UNKNOWN_ERROR];
}

export function getDefaultErrorCodeByType(errorType = 'unknown') {
  return TypeToErrorCode[errorType] || ErrorCodes.UNKNOWN_ERROR;
}

export function resolveErrorCode({ error, errorType = 'unknown', context = {} } = {}) {
  const contextCode = normalizeErrorCode(context?.errorCode);
  if (contextCode) {
    return contextCode;
  }

  const nestedContextCode = normalizeErrorCode(error?.context?.errorCode);
  if (nestedContextCode) {
    return nestedContextCode;
  }

  const code = normalizeErrorCode(error?.code);
  if (code) {
    if (/^\d+$/.test(code) && Number(code) >= 10000) {
      return ErrorCodes.DISCORD_API_ERROR;
    }

    return code;
  }

  return getDefaultErrorCodeByType(errorType);
}

export { ErrorCodes, ErrorCodeRegistry, TypeToErrorCode };
