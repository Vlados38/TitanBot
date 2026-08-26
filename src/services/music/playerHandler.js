// Обработчики событий плеера для Riffy.
// Адаптировано из Musicify playerHandler (Apache-2.0).

import { logger } from '../../utils/logger.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import {
    buildNowPlayingEmbed,
    buildPlayerButtonRows,
} from './musicEmbeds.js';

const UPDATE_INTERVAL_MS = 15 * 1000;
const IDLE_DISCONNECT_MS = 30 * 1000;

async function editOrSendPlayerMessage(client, guildData, channelId, embed, components) {
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        return;
    }

    const payload = { embeds: [embed], components };

    if (guildData.playerMessageId) {
        try {
            const msg = await channel.messages.fetch(guildData.playerMessageId);
            await msg.edit(payload);
            return;
        } catch {
            guildData.playerMessageId = null;
            guildData.playerChannelId = null;
            clearUpdateInterval(guildData);
        }
    }

    try {
        const newMsg = await channel.send(payload);
        guildData.playerMessageId = newMsg.id;
        guildData.playerChannelId = channel.id;
    } catch (error) {
        logger.error('Не удалось отправить сообщение музыкального плеера:', error);
    }
}

export async function refreshPlayerMessage(client, guildId) {
    try {
        const player = client.riffy?.players?.get(guildId);

        if (!player?.current) {
            return;
        }

        const guildData = getGuildMusicData(guildId);
        const embed = buildNowPlayingEmbed(player.current, player, guildData);
        const components = buildPlayerButtonRows(player, guildData);
        const channelId = guildData.playerChannelId || player.textChannel;

        await editOrSendPlayerMessage(
            client,
            guildData,
            channelId,
            embed,
            components
        );
    } catch (error) {
        logger.error('Не удалось обновить сообщение музыкального плеера:', error);
    }
}

function startUpdateInterval(client, guildId) {
    const guildData = getGuildMusicData(guildId);

    clearUpdateInterval(guildData);

    guildData.updateInterval = setInterval(() => {
        refreshPlayerMessage(client, guildId);
    }, UPDATE_INTERVAL_MS);
}

