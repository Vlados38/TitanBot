// musicService.js

import { once } from 'node:events';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import { canControlMusic, requireVoiceChannel, VOICE_CHANNEL_DENIAL } from './permissions.js';
import {
    buildNowPlayingEmbed,
    buildQueueEmbed,
    buildQueuePaginationRow,
    getQueuePageSize,
} from './musicEmbeds.js';
import { refreshPlayerMessage } from './playerHandler.js';

const YOUTUBE_URL_PATTERN = /(?:youtube\.com|youtu\.be)/i;
const PLAYER_CONNECT_TIMEOUT_MS = 12_000;

/**
 * Получает подключённые узлы Lavalink.
 */
function getConnectedLavalinkNodes(client) {
    if (!client.riffy?.nodeMap) {
        return [];
    }

    return [...client.riffy.nodeMap.values()].filter((node) => node.connected);
}

/**
 * Проверяет наличие доступного узла Lavalink.
 */
export function assertLavalinkNodeAvailable(client) {
    if (!getConnectedLavalinkNodes(client).length) {
        throw new TitanBotError(
            'Lavalink unavailable',
            ErrorTypes.CONFIGURATION,
            'Музыка временно недоступна — ни один узел Lavalink не подключён. Попробуйте ещё раз через некоторое время или настройте собственный сервер Lavalink.',
        );
    }
}

/**
 * Проверяет права бота в голосовом канале.
 */
function assertBotVoicePermissions(channel) {
    if (!channel) {
        throw new TitanBotError(
            'Voice channel unavailable',
            ErrorTypes.CONFIGURATION,
            'Не удалось получить доступ к этому голосовому каналу.',
        );
    }

    if (!botHasPermission(channel, [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
        throw new TitanBotError(
            'Missing voice permissions',
            ErrorTypes.PERMISSION,
            'Мне нужны права **Подключение** и **Говорить** в вашем голосовом канале.',
        );
    }
}

/**
 * Ожидает подключения плеера к голосовому каналу.
 */
async function waitForPlayerConnection(player) {
    if (player.connected) {
        return;
    }

    try {
        await player.connection.resolve();
    } catch {
        // Переходим к ожиданию события ниже.
    }

    if (player.connected) {
        return;
    }

    try {
        await once(player, 'connectionRestored', {
            signal: AbortSignal.timeout(PLAYER_CONNECT_TIMEOUT_MS),
        });
    } catch {
        // Истекло время ожидания подтверждения голосовой сессии от Lavalink.
    }

    if (!player.connected) {
        throw new TitanBotError(
            'Voice connection failed',
            ErrorTypes.CONFIGURATION,
            'Не удалось подключиться к голосовому каналу. Убедитесь, что Lavalink запущен, а у бота есть права **Подключение** и **Говорить**, затем попробуйте снова.',
        );
    }
}

/**
 * Запускает воспроизведение.
 */
async function startPlayback(player) {
    await waitForPlayerConnection(player);
    await player.play();
}

/**
 * Получает плеер для сервера.
 */
export function getPlayer(client, guildId) {
    return client.riffy?.players?.get(guildId) || null;
}

/**
 * Проверяет, настроен ли Lavalink.
 */
export function assertRiffyAvailable(client) {
    if (!client.riffy) {
        throw new TitanBotError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Музыка недоступна — Lavalink не настроен.',
        );
    }
}

/**
 * Проверяет, находится ли пользователь в голосовом канале.
 */
export function assertInVoice(member) {
    if (!requireVoiceChannel(member)) {
        throw new TitanBotError(
            'Not in voice channel',
            ErrorTypes.USER_INPUT,
            'Вам нужно находиться в голосовом канале.',
        );
    }
}

/**
 * Проверяет, может ли пользователь управлять музыкой.
 */
export function assertCanControl(member, player) {
    if (!canControlMusic(member, player)) {
        throw new TitanBotError(
            'Wrong voice channel',
            ErrorTypes.PERMISSION,
            VOICE_CHANNEL_DENIAL,
        );
    }
}

/**
 * Создаёт или получает плеер для взаимодействия.
 */
export async function ensurePlayer(client, interaction) {
    assertRiffyAvailable(client);
    assertLavalinkNodeAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    let player = getPlayer(client, guildId);

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
    }

    player.setVolume(guildData.volume);
    return { player, guildData };
}

