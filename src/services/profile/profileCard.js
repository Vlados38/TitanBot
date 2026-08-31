import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1100;
const HEIGHT = 620;

const FONT_PATH = path.resolve(
    process.cwd(),
    'assets/fonts/RussoOne-Regular.ttf'
);

/**
 * =========================================================
 * PALETTE
 * =========================================================
 */

const COLORS = {
    background: '#090611',
    background2: '#120B1D',

    purple: '#A855F7',
    purpleLight: '#C084FC',
    purpleBright: '#E9D5FF',

    white: '#FFFFFF',
    text: '#D9D3E3',
    muted: '#82788F',
    mutedDark: '#51485D',

    panel: '#100B19',
    panelLight: '#171020',

    progressBackground: '#292332',

    green: '#57F287',
    gold: '#F1C40F',
    blue: '#5865F2',
};

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '0';
    }

    return number.toLocaleString('ru-RU');
}

function truncate(value, maxLength = 25) {
    const text = String(value ?? '');

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
}

function createProgressBar(current, total, width) {
    current = Number(current) || 0;
    total = Number(total) || 0;

    if (total <= 0) {
        return {
            percentage: 100,
            filled: width,
        };
    }

    const percentage = Math.min(
        100,
        Math.max(
            0,
            Math.round(
                current / total * 100
            )
        )
    );

    return {
        percentage,
        filled: Math.round(
            width * percentage / 100
        ),
    };
}

function getRarityColor(rarity) {
    switch (rarity) {
        case 'legendary':
            return COLORS.gold;

        case 'epic':
            return '#A855F7';

        case 'rare':
            return '#3498DB';

        case 'uncommon':
            return '#2ECC71';

        default:
            return '#95A5A6';
    }
}

function getRarityName(rarity) {
    switch (rarity) {
        case 'legendary':
            return 'ЛЕГЕНДАРНОЕ';

        case 'epic':
            return 'ЭПИЧЕСКОЕ';

        case 'rare':
            return 'РЕДКОЕ';

        case 'uncommon':
            return 'НЕОБЫЧНОЕ';

        default:
            return 'ОБЫЧНОЕ';
    }
}

/**
 * =========================================================
 * FONT
 * =========================================================
 */

async function verifyFont() {
    try {
        await fs.access(FONT_PATH);
    } catch {
        throw new Error(
            `[PROFILE CARD] Russo One не найден:\n${FONT_PATH}`
        );
    }
}

/**
 * =========================================================
 * AVATAR
 * =========================================================
 */

