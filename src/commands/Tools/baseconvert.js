import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

const BASE_ALPHABETS = {
    'BIN': { base: 2, prefix: '0b', name: 'Двоичная', alphabet: '01' },
    'OCT': { base: 8, prefix: '0o', name: 'Восьмеричная', alphabet: '0-7' },
    'DEC': { base: 10, prefix: '', name: 'Десятичная', alphabet: '0-9' },
    'HEX': { base: 16, prefix: '0x', name: 'Шестнадцатеричная', alphabet: '0-9A-F' },
    'B64': { base: 64, prefix: 'b64:', name: 'Base64', alphabet: 'A-Za-z0-9+/=' },
    'B36': { base: 36, prefix: '', name: 'Base36', alphabet: '0-9A-Z' },
    'B58': { base: 58, prefix: '', name: 'Base58', alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' },
    'B62': { base: 62, prefix: '', name: 'Base62', alphabet: '0-9A-Za-z' },
};

const BASE_NAMES = Object.entries(BASE_ALPHABETS).map(([key, { name }]) => ({
    name: `${key} (${name})`,
    value: key
}));

const BASE_CHARSETS = {
    BIN: '01',
    OCT: '01234567',
    DEC: '0123456789',
    HEX: '0123456789ABCDEF',
    B36: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    B58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    B62: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

function parseBigIntFromBase(value, baseKey) {
    if (baseKey === 'B64') {
        const bytes = Buffer.from(value, 'base64');
        return bytes.reduce((acc, byte) => (acc * 256n) + BigInt(byte), 0n);
    }

    const charset = BASE_CHARSETS[baseKey];
    if (!charset) {
        throw new Error(`Неподдерживаемая система счисления: ${baseKey}`);
    }

    const normalized = ['BIN', 'OCT', 'DEC', 'HEX', 'B36'].includes(baseKey)
        ? value.toUpperCase()
        : value;

    let result = 0n;
    const base = BigInt(charset.length);

    for (const char of normalized) {
        const digit = charset.indexOf(char);

        if (digit < 0) {
            throw new Error(`Недопустимый символ '${char}' для системы ${baseKey}`);
        }

        result = (result * base) + BigInt(digit);
    }

    return result;
}

function formatBigIntToBase(value, baseKey) {
    if (baseKey === 'B64') {
        if (value === 0n) {
            return Buffer.from([0]).toString('base64');
        }

        const bytes = [];
        let n = value;

        while (n > 0n) {
            bytes.unshift(Number(n & 0xffn));
            n >>= 8n;
        }

        return Buffer.from(bytes).toString('base64');
    }

    const charset = BASE_CHARSETS[baseKey];

    if (!charset) {
        throw new Error(`Неподдерживаемая система счисления: ${baseKey}`);
    }

    if (value === 0n) {
        return '0';
    }

    const base = BigInt(charset.length);
    let n = value;
    let output = '';

    while (n > 0n) {
        const index = Number(n % base);
        output = charset[index] + output;
        n /= base;
    }

    return output;
}

export default {
    data: new SlashCommandBuilder()
        .setName('baseconvert')
        .setDescription('Конвертирует числа между различными системами счисления')
        .addStringOption(option =>
            option
                .setName('number')
                .setDescription('Число для конвертации')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('from')
                .setDescription('Исходная система счисления/формат')
                .setRequired(true)
                .addChoices(...BASE_NAMES)
        )
        .addStringOption(option =>
            option
                .setName('to')
                .setDescription('Целевая система счисления/формат (по умолчанию: все)')
                .setRequired(false)
                .addChoices(...BASE_NAMES)
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Не удалось отложить взаимодействие BaseConvert`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'baseconvert'
            });
            return;
        }

        const numberStr = interaction.options.getString('number').trim();
        const fromBase = interaction.options.getString('from');
        const toBase = interaction.options.getString('to');

        const { prefix: fromPrefix, name: fromName } = BASE_ALPHABETS[fromBase];

        const cleanNumber = fromPrefix && numberStr.startsWith(fromPrefix)
            ? numberStr.slice(fromPrefix.length)
            : numberStr;

        if (!cleanNumber) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Необходимо указать число для конвертации.\n\n**Пример:** `/baseconvert number:1010 from:BIN to:DEC`',
            });
        }

        const alphabet = BASE_ALPHABETS[fromBase].alphabet;
        const regex = new RegExp(`^[${alphabet}]+$`, 'i');

        if (!regex.test(cleanNumber)) {
            let examples = '';

            if (fromBase === 'BIN') {
                examples = '\n\n**Допустимые:** 101, 1010, 11111 | **Недопустимое:** 5 (цифра 5 не разрешена)';
            } else if (fromBase === 'OCT') {
                examples = '\n\n**Допустимые:** 77, 123, 755 | **Недопустимое:** 8 (разрешены только 0-7)';
            } else if (fromBase === 'DEC') {
                examples = '\n\n**Допустимые:** 42, 123, 999 | **Недопустимое:** 12.34 (десятичные дроби не поддерживаются)';
            } else if (fromBase === 'HEX') {
                examples = '\n\n**Допустимые:** FF, A1B2, DEADBEEF | **Недопустимое:** G (разрешены только 0-9, A-F)';
            }

            logger.warn(`Недопустимое значение для конвертации: ${cleanNumber}, система ${fromBase}`);

            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `Вы указали: \`${cleanNumber}\`\n\nДопустимые символы: \`${alphabet}\`${examples}`,
            });
        }

        let decimalValue;

        try {
            decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
        } catch (error) {
            logger.error('Ошибка при разборе числа для конвертации:', error);

            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Число слишком большое для обработки.\n\nПопробуйте использовать меньшее число.',
            });
        }

        if (toBase) {
            const { prefix: toPrefix, name: toName } = BASE_ALPHABETS[toBase];
            let result;

            try {
                result = formatBigIntToBase(decimalValue, toBase);

                const embed = successEmbed(
                    '🔄 Результат конвертации',
                    `**Из ${fromName} (${fromBase}):** \`${fromPrefix}${cleanNumber}\`\n` +
                    `**В ${toName} (${toBase}):** \`${toPrefix}${result}\`\n` +
                    `**Десятичное значение:** \`${decimalValue.toLocaleString()}\``
                );

                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });

            } catch (error) {
                logger.error(`Ошибка конвертации в ${toName}:`, error);

                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Результат слишком большой или несовместим с выбранной системой.\n\nПопробуйте использовать меньшее число или другую систему счисления.',
                });
            }

        } else {
            let description = `**Ввод (${fromName}):** \`${fromPrefix}${cleanNumber}\`\n`;
            description += `**Десятичное значение:** \`${decimalValue.toLocaleString()}\`\n\n`;

            for (const [baseKey, { prefix, name }] of Object.entries(BASE_ALPHABETS)) {
                if (baseKey === fromBase) continue;

                try {
                    const value = formatBigIntToBase(decimalValue, baseKey);

                    description += `**${name} (${baseKey}):** \`${prefix}${value}\`\n`;
                } catch (error) {
                    description += `**${name} (${baseKey}):** *Слишком большое число для конвертации*\n`;
                }
            }

            const embed = successEmbed(
                '🔄 Результаты конвертации',
                description
            );

            embed.setColor(getColor('primary'));

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }
    },
};
