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

function truncate(value, maxLength = 24) {
    const text = String(value ?? '');

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Сиреневая палитра.
 *
 * Здесь специально НЕ меняем цвет
 * в зависимости от уровня.
 *
 * Карточка имеет единый стиль TitanBot.
 */
const COLORS = {
    accent: '#A855F7',
    accentLight: '#C084FC',
    accentBright: '#D8B4FE',

    background: '#080611',
    background2: '#0D0917',

    panel: '#110D1C',
    panelLight: '#151021',

    white: '#FFFFFF',
    text: '#DCD6E8',
    muted: '#837A96',
    darkMuted: '#514A60',

    progressBackground: '#292334',
};

/**
 * =========================================================
 * PROGRESS
 * =========================================================
 */

function createProgressBar(
    current,
    total,
    width
) {
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

async function avatarToDataUri(
    avatarUrl
) {
    const response =
        await fetch(avatarUrl);

    if (!response.ok) {
        throw new Error(
            `Не удалось загрузить аватар: HTTP ${response.status}`
        );
    }

    const buffer =
        Buffer.from(
            await response.arrayBuffer()
        );

    const png =
        await sharp(buffer)
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
 * MAIN
 * =========================================================
 */

export async function generateProfileCard(data) {
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

        unlockedAchievements = [],
        achievements = [],

        rank = null,
    } = data;

    const safeLevel =
        Number(level) || 0;

    /**
     * -------------------------------------------------------
     * USER
     * -------------------------------------------------------
     */

    const displayName =
        truncate(
            user?.globalName ||
            user?.displayName ||
            user?.username ||
            'Unknown',
            19
        );

    const username =
        truncate(
            user?.username ||
            'unknown',
            25
        );

    const serverName =
        truncate(
            member?.guild?.name ||
            'TitanBot',
            28
        );

    /**
     * -------------------------------------------------------
     * XP
     * -------------------------------------------------------
     */

    const xpBar =
        createProgressBar(
            xp,
            nextLevelXp,
            665
        );

    /**
     * -------------------------------------------------------
     * ACHIEVEMENTS
     * -------------------------------------------------------
     */

    const achievementTotal =
        Array.isArray(achievements)
            ? achievements.length
            : 0;

    const achievementUnlocked =
        Array.isArray(
            unlockedAchievements
        )
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

    const achievementBar =
        Math.round(
            220 *
            achievementPercentage /
            100
        );

    /**
     * -------------------------------------------------------
     * RANK
     * -------------------------------------------------------
     */

    const rankText =
        rank !== null &&
        Number.isFinite(Number(rank))
            ? `#${formatNumber(rank)}`
            : '—';

    /**
     * -------------------------------------------------------
     * AVATAR
     * -------------------------------------------------------
     */

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

    /**
     * =======================================================
     * SVG
     * =======================================================
     */

    const svg = `
<svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
>

<defs>

    <!-- =================================================
         BACKGROUND
    ================================================== -->

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
            stop-color="#161025"
        />
    </linearGradient>


    <!-- =================================================
         ACCENT
    ================================================== -->

    <linearGradient
        id="accentGradient"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.accent}"
        />

        <stop
            offset="50%"
            stop-color="${COLORS.accentLight}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.accentBright}"
        />
    </linearGradient>


    <!-- =================================================
         XP
    ================================================== -->

    <linearGradient
        id="xpGradient"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >
        <stop
            offset="0%"
            stop-color="${COLORS.accent}"
        />

        <stop
            offset="75%"
            stop-color="${COLORS.accentLight}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.accentBright}"
        />
    </linearGradient>


    <!-- =================================================
         AVATAR
    ================================================== -->

    <clipPath id="avatarClip">
        <circle
            cx="150"
            cy="230"
            r="91"
        />
    </clipPath>


    <!-- =================================================
         GRID
    ================================================== -->

    <pattern
        id="grid"
        width="50"
        height="50"
        patternUnits="userSpaceOnUse"
    >

        <path
            d="M 50 0 L 0 0 0 50"
            fill="none"
            stroke="#FFFFFF"
            stroke-opacity="0.022"
            stroke-width="1"
        />

    </pattern>


    <!-- =================================================
         GLOW
    ================================================== -->

    <filter id="glow">

        <feGaussianBlur
            stdDeviation="30"
        />

    </filter>


    <filter id="avatarGlow">

        <feGaussianBlur
            stdDeviation="16"
        />

    </filter>


    <filter id="shadow">

        <feDropShadow
            dx="0"
            dy="10"
            stdDeviation="15"
            flood-color="#000000"
            flood-opacity="0.5"
        />

    </filter>

</defs>


<!-- =====================================================
     BACKGROUND
====================================================== -->

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="30"
    fill="url(#background)"
/>

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="30"
    fill="url(#grid)"
/>


<!-- =====================================================
     PURPLE AMBIENT LIGHT
====================================================== -->

<circle
    cx="930"
    cy="80"
    r="230"
    fill="${COLORS.accent}"
    opacity="0.08"
    filter="url(#glow)"
/>

<circle
    cx="90"
    cy="540"
    r="180"
    fill="${COLORS.accent}"
    opacity="0.06"
    filter="url(#glow)"
/>


<!-- =====================================================
     DECORATIVE PURPLE LINE
====================================================== -->

<rect
    x="55"
    y="34"
    width="990"
    height="1"
    fill="url(#accentGradient)"
    opacity="0.45"
/>


<!-- =====================================================
     HEADER
====================================================== -->

<text
    x="55"
    y="67"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="20"
    letter-spacing="4"
>
    TITANBOT
</text>

<text
    x="1045"
    y="67"
    text-anchor="end"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="3"
>
    PROFILE
</text>


<!-- =====================================================
     AVATAR PANEL
====================================================== -->

<rect
    x="45"
    y="100"
    width="210"
    height="275"
    rx="27"
    fill="${COLORS.panel}"
    fill-opacity="0.88"
    stroke="${COLORS.accent}"
    stroke-opacity="0.18"
    stroke-width="1"
    filter="url(#shadow)"
/>


<!-- avatar glow -->

<circle
    cx="150"
    cy="230"
    r="112"
    fill="${COLORS.accent}"
    opacity="0.12"
    filter="url(#avatarGlow)"
/>


<!-- avatar background -->

<circle
    cx="150"
    cy="230"
    r="101"
    fill="${COLORS.background}"
    stroke="${COLORS.accent}"
    stroke-width="2"
    stroke-opacity="0.35"
/>


${
    avatarData
        ? `
<image
    href="${avatarData}"
    x="59"
    y="139"
    width="182"
    height="182"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#avatarClip)"
/>
`
        : `
<circle
    cx="150"
    cy="230"
    r="91"
    fill="#151020"
/>

<text
    x="150"
    y="247"
    text-anchor="middle"
    fill="${COLORS.accentLight}"
    font-family="Russo One"
    font-size="42"
>
    ?
</text>
`
}


<!-- avatar ring -->

<circle
    cx="150"
    cy="230"
    r="98"
    fill="none"
    stroke="url(#accentGradient)"
    stroke-width="4"
/>

<circle
    cx="150"
    cy="230"
    r="106"
    fill="none"
    stroke="${COLORS.accent}"
    stroke-width="1"
    opacity="0.25"
/>


<!-- level badge -->

<rect
    x="82"
    y="342"
    width="136"
    height="38"
    rx="19"
    fill="${COLORS.accent}"
/>

<text
    x="150"
    y="367"
    text-anchor="middle"
    fill="#09060F"
    font-family="Russo One"
    font-size="15"
>
    LEVEL ${safeLevel}
</text>


<!-- =====================================================
     USER INFORMATION
====================================================== -->

<text
    x="290"
    y="118"
    fill="${COLORS.accentLight}"
    font-family="Russo One"
    font-size="12"
    letter-spacing="3"
>
    PLAYER PROFILE
</text>


<!-- name -->

<text
    x="290"
    y="166"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="39"
>
    ${escapeXml(displayName)}
</text>


<!-- username -->

<text
    x="290"
    y="196"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="15"
>
    @${escapeXml(username)}
</text>


<!-- server -->

<circle
    cx="299"
    cy="235"
    r="5"
    fill="${COLORS.accentLight}"
/>

<text
    x="314"
    y="241"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(serverName)}
</text>


<!-- =====================================================
     MAIN XP AREA
====================================================== -->

<text
    x="290"
    y="289"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    EXPERIENCE
</text>


<text
    x="290"
    y="326"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    LEVEL ${safeLevel}
</text>


<text
    x="1015"
    y="326"
    text-anchor="end"
    fill="${COLORS.accentLight}"
    font-family="Russo One"
    font-size="17"
>
    ${xpBar.percentage}%
</text>


<!-- XP bar -->

<rect
    x="290"
    y="342"
    width="725"
    height="15"
    rx="7.5"
    fill="${COLORS.progressBackground}"
/>

<rect
    x="290"
    y="342"
    width="${xpBar.filled}"
    height="15"
    rx="7.5"
    fill="url(#xpGradient)"
/>


<!-- XP shine -->

${
    xpBar.filled > 20
        ? `
<rect
    x="290"
    y="342"
    width="${Math.min(
        xpBar.filled,
        100
    )}"
    height="15"
    rx="7.5"
    fill="#FFFFFF"
    opacity="0.15"
/>
`
        : ''
}


<text
    x="290"
    y="378"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="13"
>
    ${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP
</text>


<text
    x="1015"
    y="378"
    text-anchor="end"
    fill="${COLORS.darkMuted}"
    font-family="Russo One"
    font-size="12"
>
    TOTAL XP ${formatNumber(totalXp)}
</text>


<!-- =====================================================
     RANK
====================================================== -->

<line
    x1="290"
    y1="404"
    x2="1015"
    y2="404"
    stroke="#FFFFFF"
    stroke-opacity="0.055"
/>


<text
    x="290"
    y="438"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    SERVER RANK
</text>


<text
    x="290"
    y="474"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="29"
>
    ${rankText}
</text>


<!-- =====================================================
     ECONOMY
====================================================== -->

<text
    x="490"
    y="438"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    BALANCE
</text>


<text
    x="490"
    y="474"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="23"
>
    ${formatNumber(totalBalance)}
</text>


<text
    x="700"
    y="438"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    WALLET
</text>


<text
    x="700"
    y="474"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="23"
>
    ${formatNumber(wallet)}
</text>


<text
    x="850"
    y="438"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    BANK
</text>


<text
    x="850"
    y="474"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="23"
>
    ${formatNumber(bank)}
</text>


<!-- =====================================================
     ACHIEVEMENTS
====================================================== -->

<rect
    x="45"
    y="510"
    width="970"
    height="65"
    rx="20"
    fill="${COLORS.panel}"
    fill-opacity="0.85"
    stroke="${COLORS.accent}"
    stroke-opacity="0.12"
/>


<text
    x="70"
    y="537"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ACHIEVEMENTS
</text>


<text
    x="70"
    y="560"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="17"
>
    ${achievementUnlocked} / ${achievementTotal}
</text>


<!-- achievement progress -->

<rect
    x="250"
    y="541"
    width="220"
    height="7"
    rx="3.5"
    fill="${COLORS.progressBackground}"
/>


<rect
    x="250"
    y="541"
    width="${achievementBar}"
    height="7"
    rx="3.5"
    fill="url(#xpGradient)"
/>


<text
    x="490"
    y="550"
    fill="${COLORS.accentLight}"
    font-family="Russo One"
    font-size="13"
>
    ${achievementPercentage}%
</text>


<!-- decorative line -->

<rect
    x="650"
    y="541"
    width="110"
    height="1"
    fill="${COLORS.accent}"
    opacity="0.35"
/>


<text
    x="1015"
    y="551"
    text-anchor="end"
    fill="${COLORS.darkMuted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="3"
>
    TITANBOT
</text>


<!-- =====================================================
     CORNER DECORATION
====================================================== -->

<path
    d="
        M 1045 30
        L 1070 30
        L 1070 55
    "
    fill="none"
    stroke="${COLORS.accentLight}"
    stroke-width="2"
    opacity="0.5"
/>


<path
    d="
        M 1035 30
        L 1045 30
        L 1045 40
    "
    fill="none"
    stroke="${COLORS.accent}"
    stroke-width="1"
    opacity="0.4"
/>


<!-- =====================================================
     OUTER BORDER
====================================================== -->

<rect
    x="2"
    y="2"
    width="${WIDTH - 4}"
    height="${HEIGHT - 4}"
    rx="30"
    fill="none"
    stroke="${COLORS.accent}"
    stroke-width="2"
    opacity="0.45"
/>

<rect
    x="12"
    y="12"
    width="${WIDTH - 24}"
    height="${HEIGHT - 24}"
    rx="24"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="1"
    opacity="0.035"
/>

</svg>
`;

    /**
     * =======================================================
     * RENDER
     * =======================================================
     */

    return sharp(
        Buffer.from(svg, 'utf8')
    )
        .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
        })
        .toBuffer();
}