/**
 * Проверяет, находится ли трек уже в очереди или воспроизводится.
 */
function isDuplicateTrack(player, track) {
    const uri = track?.info?.uri;
    if (!uri) {
        return false;
    }

    if (player.current?.info?.uri === uri) {
        return true;
    }

    return player.queue.some((existing) => existing.info?.uri === uri);
}

/**
 * Подключает бота к голосовому каналу.
 */
export async function joinVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    const channel = interaction.member.voice.channel;

    assertBotVoicePermissions(channel);

    let player = getPlayer(client, guildId);

    if (player && player.voiceChannel !== channel.id) {
        try {
            player.destroy();
        } catch {
            // Плеер мог быть уже удалён.
        }
        player = null;
    }

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
    }

    player.setVolume(guildData.volume);

    return successEmbed(
        'Подключён к голосовому каналу',
        `Подключился к **${channel.name}**. Используйте /play для запуска музыки или /music для управления воспроизведением.`,
    );
}

/**
 * Воспроизводит трек или плейлист по поисковому запросу.
 */
export async function playQuery(client, interaction, query) {
    if (YOUTUBE_URL_PATTERN.test(query)) {
        throw new TitanBotError(
            'YouTube URL blocked',
            ErrorTypes.USER_INPUT,
            'Ссылки на YouTube не поддерживаются. Попробуйте указать название песни.',
        );
    }

    const { player, guildData } = await ensurePlayer(client, interaction);

    const result = await client.riffy.resolve({
        query,
        requester: interaction.user,
    });

    const { loadType, tracks, playlistInfo } = result;

    if (loadType === 'playlist' || loadType === 'PLAYLIST_LOADED') {
        let added = 0;
        let skipped = 0;

        for (const track of tracks) {
            track.info.requester = interaction.user;

            if (isDuplicateTrack(player, track)) {
                skipped += 1;
                continue;
            }

            player.queue.add(track);
            added += 1;
        }

        if (!player.playing && !player.paused) {
            await startPlayback(player);
        }

        return {
            embed: successEmbed(
                'Плейлист добавлен',
                `**${playlistInfo?.name || 'Плейлист'}**\nДобавлено ${added} из ${tracks.length} трек(ов).${skipped ? ` Пропущено дубликатов: ${skipped}.` : ''}`,
            ),
        };
    }

    if (
        loadType === 'search'
        || loadType === 'track'
        || loadType === 'SEARCH_RESULT'
        || loadType === 'TRACK_LOADED'
    ) {
        const track = tracks?.[0];

        if (!track) {
            throw new TitanBotError(
                'No results',
                ErrorTypes.USER_INPUT,
                'По вашему запросу ничего не найдено.',
            );
        }

        if (isDuplicateTrack(player, track)) {
            throw new TitanBotError(
                'Duplicate track',
                ErrorTypes.USER_INPUT,
                `**${track.info.title}** уже находится в очереди или воспроизводится.`,
            );
        }

        track.info.requester = interaction.user;

        const willPlayNow = !player.playing && !player.paused;

        player.queue.add(track);
        const queuePosition = player.queue.length;

        if (willPlayNow) {
            await startPlayback(player);
        }

        return {
            embed: successEmbed(
                willPlayNow ? 'Сейчас играет' : 'Трек добавлен',
                willPlayNow
                    ? `**${track.info.title}**\n${track.info.author}`
                    : `**${track.info.title}**\n${track.info.author}\nПозиция: #${queuePosition} в очереди`,
            ),
        };
    }

    throw new TitanBotError(
        'No results',
        ErrorTypes.USER_INPUT,
        `Ничего не найдено. (loadType: ${loadType})`,
    );
}

/**
 * Пропускает текущий трек.
 */