async function avatarToDataUri(avatarUrl) {
    const response = await fetch(avatarUrl);

    if (!response.ok) {
        throw new Error(
            `Не удалось загрузить аватар: HTTP ${response.status}`
        );
    }

    const buffer = Buffer.from(
        await response.arrayBuffer()
    );

    const png = await sharp(buffer)
        .resize(240, 240, {
            fit: 'cover',
            position: 'centre',
        })
        .png()
        .toBuffer();

    return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * =========================================================
 * USER DATA
 * =========================================================
 */

async function prepareUserData(data) {
    const {
        user,
        member,
        level = 0,
        xp = 0,
        nextLevelXp = 0,
        totalXp = 0,
        wallet = 0,
        bank = 0,
        totalBalance = 0,
        unlockedAchievements = [],
        achievements = [],
        rank = null,
    } = data;

    const safeLevel =
        Number(level) || 0;

    const displayName = truncate(
        user?.globalName ||
        user?.displayName ||
        user?.username ||
        'Неизвестный авантюрист',
        21
    );

    const username = truncate(
        user?.username ||
        'unknown',
        25
    );

    const serverName = truncate(
        member?.guild?.name ||
        'Неизвестный сервер',
        30
    );

    const xpBar = createProgressBar(
        xp,
        nextLevelXp,
        700
    );

    const achievementTotal =
        Array.isArray(achievements)
            ? achievements.length
            : 0;

    const achievementUnlocked =
        Array.isArray(unlockedAchievements)
            ? unlockedAchievements.length
            : 0;

    const achievementPercentage =
        achievementTotal > 0
            ? Math.round(
                achievementUnlocked /
                achievementTotal *
                100
            )
            : 0;

    const rankText =
        rank !== null &&
        Number.isFinite(Number(rank))
            ? `#${formatNumber(rank)}`
            : '—';

    let avatarData = null;

    try {
        const avatarUrl =
            user.displayAvatarURL({
                extension: 'png',
                size: 256,
            });

        avatarData =
            await avatarToDataUri(
                avatarUrl
            );
    } catch {
        avatarData = null;
    }

    return {
        user,
        member,

        safeLevel,

        displayName,
        username,
        serverName,

        xpBar,

        achievementTotal,
        achievementUnlocked,
        achievementPercentage,

        rankText,

        xp,
        nextLevelXp,
        totalXp,

        wallet,
        bank,
        totalBalance,

        achievements,
        unlockedAchievements,

        avatarData,
    };
}

/**
 * =========================================================
 * MAIN PROFILE CARD
 * =========================================================
 */

export async function generateProfileCard(data) {
    await verifyFont();

    const d = await prepareUserData(data);

    const svg = `
<svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
>

<defs>

    <linearGradient
        id="background"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.background}"
        />

        <stop
            offset="55%"
            stop-color="${COLORS.background2}"
        />

        <stop
            offset="100%"
            stop-color="#1A1028"
        />
    </linearGradient>

    <linearGradient
        id="purpleGradient"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.purple}"
        />

        <stop
            offset="55%"
            stop-color="${COLORS.purpleLight}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.purpleBright}"
        />
    </linearGradient>

    <linearGradient
        id="xpGradient"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >
        <stop
            offset="0%"
            stop-color="#7935B8"
        />

        <stop
            offset="60%"
            stop-color="${COLORS.purple}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.purpleBright}"
        />
    </linearGradient>

    <clipPath id="avatarClip">
        <circle
            cx="165"
            cy="235"
            r="91"
        />
    </clipPath>

    <filter id="largeGlow">
        <feGaussianBlur
            stdDeviation="45"
        />
    </filter>

    <filter id="avatarGlow">
        <feGaussianBlur
            stdDeviation="18"
        />
    </filter>

</defs>

<!-- BACKGROUND -->

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="32"
    fill="url(#background)"
/>

<text
    x="1080"
    y="300"
    text-anchor="end"
    fill="${COLORS.purple}"
    opacity="0.035"
    font-family="Russo One"
    font-size="300"
>
    ${d.safeLevel}
</text>

<circle
    cx="980"
    cy="40"
    r="250"
    fill="${COLORS.purple}"
    opacity="0.10"
    filter="url(#largeGlow)"
/>

<circle
    cx="80"
    cy="580"
    r="190"
    fill="${COLORS.purple}"
    opacity="0.06"
    filter="url(#largeGlow)"
/>

<!-- HEADER -->

<rect
    x="55"
    y="34"
    width="990"
    height="1"
    fill="url(#purpleGradient)"
    opacity="0.28"
/>

<rect
    x="55"
    y="34"
    width="220"
    height="2"
    fill="${COLORS.purple}"
    opacity="0.8"
/>

<text
    x="55"
    y="72"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="21"
    letter-spacing="2"
>
    КАРТОЧКА АВАНТЮРИСТА
</text>

<text
    x="1045"
    y="72"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    ДИСБОРД
</text>

<!-- LEFT PANEL -->

<rect
    x="45"
    y="108"
    width="240"
    height="345"
    rx="30"
    fill="${COLORS.panel}"
    fill-opacity="0.72"
    stroke="${COLORS.purple}"
    stroke-opacity="0.12"
    stroke-width="1"
/>

<circle
    cx="165"
    cy="235"
    r="118"
    fill="${COLORS.purple}"
    opacity="0.10"
    filter="url(#avatarGlow)"
/>

<circle
    cx="165"
    cy="235"
    r="105"
    fill="${COLORS.background}"
    stroke="${COLORS.purple}"
    stroke-opacity="0.22"
    stroke-width="2"
/>

${
    d.avatarData
        ? `
<image
    href="${d.avatarData}"
    x="74"
    y="144"
    width="182"
    height="182"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#avatarClip)"
/>
`
        : `
<circle
    cx="165"
    cy="235"
    r="91"
    fill="${COLORS.panelLight}"
/>

<text
    x="165"
    y="250"
    text-anchor="middle"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="46"
>
    ?
</text>
`
}

<circle
    cx="165"
    cy="235"
    r="98"
    fill="none"
    stroke="url(#purpleGradient)"
    stroke-width="4"
/>

<circle
    cx="165"
    cy="235"
    r="107"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="1"
    opacity="0.25"
/>

<rect
    x="80"
    y="355"
    width="170"
    height="40"
    rx="20"
    fill="${COLORS.purple}"
    fill-opacity="0.95"
/>

<text
    x="165"
    y="381"
    text-anchor="middle"
    fill="#110718"
    font-family="Russo One"
    font-size="15"
>
    УРОВЕНЬ ${d.safeLevel}
</text>

<text
    x="65"
    y="428"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    ДОСТИЖЕНИЯ
</text>

<text
    x="255"
    y="428"
    text-anchor="end"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="13"
>
    ${d.achievementUnlocked} / ${d.achievementTotal}
</text>

<rect
    x="65"
    y="438"
    width="190"
    height="5"
    rx="2.5"
    fill="${COLORS.progressBackground}"
/>

<rect
    x="65"
    y="438"
    width="${Math.round(
        190 *
        d.achievementPercentage /
        100
    )}"
    height="5"
    rx="2.5"
    fill="url(#purpleGradient)"
/>

<!-- USER -->

<text
    x="320"
    y="123"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="3"
>
    АВАНТЮРИСТ
</text>

<text
    x="320"
    y="174"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="40"
>
    ${escapeXml(d.displayName)}
</text>

<text
    x="322"
    y="204"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="15"
>
    @${escapeXml(d.username)}
</text>

<circle
    cx="329"
    cy="241"
    r="5"
    fill="${COLORS.purpleLight}"
/>

<text
    x="344"
    y="247"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(d.serverName)}
</text>

<!-- LEVEL -->

<text
    x="320"
    y="300"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    УРОВЕНЬ
</text>

<text
    x="320"
    y="340"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="34"
>
    ${d.safeLevel}
</text>

<text
    x="440"
    y="300"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ПОЗИЦИЯ В РЕЙТИНГЕ
</text>

<text
    x="440"
    y="340"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="30"
>
    ${d.rankText}
</text>

<!-- XP -->

<text
    x="320"
    y="390"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ОПЫТ
</text>

<text
    x="1015"
    y="390"
    text-anchor="end"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="13"
>
    ${d.xpBar.percentage}%
</text>

<rect
    x="320"
    y="405"
    width="695"
    height="15"
    rx="7.5"
    fill="${COLORS.progressBackground}"
/>

<rect
    x="320"
    y="405"
    width="${d.xpBar.filled}"
    height="15"
    rx="7.5"
    fill="url(#xpGradient)"
/>

<text
    x="320"
    y="447"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="13"
>
    ${formatNumber(d.xp)}
    /
    ${formatNumber(d.nextLevelXp)}
    XP
</text>

<text
    x="1015"
    y="447"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="12"
>
    ВСЕГО ${formatNumber(d.totalXp)} XP
</text>

<line
    x1="320"
    y1="474"
    x2="1015"
    y2="474"
    stroke="#FFFFFF"
    stroke-opacity="0.06"
/>

<!-- ECONOMY -->

<text
    x="320"
    y="505"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ОБЩИЙ БАЛАНС
</text>

<text
    x="320"
    y="540"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="22"
>
    ${formatNumber(d.totalBalance)}
</text>

<text
    x="560"
    y="505"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    КОШЕЛЁК
</text>

<text
    x="560"
    y="540"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="22"
>
    ${formatNumber(d.wallet)}
</text>

<text
    x="760"
    y="505"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    БАНК
</text>

<text
    x="760"
    y="540"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="22"
>
    ${formatNumber(d.bank)}
</text>

<!-- DECORATION -->

<path
    d="
        M 1015 108
        L 1045 108
        L 1045 138
    "
    fill="none"
    stroke="${COLORS.purpleLight}"
    stroke-width="2"
    opacity="0.55"
/>

<path
    d="
        M 1025 108
        L 1015 108
        L 1015 118
    "
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="1"
    opacity="0.45"
/>

<circle
    cx="1000"
    cy="575"
    r="3"
    fill="${COLORS.purpleLight}"
    opacity="0.65"
/>

<line
    x1="1010"
    y1="575"
    x2="1045"
    y2="575"
    stroke="${COLORS.purple}"
    stroke-width="1"
    opacity="0.35"
/>

<rect
    x="2"
    y="2"
    width="${WIDTH - 4}"
    height="${HEIGHT - 4}"
    rx="30"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="2"
    opacity="0.38"
/>

<rect
    x="11"
    y="11"
    width="${WIDTH - 22}"
    height="${HEIGHT - 22}"
    rx="24"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="1"
    opacity="0.025"
/>

</svg>
`;

    return sharp(
        Buffer.from(svg, 'utf8')
    )
        .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
        })
        .toBuffer();
}

