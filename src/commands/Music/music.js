import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    skipTrack,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    shuffleQueue,
    setLoopMode,
    setVolume,
    seekTrack,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setTwentyFourSeven,
    leaveVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Управление воспроизведением, очередью и настройками голосового канала')
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('Приостановить воспроизведение'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('Возобновить воспроизведение'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Пропустить текущий трек'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('Остановить воспроизведение и очистить очередь'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('Перемешать очередь'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('Установить режим повтора')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('Режим повтора')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Выкл.', value: 'none' },
                            { name: 'Трек', value: 'track' },
                            { name: 'Очередь', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('Установить громкость воспроизведения')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('Громкость (0–100)').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Перейти к определённой позиции в текущем треке')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('Позиция в секундах').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Удалить трек из очереди')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('Позиция в очереди').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Переместить трек в очереди')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('Текущая позиция').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('Новая позиция').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Очистить очередь'),
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Отключить бота от голосового канала'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('Переключить режим 24/7 (оставаться в голосовом канале бездействуя)')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('Включить или отключить режим 24/7').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'pause': {
                const embed = await pausePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'resume': {
                const embed = await resumePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'skip': {
                const embed = await skipTrack(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'stop': {
                const embed = await stopPlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'shuffle': {
                const embed = await shuffleQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'loop': {
                const embed = await setLoopMode(client, interaction, interaction.options.getString('mode'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'volume': {
                const embed = await setVolume(client, interaction, interaction.options.getInteger('level'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'seek': {
                const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'remove': {
                const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'move': {
                const embed = await moveInQueue(
                    client,
                    interaction,
                    interaction.options.getInteger('from'),
                    interaction.options.getInteger('to'),
                );
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'clear': {
                const embed = await clearQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'leave': {
                const embed = await leaveVoiceChannel(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case '247': {
                const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            default:
                await InteractionHelper.safeEditReply(interaction, {
                    content: 'Неизвестная музыкальная подкоманда.',
                });
        }
    },
};