export async function skipTrack(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.current) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Сейчас ничего не воспроизводится.',
        );
    }

    assertCanControl(interaction.member, player);

    const title = player.current.info?.title || 'Неизвестный трек';

    // При повторе одного трека stop() запустил бы его снова.
    // Отключаем повтор, чтобы пропуск действительно перешёл к следующему треку.
    // trackStart повторно применит сохранённый режим повтора к следующему треку.
    if (player.loop === 'track') {
        player.setLoop('none');
    }

    player.stop();

    return successEmbed('Пропущено', `Пропущен трек **${title}**.`);
}

/**
 * Останавливает воспроизведение и очищает очередь.
 */
export async function stopPlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Активного музыкального плеера нет.',
        );
    }

    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    const queueLength = player.queue?.length || 0;

    if (queueLength >= 5 && guildData.stopConfirmPending !== interaction.user.id) {
        guildData.stopConfirmPending = interaction.user.id;

        setTimeout(() => {
            if (guildData.stopConfirmPending === interaction.user.id) {
                guildData.stopConfirmPending = null;
            }
        }, 15000);

        return successEmbed(
            'Подтвердите остановку',
            `В очереди находится **${queueLength}** треков. Повторно выполните **/music stop** в течение 15 секунд для подтверждения.`,
        );
    }

    guildData.stopConfirmPending = null;

    await destroyPlayerSession(client, interaction.guild.id, player, guildData);

    return successEmbed(
        'Остановлено',
        'Воспроизведение остановлено, а очередь очищена.',
    );
}

/**
 * Приостанавливает воспроизведение.
 */
export async function applyPause(client, guildId) {
    const player = getPlayer(client, guildId);

    if (!player?.current || player.paused) {
        return false;
    }

    player.pause(true);
    await refreshPlayerMessage(client, guildId);

    return true;
}

/**
 * Возобновляет воспроизведение.
 */
export async function applyResume(client, guildId) {
    const player = getPlayer(client, guildId);

    if (!player?.current || !player.paused) {
        return false;
    }

    player.pause(false);
    await refreshPlayerMessage(client, guildId);

    return true;
}

/**
 * Ставит воспроизведение на паузу.
 */
export async function pausePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.current) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Сейчас ничего не воспроизводится.',
        );
    }

    assertCanControl(interaction.member, player);

    if (player.paused) {
        throw new TitanBotError(
            'Already paused',
            ErrorTypes.USER_INPUT,
            'Воспроизведение уже приостановлено.',
        );
    }

    await applyPause(client, interaction.guild.id);

    return successEmbed('Пауза', 'Воспроизведение приостановлено.');
}

/**
 * Возобновляет воспроизведение.
 */
export async function resumePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.current) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Сейчас ничего не воспроизводится.',
        );
    }

    assertCanControl(interaction.member, player);

    if (!player.paused) {
        throw new TitanBotError(
            'Not paused',
            ErrorTypes.USER_INPUT,
            'Воспроизведение не находится на паузе.',
        );
    }

    await applyResume(client, interaction.guild.id);

    return successEmbed('Возобновлено', 'Воспроизведение возобновлено.');
}

/**
 * Перемешивает очередь.
 */
export async function shuffleQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.queue?.length) {
        throw new TitanBotError(
            'Empty queue',
            ErrorTypes.USER_INPUT,
            'Очередь пуста.',
        );
    }

    assertCanControl(interaction.member, player);

    player.queue.shuffle();
    getGuildMusicData(interaction.guild.id).shuffle = true;

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed('Перемешано', 'Очередь была перемешана.');
}

/**
 * Устанавливает режим повтора.
 */
export async function setLoopMode(client, interaction, mode) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Активного музыкального плеера нет.',
        );
    }

    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);

    guildData.loop = mode;
    player.setLoop(mode);

    const labels = {
        none: 'Выкл.',
        track: 'Трек',
        queue: 'Очередь',
    };

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed(
        'Повтор обновлён',
        `Режим повтора установлен: **${labels[mode] || mode}**.`,
    );
}