/**
 * =========================================================
 * ACHIEVEMENTS CARD
 * =========================================================
 */

export async function generateAchievementsCard(data) {
    await verifyFont();

    const {
        user,
        member,
        achievements = [],
        unlockedAchievements = [],
    } = data;

    const safeAchievements =
        Array.isArray(achievements)
            ? achievements
            : [];

    const unlocked =
        Array.isArray(unlockedAchievements)
            ? unlockedAchievements.length
            : safeAchievements.filter(
                achievement =>
                    achievement?.unlocked
            ).length;

    const total =
        safeAchievements.length;

    const percentage =
        total > 0
            ? Math.round(
                unlocked /
                total *
                100
            )
            : 0;

    const displayName =
        truncate(
            user?.globalName ||
            user?.displayName ||
            user?.username ||
            'Неизвестный авантюрист',
            24
        );

    const serverName =
        truncate(
            member?.guild?.name ||
            'Неизвестный сервер',
            30
        );

    /**
     * Показываем первые 6 достижений.
     *
     * Позже можно сделать полноценные страницы
     * через отдельную кнопку "Следующая страница".
     */

    const visibleAchievements =
        safeAchievements.slice(0, 6);

    const achievementRows =
        visibleAchievements
            .map((achievement, index) => {
                const unlockedState =
                    Boolean(
                        achievement?.unlocked
                    );

                const rarity =
                    getRarityColor(
                        achievement?.rarity
                    );

                const rarityName =
                    getRarityName(
                        achievement?.rarity
                    );

                const name =
                    truncate(
                        achievement?.name ||
                        'Без названия',
                        24
                    );

                const description =
                    truncate(
                        achievement?.description ||
                        'Особое достижение',
                        48
                    );

                const icon =
                    unlockedState
                        ? escapeXml(
                            achievement?.emoji ||
                            '🏅'
                        )
                        : '×';

                const opacity =
                    unlockedState
                        ? 1
                        : 0.42;

                const y =
                    215 + index * 57;

                return `
<!-- ACHIEVEMENT ${index} -->

<rect
    x="70"
    y="${y - 30}"
    width="960"
    height="46"
    rx="13"
    fill="${COLORS.panel}"
    fill-opacity="0.82"
    stroke="${rarity}"
    stroke-opacity="${unlockedState ? 0.25 : 0.08}"
    stroke-width="1"
/>

<circle
    cx="98"
    cy="${y - 7}"
    r="15"
    fill="${rarity}"
    opacity="${unlockedState ? 0.15 : 0.06}"
/>

<text
    x="98"
    y="${y}"
    text-anchor="middle"
    fill="${rarity}"
    opacity="${opacity}"
    font-family="Russo One"
    font-size="16"
>
    ${icon}
</text>

<text
    x="128"
    y="${y - 5}"
    fill="${COLORS.white}"
    opacity="${opacity}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(name)}
</text>

<text
    x="128"
    y="${y + 13}"
    fill="${COLORS.muted}"
    opacity="${opacity}"
    font-family="Russo One"
    font-size="9"
>
    ${escapeXml(description)}
</text>

<text
    x="1005"
    y="${y - 5}"
    text-anchor="end"
    fill="${rarity}"
    opacity="${opacity}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1"
>
    ${rarityName}
</text>

<text
    x="1005"
    y="${y + 13}"
    text-anchor="end"
    fill="${unlockedState ? COLORS.green : COLORS.mutedDark}"
    font-family="Russo One"
    font-size="9"
>
    ${unlockedState ? 'ПОЛУЧЕНО' : 'ЗАБЛОКИРОВАНО'}
</text>
`;
            })
            .join('');

    const avatarUrl =
        user.displayAvatarURL({
            extension: 'png',
            size: 128,
        });

    let avatarData = null;

    try {
        avatarData =
            await avatarToDataUri(
                avatarUrl
            );
    } catch {
        avatarData = null;
    }

    const svg = `
<svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
>

<defs>

    <linearGradient
        id="background"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.background}"
        />

        <stop
            offset="55%"
            stop-color="${COLORS.background2}"
        />

        <stop
            offset="100%"
            stop-color="#1A1028"
        />
    </linearGradient>

    <linearGradient
        id="purpleGradient"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.purple}"
        />

        <stop
            offset="55%"
            stop-color="${COLORS.purpleLight}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.purpleBright}"
        />
    </linearGradient>

    <filter id="glow">
        <feGaussianBlur
            stdDeviation="40"
        />
    </filter>

</defs>

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="32"
    fill="url(#background)"
/>

<circle
    cx="950"
    cy="70"
    r="240"
    fill="${COLORS.purple}"
    opacity="0.10"
    filter="url(#glow)"
/>

<circle
    cx="100"
    cy="580"
    r="170"
    fill="${COLORS.purple}"
    opacity="0.06"
    filter="url(#glow)"
/>

<!-- HEADER -->

<rect
    x="55"
    y="34"
    width="990"
    height="1"
    fill="url(#purpleGradient)"
    opacity="0.3"
/>

<rect
    x="55"
    y="34"
    width="230"
    height="2"
    fill="${COLORS.purple}"
    opacity="0.8"
/>

<text
    x="55"
    y="72"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="21"
    letter-spacing="2"
>
    ДОСТИЖЕНИЯ
</text>

<text
    x="1045"
    y="72"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    ДИСБОРД
</text>

<!-- USER -->

${
    avatarData
        ? `
<image
    href="${avatarData}"
    x="55"
    y="95"
    width="48"
    height="48"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#avatarClip)"
/>
`
        : ''
}

<circle
    cx="79"
    cy="119"
    r="25"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="2"
    opacity="0.5"
/>

<text
    x="120"
    y="116"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="16"
>
    ${escapeXml(displayName)}
</text>

<text
    x="120"
    y="136"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
>
    ${escapeXml(serverName)}
</text>

<!-- PROGRESS -->

<text
    x="850"
    y="112"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    text-anchor="end"
    letter-spacing="1"
>
    ПРОГРЕСС
</text>

<text
    x="1030"
    y="115"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="16"
    text-anchor="end"
>
    ${unlocked} / ${total}
</text>

<rect
    x="850"
    y="126"
    width="180"
    height="6"
    rx="3"
    fill="${COLORS.progressBackground}"
/>

<rect
    x="850"
    y="126"
    width="${Math.round(
        180 *
        percentage /
        100
    )}"
    height="6"
    rx="3"
    fill="url(#purpleGradient)"
/>

<!-- ACHIEVEMENTS -->

${achievementRows}

${
    safeAchievements.length === 0
        ? `
<text
    x="550"
    y="310"
    text-anchor="middle"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="16"
>
    ДОСТИЖЕНИЙ ПОКА НЕТ
</text>
`
        : ''
}

<!-- FOOTER -->

<text
    x="55"
    y="580"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    КОЛЛЕКЦИЯ АВАНТЮРИСТА
</text>

<text
    x="1045"
    y="580"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ${percentage}% ЗАВЕРШЕНО
</text>

<!-- BORDER -->

<rect
    x="2"
    y="2"
    width="${WIDTH - 4}"
    height="${HEIGHT - 4}"
    rx="30"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="2"
    opacity="0.38"
/>

<rect
    x="11"
    y="11"
    width="${WIDTH - 22}"
    height="${HEIGHT - 22}"
    rx="24"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="1"
    opacity="0.025"
/>

</svg>
`;

    return sharp(
        Buffer.from(svg, 'utf8')
    )
        .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
        })
        .toBuffer();
}

