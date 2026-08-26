import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPaginationRow } from '../../utils/components.js';

const QUEUE_PAGE_SIZE = 10;

// ID кнопок управления музыкой
export const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',              // Пауза
    RESUME: 'music_resume',            // Продолжить
    SKIP: 'music_skip',                // Пропустить
    STOP: 'music_stop',                // Остановить
    SHUFFLE: 'music_shuffle',          // Перемешать
    LOOP: 'music_loop',                // Повтор
    VOL_DOWN: 'music_vol_down',        // Уменьшить громкость
    VOL_UP: 'music_vol_up',            // Увеличить громкость
    QUEUE: 'music_queue',              // Очередь
    QUEUE_FIRST: 'music_queue_first',  // Первая страница очереди
    QUEUE_PREV: 'music_queue_prev',    // Предыдущая страница
    QUEUE_NEXT: 'music_queue_next',    // Следующая страница
    QUEUE_LAST: 'music_queue_last',    // Последняя страница
};

// Форматирование длительности трека
export function formatDuration(ms) {
    if (!ms || Number.isNaN(ms)) {
        return 'Прямой эфир';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Получение изображения обложки трека
function getTrackArtwork(track) {
    return track?.info?.artworkUrl || track?.info?.thumbnail || null;
}

// Получение отображаемого названия режима повтора
function getLoopLabel(loop) {
    switch (loop) {
        case 'track':
            return 'Трек';
        case 'queue':
            return 'Очередь';
        default:
            return 'Выкл.';
    }
}

// Создание Embed с информацией о текущем треке
export function buildNowPlayingEmbed(track, player, guildData) {
    const requester = track?.info?.requester;

    const requesterLabel = requester
        ? (requester.username || requester.tag || 'Неизвестно')
        : 'Неизвестно';

    const position = formatDuration(player?.position || 0);
    const duration = formatDuration(track?.info?.length || 0);

    return createEmbed({
        title: 'Сейчас играет',
        description: track?.info?.title || 'Неизвестный трек',
        color: 'primary',

        fields: [
            {
                name: 'Исполнитель',
                value: track?.info?.author || 'Неизвестно',
                inline: true,
            },
            {
                name: 'Запросил',
                value: requesterLabel,
                inline: true,
            },
            {
                name: 'Прогресс',
                value: `${position} / ${duration}`,
                inline: true,
            },
            {
                name: 'Громкость',
                value: `${guildData?.volume ?? 75}%`,
                inline: true,
            },
            {
                name: 'Повтор',
                value: getLoopLabel(guildData?.loop),
                inline: true,
            },
            {
                name: 'Очередь',
                value: `${player?.queue?.length || 0} трек(ов)`,
                inline: true,
            },
        ],

        thumbnail: getTrackArtwork(track),
        footer: player?.paused ? 'На паузе' : 'Воспроизводится',
    });
}

// Создание Embed с очередью треков
export function buildQueueEmbed(queue, currentTrack, page = 0) {
    const totalTracks = queue?.length || 0;
    const totalPages = Math.max(
        1,
        Math.ceil(totalTracks / QUEUE_PAGE_SIZE)
    );

    const safePage = Math.min(
        Math.max(page, 0),
        totalPages - 1
    );

    const start = safePage * QUEUE_PAGE_SIZE;
    const slice = queue?.slice(
        start,
        start + QUEUE_PAGE_SIZE
    ) || [];

    let description = '';

    if (currentTrack) {
        description +=
            `**Сейчас играет**\n` +
            `${currentTrack.info?.title || 'Неизвестно'} — ` +
            `${currentTrack.info?.author || 'Неизвестно'}\n\n`;
    }

    if (slice.length === 0) {
        description += 'Очередь пуста.';
    } else {
        description += slice
            .map((track, index) => {
                const num = start + index + 1;

                return (
                    `${num}. ` +
                    `${track.info?.title || 'Неизвестно'} — ` +
                    `${track.info?.author || 'Неизвестно'}`
                );
            })
            .join('\n');
    }

    return createEmbed({
        title: 'Очередь музыки',
        description: description.substring(0, 4096),
        color: 'info',
        footer: `Страница ${safePage + 1} из ${totalPages} • ${totalTracks} в очереди`,
    });
}

// Создание рядов кнопок управления плеером
export function buildPlayerButtonRows(player, guildData) {
    const paused = player?.paused;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE)
            .setLabel('Пауза')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏸️')
            .setDisabled(Boolean(paused)),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.RESUME)
            .setLabel('Продолжить')
            .setStyle(ButtonStyle.Success)
            .setEmoji('▶️')
            .setDisabled(!paused),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setLabel('Пропустить')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.STOP)
            .setLabel('Стоп')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
            .setLabel('Перемешать')
            .setStyle(
                guildData?.shuffle
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary
            )
            .setEmoji('🔀'),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LOOP)
            .setLabel('Повтор')
            .setStyle(
                guildData?.loop !== 'none'
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary
            )
            .setEmoji('🔁'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
            .setLabel('Громкость -')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔉'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
            .setLabel('Громкость +')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔊'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
            .setLabel('Очередь')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
    );

    return [row1, row2];
}

// Создание строки кнопок для навигации по страницам очереди
export function buildQueuePaginationRow(page, totalPages) {
    return getPaginationRow(
        'music_queue',
        page + 1,
        totalPages
    );
}

// Получение количества треков на одной странице
export function getQueuePageSize() {
    return QUEUE_PAGE_SIZE;
}
