export const VOICE_CHANNEL_DENIAL =
    'Вы должны находиться в том же голосовом канале, что и бот, чтобы управлять музыкой.';

export function canControlMusic(member, player) {
    const memberChannel = member?.voice?.channel;

    if (!memberChannel || !player?.voiceChannel) {
        return false;
    }

    return memberChannel.id === player.voiceChannel;
}

export function requireVoiceChannel(member) {
    return Boolean(member?.voice?.channel);
}