/**
 * =========================================================
 * STATISTICS CARD
 * =========================================================
 */

export async function generateStatisticsCard(data) {
    await verifyFont();

    const {
        user,
        member,

        level = 0,
        xp = 0,
        nextLevelXp = 0,
        totalXp = 0,

        wallet = 0,
        bank = 0,
        totalBalance = 0,

        achievements = [],
        unlockedAchievements = [],

        joinedAt = null,
        createdAt = null,
    } = data;

    const safeLevel =
        Number(level) || 0;

    const xpBar =
        createProgressBar(
            xp,
            nextLevelXp,
            700
        );

    const achievementTotal =
        Array.isArray(achievements)
            ? achievements.length
            : 0;

    const achievementUnlocked =
        Array.isArray(unlockedAchievements)
            ? unlockedAchievements.length
            : 0;

    const achievementPercentage =
        achievementTotal > 0
            ? Math.round(
                achievementUnlocked /
                achievementTotal *
                100
            )
            : 0;

    const displayName =
        truncate(
            user?.globalName ||
            user?.displayName ||
            user?.username ||
            'Неизвестный авантюрист',
            25
        );

    const serverName =
        truncate(
            member?.guild?.name ||
            'Неизвестный сервер',
            30
        );

    const memberSince =
        joinedAt
            ? `<t:${Math.floor(
                new Date(joinedAt).getTime() /
                1000
            )}:D>`
            : '—';

    const accountCreated =
        createdAt
            ? `<t:${Math.floor(
                new Date(createdAt).getTime() /
                1000
            )}:D>`
            : '—';

    /**
     * В SVG Discord timestamp не отрисуется как Discord timestamp,
     * поэтому для картинки используем обычные значения.
     */

    const memberDate =
        joinedAt
            ? new Date(joinedAt)
                .toLocaleDateString('ru-RU')
            : '—';

    const accountDate =
        createdAt
            ? new Date(createdAt)
                .toLocaleDateString('ru-RU')
            : '—';

    const avatarUrl =
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        });

    let avatarData = null;

    try {
        avatarData =
            await avatarToDataUri(
                avatarUrl
            );
    } catch {
        avatarData = null;
    }

    const svg = `
<svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
>

<defs>

    <linearGradient
        id="background"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.background}"
        />

        <stop
            offset="55%"
            stop-color="${COLORS.background2}"
        />

        <stop
            offset="100%"
            stop-color="#1A1028"
        />
    </linearGradient>

    <linearGradient
        id="purpleGradient"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.purple}"
        />

        <stop
            offset="55%"
            stop-color="${COLORS.purpleLight}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.purpleBright}"
        />
    </linearGradient>

    <filter id="glow">
        <feGaussianBlur
            stdDeviation="40"
        />
    </filter>

</defs>

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="32"
    fill="url(#background)"
/>

<circle
    cx="960"
    cy="70"
    r="240"
    fill="${COLORS.purple}"
    opacity="0.10"
    filter="url(#glow)"
/>

<circle
    cx="80"
    cy="570"
    r="180"
    fill="${COLORS.purple}"
    opacity="0.06"
    filter="url(#glow)"
/>

<!-- HEADER -->

<rect
    x="55"
    y="34"
    width="990"
    height="1"
    fill="url(#purpleGradient)"
    opacity="0.3"
/>

<rect
    x="55"
    y="34"
    width="210"
    height="2"
    fill="${COLORS.purple}"
    opacity="0.8"
/>

<text
    x="55"
    y="72"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="21"
    letter-spacing="2"
>
    СТАТИСТИКА
</text>

<text
    x="1045"
    y="72"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    ДИСБОРД
</text>

<!-- USER -->

${
    avatarData
        ? `