/**
 * Переключает режим повтора.
 */
export async function toggleLoop(client, interaction) {
    const guildData = getGuildMusicData(interaction.guild.id);

    const next =
        guildData.loop === 'none'
            ? 'track'
            : guildData.loop === 'track'
                ? 'queue'
                : 'none';

    return setLoopMode(client, interaction, next);
}

/**
 * Устанавливает громкость.
 */
export async function setVolume(client, interaction, volume) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Активного музыкального плеера нет.',
        );
    }

    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);

    guildData.volume = Math.max(0, Math.min(100, volume));

    player.setVolume(guildData.volume);

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed(
        'Громкость обновлена',
        `Громкость установлена на **${guildData.volume}%**.`,
    );
}

/**
 * Изменяет громкость на указанное значение.
 */
export async function adjustVolume(client, interaction, delta) {
    const guildData = getGuildMusicData(interaction.guild.id);
    return setVolume(client, interaction, guildData.volume + delta);
}

/**
 * Перематывает текущий трек.
 */
export async function seekTrack(client, interaction, seconds) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.current) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Сейчас ничего не воспроизводится.',
        );
    }

    assertCanControl(interaction.member, player);

    const info = player.current.info || {};

    if (info.isStream || info.isSeekable === false) {
        throw new TitanBotError(
            'Not seekable',
            ErrorTypes.USER_INPUT,
            'Этот трек нельзя перематывать (возможно, это прямая трансляция).',
        );
    }

    const position = Math.max(0, seconds * 1000);

    if (info.length && position > info.length) {
        throw new TitanBotError(
            'Seek out of range',
            ErrorTypes.USER_INPUT,
            `Для этого трека можно перемотать максимум на ${Math.floor(info.length / 1000)} с.`,
        );
    }

    player.seek(position);

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed(
        'Перемотано',
        `Воспроизведение перемотано на **${seconds} с**.`,
    );
}

/**
 * Удаляет трек из очереди.
 */
export async function removeFromQueue(client, interaction, index) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.queue?.length) {
        throw new TitanBotError(
            'Empty queue',
            ErrorTypes.USER_INPUT,
            'Очередь пуста.',
        );
    }

    assertCanControl(interaction.member, player);

    const queueIndex = index - 1;

    if (queueIndex < 0 || queueIndex >= player.queue.length) {
        throw new TitanBotError(
            'Invalid index',
            ErrorTypes.USER_INPUT,
            `Недопустимая позиция в очереди. В очереди ${player.queue.length} трек(ов).`,
        );
    }

    const removed = player.queue[queueIndex];

    player.queue.remove(queueIndex);

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed(
        'Удалено',
        `**${removed.info?.title || 'Трек'}** удалён из очереди.`,
    );
}

/**
 * Перемещает трек внутри очереди.
 */
export async function moveInQueue(client, interaction, from, to) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.queue?.length) {
        throw new TitanBotError(
            'Empty queue',
            ErrorTypes.USER_INPUT,
            'Очередь пуста.',
        );
    }

    assertCanControl(interaction.member, player);

    const fromIndex = from - 1;
    const toIndex = to - 1;

    if (
        fromIndex < 0
        || fromIndex >= player.queue.length
        || toIndex < 0
        || toIndex >= player.queue.length
    ) {
        throw new TitanBotError(
            'Invalid index',
            ErrorTypes.USER_INPUT,
            'Недопустимые позиции в очереди.',
        );
    }

    const track = player.queue[fromIndex];

    player.queue.remove(fromIndex);
    player.queue.splice(toIndex, 0, track);

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed(
        'Перемещено',
        `**${track.info?.title || 'Трек'}** перемещён на позицию #${to}.`,
    );
}

/**
 * Очищает очередь.
 */
export async function clearQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);

    if (!player?.queue?.length) {
        throw new TitanBotError(
            'Empty queue',
            ErrorTypes.USER_INPUT,
            'Очередь уже пуста.',
        );
    }

    assertCanControl(interaction.member, player);

    player.queue.clear();

    await refreshPlayerMessage(client, interaction.guild.id);

    return successEmbed(
        'Очередь очищена',
        'Все треки из очереди были удалены.',
    );
}

