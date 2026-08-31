import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1200;
const HEIGHT = 630;

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

function truncate(value, length) {
    const text = String(value ?? '');

    if (text.length <= length) {
        return text;
    }

    return `${text.slice(0, length - 1)}…`;
}

function getLevelColor(level) {
    level = Number(level) || 0;

    if (level >= 100) return '#FFD166';
    if (level >= 50) return '#B56CFF';
    if (level >= 25) return '#43C6FF';
    if (level >= 10) return '#35E0A1';

    return '#7289DA';
}

function progress(current, total, width) {
    current = Number(current) || 0;
    total = Number(total) || 0;

    if (total <= 0) {
        return {
            percent: 100,
            width,
        };
    }

    const percent = Math.min(
        100,
        Math.max(
            0,
            Math.round(
                current / total * 100
            )
        )
    );

    return {
        percent,
        width: Math.round(
            width * percent / 100
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
            `[PROFILE CARD] Font не найден:\n${FONT_PATH}`
        );
    }
}

/**
 * =========================================================
 * AVATAR
 * =========================================================
 */

async function loadAvatar(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Avatar HTTP ${response.status}`
        );
    }

    const buffer = Buffer.from(
        await response.arrayBuffer()
    );

    const image = await sharp(buffer)
        .resize(430, 430, {
            fit: 'cover',
            position: 'centre',
        })
        .png()
        .toBuffer();

    return `data:image/png;base64,${image.toString('base64')}`;
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

    const safeLevel = Number(level) || 0;

    const color =
        getLevelColor(safeLevel);

    /**
     * =====================================================
     * USER
     * =====================================================
     */

    const displayName = truncate(
        user?.globalName ||
        user?.displayName ||
        user?.username ||
        'Unknown',
        18
    );

    const username = truncate(
        user?.username ||
        'unknown',
        24
    );

    const serverName = truncate(
        member?.guild?.name ||
        'TitanBot',
        28
    );

    /**
     * =====================================================
     * XP
     * =====================================================
     */

    const xpProgress = progress(
        xp,
        nextLevelXp,
        650
    );

    /**
     * =====================================================
     * ACHIEVEMENTS
     * =====================================================
     */

    const achievementTotal =
        Array.isArray(achievements)
            ? achievements.length
            : 0;

    const achievementUnlocked =
        Array.isArray(unlockedAchievements)
            ? unlockedAchievements.length
            : 0;

    const achievementPercent =
        achievementTotal > 0
            ? Math.round(
                achievementUnlocked /
                achievementTotal *
                100
            )
            : 0;

    /**
     * =====================================================
     * RANK
     * =====================================================
     */

    const rankValue =
        rank !== null &&
        Number.isFinite(Number(rank))
            ? `#${formatNumber(rank)}`
            : '—';

    /**
     * =====================================================
     * AVATAR
     * =====================================================
     */

    let avatar = null;

    try {
        avatar = await loadAvatar(
            user.displayAvatarURL({
                extension: 'png',
                size: 512,
            })
        );
    } catch {
        avatar = null;
    }

    /**
     * =====================================================
     * SVG
     * =====================================================
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
        id="bg"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
    >
        <stop
            offset="0%"
            stop-color="#05060A"
        />

        <stop
            offset="55%"
            stop-color="#0A0D16"
        />

        <stop
            offset="100%"
            stop-color="#111729"
        />
    </linearGradient>


    <!-- =================================================
         AVATAR OVERLAY
    ================================================== -->

    <linearGradient
        id="avatarShade"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >

        <stop
            offset="0%"
            stop-color="#05060A"
            stop-opacity="0"
        />

        <stop
            offset="65%"
            stop-color="#05060A"
            stop-opacity="0.15"
        />

        <stop
            offset="100%"
            stop-color="#05060A"
            stop-opacity="0.95"
        />

    </linearGradient>


    <!-- =================================================
         ACCENT
    ================================================== -->

    <linearGradient
        id="accent"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >

        <stop
            offset="0%"
            stop-color="${color}"
            stop-opacity="0"
        />

        <stop
            offset="45%"
            stop-color="${color}"
        />

        <stop
            offset="100%"
            stop-color="#FFFFFF"
        />

    </linearGradient>


    <!-- =================================================
         XP
    ================================================== -->

    <linearGradient
        id="xp"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
    >

        <stop
            offset="0%"
            stop-color="${color}"
        />

        <stop
            offset="100%"
            stop-color="#FFFFFF"
        />

    </linearGradient>


    <!-- =================================================
         AVATAR CLIP
    ================================================== -->

    <clipPath id="avatarClip">

        <circle
            cx="235"
            cy="315"
            r="190"
        />

    </clipPath>


    <!-- =================================================
         GLOWS
    ================================================== -->

    <filter id="glow">

        <feGaussianBlur
            stdDeviation="32"
        />

    </filter>


    <filter id="smallGlow">

        <feGaussianBlur
            stdDeviation="10"
        />

    </filter>


    <!-- =================================================
         GRID
    ================================================== -->

    <pattern
        id="grid"
        width="60"
        height="60"
        patternUnits="userSpaceOnUse"
    >

        <path
            d="M60 0H0V60"
            fill="none"
            stroke="#FFFFFF"
            stroke-opacity="0.025"
        />

    </pattern>

</defs>


<!-- =====================================================
     BACKGROUND
====================================================== -->

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    fill="url(#bg)"
/>

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    fill="url(#grid)"
/>


<!-- =====================================================
     AMBIENT LIGHT
====================================================== -->

<circle
    cx="270"
    cy="300"
    r="260"
    fill="${color}"
    opacity="0.12"
    filter="url(#glow)"
/>


<circle
    cx="1100"
    cy="50"
    r="180"
    fill="${color}"
    opacity="0.07"
    filter="url(#glow)"
/>


<!-- =====================================================
     HUGE LEVEL
====================================================== -->

<text
    x="1130"
    y="490"
    text-anchor="end"
    fill="${color}"
    fill-opacity="0.045"
    font-family="Russo One"
    font-size="420"
>
    ${safeLevel}
</text>


<!-- =====================================================
     AVATAR
====================================================== -->

${
    avatar
        ? `
<image
    href="${avatar}"
    x="45"
    y="125"
    width="380"
    height="380"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#avatarClip)"
/>

<rect
    x="45"
    y="125"
    width="380"
    height="380"
    fill="url(#avatarShade)"
    clip-path="url(#avatarClip)"
/>
`
        : `
<circle
    cx="235"
    cy="315"
    r="190"
    fill="#111727"
/>

<text
    x="235"
    y="345"
    text-anchor="middle"
    fill="${color}"
    font-family="Russo One"
    font-size="100"
>
    ?
</text>
`
}


<!-- avatar edge -->

<circle
    cx="235"
    cy="315"
    r="191"
    fill="none"
    stroke="${color}"
    stroke-width="2"
    opacity="0.7"
/>


<!-- =====================================================
     DIAGONAL SEPARATOR
====================================================== -->

<path
    d="
        M 430 0
        L 335 630
    "
    stroke="${color}"
    stroke-width="2"
    opacity="0.25"
/>


<path
    d="
        M 450 0
        L 355 630
    "
    stroke="#FFFFFF"
    stroke-width="1"
    opacity="0.05"
/>


<!-- =====================================================
     TOP LABEL
====================================================== -->

<text
    x="510"
    y="76"
    fill="${color}"
    font-family="Russo One"
    font-size="12"
    letter-spacing="5"
>
    TITANBOT // PLAYER
</text>


<text
    x="1140"
    y="76"
    text-anchor="end"
    fill="#4D566A"
    font-family="Russo One"
    font-size="11"
    letter-spacing="3"
>
    PROFILE CARD
</text>


<!-- =====================================================
     NAME
====================================================== -->

<text
    x="510"
    y="160"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="52"
>
    ${escapeXml(displayName)}
</text>


<text
    x="512"
    y="191"
    fill="#667187"
    font-family="Russo One"
    font-size="16"
>
    @${escapeXml(username)}
</text>


<!-- =====================================================
     SERVER
====================================================== -->

<text
    x="510"
    y="245"
    fill="#485267"
    font-family="Russo One"
    font-size="10"
    letter-spacing="3"
>
    SERVER
</text>


<text
    x="510"
    y="272"
    fill="#B3BDCE"
    font-family="Russo One"
    font-size="17"
>
    ${escapeXml(serverName)}
</text>


<!-- =====================================================
     LEVEL
====================================================== -->

<text
    x="510"
    y="350"
    fill="#5D687D"
    font-family="Russo One"
    font-size="11"
    letter-spacing="3"
>
    EXPERIENCE LEVEL
</text>


<text
    x="505"
    y="423"
    fill="${color}"
    font-family="Russo One"
    font-size="76"
>
    ${safeLevel}
</text>


<text
    x="620"
    y="423"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="24"
>
    LVL
</text>


<!-- =====================================================
     RANK
====================================================== -->

<text
    x="785"
    y="350"
    fill="#5D687D"
    font-family="Russo One"
    font-size="11"
    letter-spacing="3"
>
    SERVER RANK
</text>


<text
    x="785"
    y="423"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="55"
>
    ${rankValue}
</text>


<!-- =====================================================
     XP
====================================================== -->

<text
    x="510"
    y="466"
    fill="#606B80"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    XP
</text>


<text
    x="1140"
    y="466"
    text-anchor="end"
    fill="#69758A"
    font-family="Russo One"
    font-size="11"
>
    ${formatNumber(xp)} / ${formatNumber(nextLevelXp)}
</text>


<rect
    x="510"
    y="480"
    width="630"
    height="9"
    rx="4.5"
    fill="#252B39"
/>


<rect
    x="510"
    y="480"
    width="${xpProgress.width}"
    height="9"
    rx="4.5"
    fill="url(#xp)"
/>


<rect
    x="510"
    y="480"
    width="${Math.min(
        xpProgress.width,
        90
    )}"
    height="9"
    rx="4.5"
    fill="#FFFFFF"
    opacity="0.16"
/>


<text
    x="1140"
    y="515"
    text-anchor="end"
    fill="${color}"
    font-family="Russo One"
    font-size="13"
>
    ${xpProgress.percent}%
</text>


<!-- =====================================================
     BOTTOM INFORMATION
====================================================== -->

<line
    x1="510"
    y1="548"
    x2="1140"
    y2="548"
    stroke="#FFFFFF"
    stroke-opacity="0.07"
/>


<!-- TOTAL XP -->

<text
    x="510"
    y="580"
    fill="#465066"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    TOTAL XP
</text>


<text
    x="510"
    y="603"
    fill="#C2CAD8"
    font-family="Russo One"
    font-size="15"
>
    ${formatNumber(totalXp)}
</text>


<!-- BALANCE -->

<text
    x="685"
    y="580"
    fill="#465066"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    BALANCE
</text>


<text
    x="685"
    y="603"
    fill="#C2CAD8"
    font-family="Russo One"
    font-size="15"
>
    ${formatNumber(totalBalance)}
</text>


<!-- ACHIEVEMENTS -->

<text
    x="850"
    y="580"
    fill="#465066"
    font-family="Russo One"
    font-size="9"
    letter-spacing="2"
>
    ACHIEVEMENTS
</text>


<text
    x="850"
    y="603"
    fill="#C2CAD8"
    font-family="Russo One"
    font-size="15"
>
    ${achievementUnlocked} / ${achievementTotal}
    ·
    ${achievementPercent}%
</text>


<!-- =====================================================
     LEVEL CORNER
====================================================== -->

<path
    d="
        M 1080 0
        L 1200 0
        L 1200 120
    "
    fill="${color}"
    opacity="0.035"
/>


<path
    d="
        M 1130 0
        L 1200 0
        L 1200 70
    "
    fill="${color}"
    opacity="0.08"
/>


<!-- =====================================================
     BORDER
====================================================== -->

<rect
    x="1"
    y="1"
    width="${WIDTH - 2}"
    height="${HEIGHT - 2}"
    fill="none"
    stroke="#FFFFFF"
    stroke-opacity="0.08"
/>


<rect
    x="3"
    y="3"
    width="${WIDTH - 6}"
    height="${HEIGHT - 6}"
    fill="none"
    stroke="${color}"
    stroke-opacity="0.30"
/>

</svg>
`;

    /**
     * =====================================================
     * RENDER
     * =====================================================
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