<image
    href="${avatarData}"
    x="55"
    y="98"
    width="58"
    height="58"
    preserveAspectRatio="xMidYMid slice"
/>
`
        : ''
}

<circle
    cx="84"
    cy="127"
    r="31"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="2"
    opacity="0.5"
/>

<text
    x="135"
    y="122"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="18"
>
    ${escapeXml(displayName)}
</text>

<text
    x="137"
    y="143"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
>
    ${escapeXml(serverName)}
</text>

<!-- LEVEL -->

<rect
    x="55"
    y="190"
    width="310"
    height="120"
    rx="22"
    fill="${COLORS.panel}"
    fill-opacity="0.82"
    stroke="${COLORS.purple}"
    stroke-opacity="0.13"
/>

<text
    x="80"
    y="220"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ТЕКУЩИЙ УРОВЕНЬ
</text>

<text
    x="80"
    y="270"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="42"
>
    ${safeLevel}
</text>

<text
    x="205"
    y="220"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ВСЕГО XP
</text>

<text
    x="205"
    y="270"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatNumber(totalXp)}
</text>

<!-- XP -->

<rect
    x="395"
    y="190"
    width="650"
    height="120"
    rx="22"
    fill="${COLORS.panel}"
    fill-opacity="0.82"
    stroke="${COLORS.purple}"
    stroke-opacity="0.13"
/>

<text
    x="425"
    y="220"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ПРОГРЕСС УРОВНЯ
</text>

<text
    x="1015"
    y="220"
    text-anchor="end"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="14"
>
    ${xpBar.percentage}%
</text>

<rect
    x="425"
    y="240"
    width="590"
    height="15"
    rx="7.5"
    fill="${COLORS.progressBackground}"
/>

<rect
    x="425"
    y="240"
    width="${Math.min(
        xpBar.filled,
        590
    )}"
    height="15"
    rx="7.5"
    fill="url(#purpleGradient)"
/>

<text
    x="425"
    y="280"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="13"
>
    ${formatNumber(xp)}
    /
    ${formatNumber(nextLevelXp)}
    XP
</text>

<!-- ECONOMY -->

<text
    x="55"
    y="355"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ЭКОНОМИКА
</text>

<line
    x1="55"
    y1="370"
    x2="1045"
    y2="370"
    stroke="#FFFFFF"
    stroke-opacity="0.06"
/>

<rect
    x="55"
    y="395"
    width="300"
    height="95"
    rx="18"
    fill="${COLORS.panel}"
    fill-opacity="0.8"
/>

<text
    x="80"
    y="423"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    ОБЩИЙ КАПИТАЛ
</text>

<text
    x="80"
    y="460"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatNumber(totalBalance)}
</text>

<rect
    x="375"
    y="395"
    width="300"
    height="95"
    rx="18"
    fill="${COLORS.panel}"
    fill-opacity="0.8"
/>

<text
    x="400"
    y="423"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    КОШЕЛЁК
</text>

<text
    x="400"
    y="460"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatNumber(wallet)}
</text>

<rect
    x="695"
    y="395"
    width="350"
    height="95"
    rx="18"
    fill="${COLORS.panel}"
    fill-opacity="0.8"
/>

<text
    x="720"
    y="423"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    БАНК
</text>

<text
    x="720"
    y="460"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatNumber(bank)}
</text>

<!-- EXTRA -->

<line
    x1="55"
    y1="515"
    x2="1045"
    y2="515"
    stroke="#FFFFFF"
    stroke-opacity="0.06"
/>

<text
    x="55"
    y="545"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    ДОСТИЖЕНИЯ
</text>

<text
    x="55"
    y="575"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="18"
>
    ${achievementUnlocked} / ${achievementTotal}
</text>

<text
    x="310"
    y="545"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    НА СЕРВЕРЕ
</text>

<text
    x="310"
    y="575"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(memberDate)}
</text>

<text
    x="550"
    y="545"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1.5"
>
    АККАУНТ DISCORD
</text>

<text
    x="550"
    y="575"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(accountDate)}
</text>

<text
    x="1045"
    y="575"
    text-anchor="end"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="13"
>
    ${achievementPercentage}% ДОСТИЖЕНИЙ
</text>

<!-- BORDER -->

<rect
    x="2"
    y="2"
    width="${WIDTH - 4}"
    height="${HEIGHT - 4}"
    rx="30"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="2"
    opacity="0.38"
/>

<rect
    x="11"
    y="11"
    width="${WIDTH - 22}"
    height="${HEIGHT - 22}"
    rx="24"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="1"
    opacity="0.025"
/>

</svg>
`;

    return sharp(
        Buffer.from(svg, 'utf8')
    )
        .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
        })
        .toBuffer();
}