/**
 * Включает или выключает режим 24/7.
 */
export async function setTwentyFourSeven(client, interaction, enabled) {
    const guildData = getGuildMusicData(interaction.guild.id);

    guildData.twentyFourSeven = enabled;

    return successEmbed(
        'Режим 24/7',
        enabled
            ? 'Режим 24/7 включён. Бот останется в голосовом канале после окончания очереди.'
            : 'Режим 24/7 выключен. Бот покинет голосовой канал через 30 секунд бездействия.',
    );
}

/**
 * Формирует ответ с информацией о текущем треке.
 */
export function buildNowPlayingReply(client, guildId) {
    const player = getPlayer(client, guildId);

    if (!player?.current) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Сейчас ничего не воспроизводится.',
        );
    }

    const guildData = getGuildMusicData(guildId);

    return {
        embeds: [buildNowPlayingEmbed(player.current, player, guildData)],
    };
}

/**
 * Формирует ответ с очередью и пагинацией.
 */
export function buildQueueReply(client, guildId, page = 0) {
    const player = getPlayer(client, guildId);

    if (!player) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Активного музыкального плеера нет.',
        );
    }

    const totalPages = Math.max(
        1,
        Math.ceil((player.queue?.length || 0) / getQueuePageSize()),
    );

    const safePage = Math.min(
        Math.max(page, 0),
        totalPages - 1,
    );

    return {
        embeds: [buildQueueEmbed(player.queue, player.current, safePage)],
        components:
            totalPages > 1
                ? [buildQueuePaginationRow(safePage, totalPages)]
                : [],
        page: safePage,
        totalPages,
    };
}

/**
 * Уничтожает сессию музыкального плеера.
 */
export async function destroyPlayerSession(
    client,
    guildId,
    player,
    guildData,
    { forceDisconnect = false } = {},
) {
    clearUpdateInterval(guildData);

    if (guildData.idleTimeout) {
        clearTimeout(guildData.idleTimeout);
        guildData.idleTimeout = null;
    }

    guildData.previousTracks = [];
    guildData.stopConfirmPending = null;
    guildData.autoPaused = false;
    guildData.queuePages?.clear();

    if (guildData.playerMessageId && guildData.playerChannelId) {
        try {
            const channel = client.channels.cache.get(guildData.playerChannelId);

            if (channel) {
                const msg = await channel.messages.fetch(guildData.playerMessageId);
                await msg.delete();
            }
        } catch {
            // Сообщение уже было удалено.
        }
    }

    guildData.playerMessageId = null;
    guildData.playerChannelId = null;

    if (player) {
        player.queue.clear();
        player.stop();

        if (forceDisconnect || !guildData.twentyFourSeven) {
            player.destroy();
        }
    }
}

/**
 * Отключает бота от голосового канала.
 */
export async function leaveVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);

    const guildId = interaction.guild.id;
    const player = getPlayer(client, guildId);

    if (!player) {
        throw new TitanBotError(
            'No player',
            ErrorTypes.USER_INPUT,
            'Я не нахожусь в голосовом канале.',
        );
    }

    assertCanControl(interaction.member, player);

    const channel = interaction.guild.channels.cache.get(player.voiceChannel);
    const channelName = channel?.name || 'голосовой канал';

    const guildData = getGuildMusicData(guildId);

    await destroyPlayerSession(
        client,
        guildId,
        player,
        guildData,
        { forceDisconnect: true },
    );

    return successEmbed(
        'Покинул голосовой канал',
        `Отключился от **${channelName}**.`,
    );
}

/**
 * Отправляет успешный ответ музыкальной команды.
 */
export async function replyMusicSuccess(interaction, embed) {
    const options = { embeds: [embed] };

    if (!interaction._isPrefixCommand) {
        options.flags = MessageFlags.Ephemeral;
    }

    await InteractionHelper.safeReply(interaction, options);
}