export function setupPlayerHandler(client) {
    if (!client.riffy) {
        logger.warn('Riffy не инициализирован; обработчики музыкального плеера не подключены.');
        return;
    }

    // Узлы Lavalink могут часто переподключаться
    // (переподключение → ошибка → переподключение).
    // Ограничиваем сообщения для каждого узла до одной строки за интервал,
    // записываем только первое подключение и полностью игнорируем шум
    // от повторных подключений, поскольку он не несёт полезной информации.
    const nodeLogState = new Map();
    const NODE_LOG_INTERVAL_MS = 5 * 60 * 1000;

    const shouldLogNodeEvent = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? {
            lastLogAt: 0,
            hasConnected: false,
        };

        const now = Date.now();

        if (now - prev.lastLogAt < NODE_LOG_INTERVAL_MS) {
            return false;
        }

        nodeLogState.set(nodeName, {
            ...prev,
            lastLogAt: now,
        });

        return true;
    };

    const markNodeConnected = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? {
            lastLogAt: 0,
            hasConnected: false,
        };

        nodeLogState.set(nodeName, {
            ...prev,
            hasConnected: true,
        });
    };

    client.riffy.on('nodeConnect', (node) => {
        const prev = nodeLogState.get(node.name) ?? {
            lastLogAt: 0,
            hasConnected: false,
        };

        if (prev.hasConnected) {
            return;
        }

        markNodeConnected(node.name);

        logger.info(`Узел Lavalink "${node.name}" подключён.`);
    });

    client.riffy.on('nodeReconnect', () => {
        // Намеренно ничего не записываем —
        // частые сообщения о переподключении не несут полезной информации.
    });

    client.riffy.on('nodeError', (node, error) => {
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }

        logger.warn(
            `Ошибка узла Lavalink "${node.name}": ${error?.message || error}`
        );
    });

    client.riffy.on('nodeDisconnect', (node) => {
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }

        logger.warn(`Узел Lavalink "${node.name}" отключён.`);
    });

    client.riffy.on('trackStart', async (player, track) => {
        try {
            const guildData = getGuildMusicData(player.guildId);

            // Синхронизируем режим повтора плеера Lavalink
            // с сохранённой настройкой.
            // Skip временно отключает повтор текущего трека,
            // чтобы перейти дальше; здесь режим повтора восстанавливается.
            if (guildData.loop && player.loop !== guildData.loop) {
                player.setLoop(guildData.loop);
            }

            if (player.previous) {
                guildData.previousTracks.push(player.previous);

                if (guildData.previousTracks.length > 20) {
                    guildData.previousTracks.shift();
                }
            }

            if (guildData.idleTimeout) {
                clearTimeout(guildData.idleTimeout);
                guildData.idleTimeout = null;
            }

            const embed = buildNowPlayingEmbed(track, player, guildData);
            const components = buildPlayerButtonRows(player, guildData);
            const channelId = guildData.playerChannelId || player.textChannel;

            await editOrSendPlayerMessage(
                client,
                guildData,
                channelId,
                embed,
                components
            );

            startUpdateInterval(client, player.guildId);
        } catch (error) {
            logger.error('Ошибка music trackStart:', error);
        }
    });

    client.riffy.on('queueEnd', async (player) => {
        try {
            const guildData = getGuildMusicData(player.guildId);

            clearUpdateInterval(guildData);

            if (guildData.autoplay) {
                player.autoplay(player);
                return;
            }

            if (guildData.playerMessageId && guildData.playerChannelId) {
                try {
                    const channel = client.channels.cache.get(
                        guildData.playerChannelId
                    );

                    if (channel) {
                        const msg = await channel.messages.fetch(
                            guildData.playerMessageId
                        );

                        await msg.delete();
                    }
                } catch {
                    // Сообщение уже удалено.
                }

                guildData.playerMessageId = null;
                guildData.playerChannelId = null;
            }

            if (!guildData.twentyFourSeven) {
                if (guildData.idleTimeout) {
                    clearTimeout(guildData.idleTimeout);
                }

                guildData.idleTimeout = setTimeout(() => {
                    try {
                        const currentPlayer =
                            client.riffy.players.get(player.guildId);

                        if (
                            currentPlayer &&
                            !currentPlayer.playing &&
                            !currentPlayer.paused &&
                            !currentPlayer.current
                        ) {
                            currentPlayer.destroy();
                        }
                    } catch {
                        // Плеер уже уничтожен.
                    }

                    guildData.idleTimeout = null;
                }, IDLE_DISCONNECT_MS);
            }
        } catch (error) {
            logger.error('Ошибка music queueEnd:', error);
        }
    });

    client.riffy.on('playerDisconnect', async (player) => {
        const guildData = getGuildMusicData(player.guildId);

        clearUpdateInterval(guildData);

        if (guildData.playerMessageId && guildData.playerChannelId) {
            try {
                const channel = client.channels.cache.get(
                    guildData.playerChannelId
                );

                if (channel) {
                    const msg = await channel.messages.fetch(
                        guildData.playerMessageId
                    );

                    await msg.delete();
                }
            } catch {
                // Сообщение уже удалено.
            }
        }

        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        guildData.previousTracks = [];
        guildData.autoPaused = false;

        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
            guildData.idleTimeout = null;
        }
    });

    client.riffy.on('trackError', async (player, track, payload) => {
        logger.error(
            `Ошибка трека в ${player.guildId} для "${track?.info?.title}":`,
            payload?.error || payload
        );

        const guildData = getGuildMusicData(player.guildId);

        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(
                guildData.playerChannelId
            );

            if (channel) {
                channel.send(
                    `Не удалось воспроизвести **${track?.info?.title || 'трек'}**. Пропускаем...`
                ).catch(() => null);
            }
        }
    });

    client.riffy.on('trackStuck', async (player, track, payload) => {
        logger.warn(
            `Трек завис в ${player.guildId} для "${track?.info?.title}" ` +
            `(${payload?.thresholdMs}мс)`
        );
    });
}

export async function shutdownMusic(client) {
    if (!client.riffy?.players) {
        return;
    }

    for (const player of client.riffy.players.values()) {
        try {
            player.destroy();
        } catch (error) {
            logger.debug(
                'Ошибка уничтожения музыкального плеера при завершении работы:',
                error.message
            );
        }
    }
}
