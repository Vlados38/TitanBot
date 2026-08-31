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

function truncate(value, maxLength = 22) {
    const string = String(value ?? '');

    if (string.length <= maxLength) {
        return string;
    }

    return `${string.slice(0, maxLength - 1)}…`;
}

function getLevelColor(level) {
    level = Number(level) || 0;

    if (level >= 100) return '#FFD166';
    if (level >= 75) return '#C084FC';
    if (level >= 50) return '#A855F7';
    if (level >= 25) return '#38BDF8';
    if (level >= 10) return '#34D399';

    return '#7289DA';
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
            Math.round((current / total) * 100)
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
        .resize(260, 260, {
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

        // Необязательное поле.
        // Если передашь rank — он появится на карточке.
        rank = null,
    } = data;

    const safeLevel = Number(level) || 0;

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
        20
    );

    const username = truncate(
        user?.username ||
        'unknown',
        25
    );

    const serverName = truncate(
        member?.guild?.name ||
        'TitanBot',
        28
    );

    /**
     * =====================================================
     * COLORS
     * =====================================================
     */

    const levelColor =
        getLevelColor(safeLevel);

    /**
     * =====================================================
     * XP
     * =====================================================
     */

    const xpBar = createProgressBar(
        xp,
        nextLevelXp,
        700
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

    const achievementPercentage =
        achievementTotal > 0
            ? Math.round(
                (
                    achievementUnlocked /
                    achievementTotal
                ) * 100
            )
            : 0;

    const achievementBar =
        Math.round(
            260 *
            achievementPercentage /
            100
        );

    /**
     * =====================================================
     * RANK
     * =====================================================
     */

    const rankText =
        rank !== null &&
        rank !== undefined &&
        Number.isFinite(Number(rank))
            ? `#${formatNumber(rank)}`
            : '—';

    /**
     * =====================================================
     * AVATAR
     * =====================================================
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
        id="background"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
    >
        <stop
            offset="0%"
            stop-color="#05060D"
        />

        <stop
            offset="45%"
            stop-color="#0B1020"
        />

        <stop
            offset="100%"
            stop-color="#171B32"
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
            stop-color="${levelColor}"
            stop-opacity="0"
        />

        <stop
            offset="30%"
            stop-color="${levelColor}"
        />

        <stop
            offset="70%"
            stop-color="${levelColor}"
        />

        <stop
            offset="100%"
            stop-color="${levelColor}"
            stop-opacity="0"
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
            stop-color="${levelColor}"
        />

        <stop
            offset="75%"
            stop-color="${levelColor}"
        />

        <stop
            offset="100%"
            stop-color="#FFFFFF"
        />
    </linearGradient>


    <!-- =================================================
         AVATAR
    ================================================== -->

    <clipPath id="avatarClip">
        <circle
            cx="158"
            cy="258"
            r="105"
        />
    </clipPath>


    <!-- =================================================
         GRID
    ================================================== -->

    <pattern
        id="grid"
        width="45"
        height="45"
        patternUnits="userSpaceOnUse"
    >
        <path
            d="M 45 0 L 0 0 0 45"
            fill="none"
            stroke="#FFFFFF"
            stroke-opacity="0.028"
            stroke-width="1"
        />
    </pattern>


    <!-- =================================================
         GLOW
    ================================================== -->

    <filter id="bigGlow">
        <feGaussianBlur
            stdDeviation="35"
        />
    </filter>

    <filter id="avatarGlow">
        <feGaussianBlur
            stdDeviation="14"
        />
    </filter>

    <filter id="shadow">
        <feDropShadow
            dx="0"
            dy="10"
            stdDeviation="18"
            flood-color="#000000"
            flood-opacity="0.6"
        />
    </filter>

</defs>


<!-- =====================================================
     BACKGROUND
====================================================== -->

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="34"
    fill="url(#background)"
/>

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="34"
    fill="url(#grid)"
/>


<!-- =====================================================
     AMBIENT GLOW
====================================================== -->

<circle
    cx="950"
    cy="80"
    r="230"
    fill="${levelColor}"
    opacity="0.10"
    filter="url(#bigGlow)"
/>

<circle
    cx="80"
    cy="580"
    r="220"
    fill="${levelColor}"
    opacity="0.07"
    filter="url(#bigGlow)"
/>


<!-- =====================================================
     HUGE LEVEL NUMBER
====================================================== -->

<text
    x="1045"
    y="430"
    text-anchor="end"
    fill="${levelColor}"
    fill-opacity="0.045"
    font-family="Russo One"
    font-size="340"
>
    ${safeLevel}
</text>


<!-- =====================================================
     BORDER
====================================================== -->

<rect
    x="2"
    y="2"
    width="${WIDTH - 4}"
    height="${HEIGHT - 4}"
    rx="32"
    fill="none"
    stroke="${levelColor}"
    stroke-width="2"
    stroke-opacity="0.65"
/>

<rect
    x="15"
    y="15"
    width="${WIDTH - 30}"
    height="${HEIGHT - 30}"
    rx="25"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="1"
    stroke-opacity="0.035"
/>


<!-- =====================================================
     LEFT ACCENT LINE
====================================================== -->

<rect
    x="0"
    y="90"
    width="5"
    height="440"
    rx="2.5"
    fill="${levelColor}"
    opacity="0.85"
/>

<rect
    x="5"
    y="90"
    width="90"
    height="1"
    fill="url(#accent)"
    opacity="0.5"
/>


<!-- =====================================================
     HEADER
====================================================== -->

<text
    x="48"
    y="56"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="21"
    letter-spacing="4"
>
    TITANBOT
</text>

<text
    x="1050"
    y="56"
    text-anchor="end"
    fill="#59647D"
    font-family="Russo One"
    font-size="12"
    letter-spacing="3"
>
    PLAYER CARD
</text>

<rect
    x="48"
    y="72"
    width="1000"
    height="1"
    fill="url(#accent)"
    opacity="0.4"
/>


<!-- =====================================================
     AVATAR AREA
====================================================== -->

<!-- glow -->

<circle
    cx="158"
    cy="258"
    r="130"
    fill="${levelColor}"
    opacity="0.10"
    filter="url(#avatarGlow)"
/>

<!-- outer ring -->

<circle
    cx="158"
    cy="258"
    r="123"
    fill="#070A13"
    stroke="${levelColor}"
    stroke-width="2"
    opacity="0.95"
/>

<!-- avatar background -->

<circle
    cx="158"
    cy="258"
    r="112"
    fill="#0D1222"
/>

${
    avatarData
        ? `
<image
    href="${avatarData}"
    x="53"
    y="153"
    width="210"
    height="210"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#avatarClip)"
/>
`
        : `
<circle
    cx="158"
    cy="258"
    r="105"
    fill="#141B30"
/>

<text
    x="158"
    y="273"
    text-anchor="middle"
    fill="${levelColor}"
    font-family="Russo One"
    font-size="46"
>
    ?
</text>
`
}

<!-- avatar frame -->

<circle
    cx="158"
    cy="258"
    r="113"
    fill="none"
    stroke="${levelColor}"
    stroke-width="5"
/>

<circle
    cx="158"
    cy="258"
    r="123"
    fill="none"
    stroke="${levelColor}"
    stroke-width="1"
    opacity="0.25"
/>


<!-- =====================================================
     LEVEL BADGE
====================================================== -->

<rect
    x="91"
    y="359"
    width="134"
    height="38"
    rx="19"
    fill="${levelColor}"
    filter="url(#shadow)"
/>

<text
    x="158"
    y="384"
    text-anchor="middle"
    fill="#05060B"
    font-family="Russo One"
    font-size="16"
>
    LEVEL ${safeLevel}
</text>


<!-- =====================================================
     USER INFORMATION
====================================================== -->

<text
    x="320"
    y="120"
    fill="${levelColor}"
    font-family="Russo One"
    font-size="13"
    letter-spacing="4"
>
    PROFILE
</text>


<!-- NAME -->

<text
    x="320"
    y="174"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="43"
>
    ${escapeXml(displayName)}
</text>


<!-- USERNAME -->

<text
    x="320"
    y="205"
    fill="#626E88"
    font-family="Russo One"
    font-size="16"
>
    @${escapeXml(username)}
</text>


<!-- SERVER -->

<rect
    x="320"
    y="229"
    width="370"
    height="39"
    rx="19.5"
    fill="${levelColor}"
    fill-opacity="0.08"
    stroke="${levelColor}"
    stroke-opacity="0.20"
/>

<circle
    cx="342"
    cy="248"
    r="5"
    fill="${levelColor}"
/>

<text
    x="358"
    y="254"
    fill="#A3AEC3"
    font-family="Russo One"
    font-size="14"
>
    ${escapeXml(serverName)}
</text>


<!-- =====================================================
     LEVEL + RANK
====================================================== -->

<!-- level panel -->

<rect
    x="320"
    y="295"
    width="335"
    height="82"
    rx="20"
    fill="#080C18"
    fill-opacity="0.85"
    stroke="#FFFFFF"
    stroke-opacity="0.05"
/>

<text
    x="345"
    y="325"
    fill="#68738B"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    CURRENT LEVEL
</text>

<text
    x="345"
    y="360"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="27"
>
    ${safeLevel}
</text>


<!-- rank panel -->

<rect
    x="670"
    y="295"
    width="375"
    height="82"
    rx="20"
    fill="#080C18"
    fill-opacity="0.85"
    stroke="#FFFFFF"
    stroke-opacity="0.05"
/>

<text
    x="695"
    y="325"
    fill="#68738B"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    SERVER RANK
</text>

<text
    x="695"
    y="360"
    fill="${levelColor}"
    font-family="Russo One"
    font-size="27"
>
    ${rankText}
</text>


<!-- =====================================================
     XP
====================================================== -->

<text
    x="320"
    y="414"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="21"
>
    EXPERIENCE
</text>

<text
    x="1045"
    y="414"
    text-anchor="end"
    fill="${levelColor}"
    font-family="Russo One"
    font-size="16"
>
    ${xpBar.percentage}%
</text>


<!-- XP background -->

<rect
    x="320"
    y="430"
    width="725"
    height="16"
    rx="8"
    fill="#252C40"
/>


<!-- XP fill -->

<rect
    x="320"
    y="430"
    width="${xpBar.filled}"
    height="16"
    rx="8"
    fill="url(#xpGradient)"
/>


<!-- XP shine -->

${
    xpBar.filled > 12
        ? `
<rect
    x="320"
    y="430"
    width="${Math.min(xpBar.filled, 90)}"
    height="16"
    rx="8"
    fill="#FFFFFF"
    opacity="0.14"
/>
`
        : ''
}


<text
    x="320"
    y="471"
    fill="#68738B"
    font-family="Russo One"
    font-size="13"
>
    ${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP
</text>

<text
    x="1045"
    y="471"
    text-anchor="end"
    fill="#4E5970"
    font-family="Russo One"
    font-size="12"
>
    TOTAL ${formatNumber(totalXp)}
</text>


<!-- =====================================================
     ECONOMY
====================================================== -->

<text
    x="48"
    y="438"
    fill="#59647C"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ECONOMY
</text>


<!-- total -->

<rect
    x="48"
    y="452"
    width="290"
    height="65"
    rx="17"
    fill="#080C18"
    stroke="#FFFFFF"
    stroke-opacity="0.05"
/>

<rect
    x="48"
    y="452"
    width="3"
    height="65"
    rx="1.5"
    fill="${levelColor}"
/>

<text
    x="68"
    y="477"
    fill="#626D84"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1"
>
    TOTAL BALANCE
</text>

<text
    x="68"
    y="501"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="18"
>
    ${formatNumber(totalBalance)}
</text>


<!-- wallet -->

<rect
    x="355"
    y="452"
    width="290"
    height="65"
    rx="17"
    fill="#080C18"
    stroke="#FFFFFF"
    stroke-opacity="0.05"
/>

<rect
    x="355"
    y="452"
    width="3"
    height="65"
    rx="1.5"
    fill="#34D399"
/>

<text
    x="375"
    y="477"
    fill="#626D84"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1"
>
    WALLET
</text>

<text
    x="375"
    y="501"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="18"
>
    ${formatNumber(wallet)}
</text>


<!-- bank -->

<rect
    x="662"
    y="452"
    width="383"
    height="65"
    rx="17"
    fill="#080C18"
    stroke="#FFFFFF"
    stroke-opacity="0.05"
/>

<rect
    x="662"
    y="452"
    width="3"
    height="65"
    rx="1.5"
    fill="#38BDF8"
/>

<text
    x="682"
    y="477"
    fill="#626D84"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1"
>
    BANK
</text>

<text
    x="682"
    y="501"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="18"
>
    ${formatNumber(bank)}
</text>


<!-- =====================================================
     ACHIEVEMENTS
====================================================== -->

<rect
    x="48"
    y="535"
    width="997"
    height="45"
    rx="15"
    fill="#080C18"
    fill-opacity="0.95"
    stroke="#FFFFFF"
    stroke-opacity="0.05"
/>

<text
    x="70"
    y="563"
    fill="#626D84"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ACHIEVEMENTS
</text>

<text
    x="210"
    y="563"
    fill="#FFFFFF"
    font-family="Russo One"
    font-size="14"
>
    ${achievementUnlocked} / ${achievementTotal}
</text>


<!-- achievement bar -->

<rect
    x="310"
    y="554"
    width="260"
    height="7"
    rx="3.5"
    fill="#252C40"
/>

<rect
    x="310"
    y="554"
    width="${achievementBar}"
    height="7"
    rx="3.5"
    fill="${levelColor}"
/>

<text
    x="595"
    y="563"
    fill="${levelColor}"
    font-family="Russo One"
    font-size="13"
>
    ${achievementPercentage}%
</text>


<text
    x="1020"
    y="563"
    text-anchor="end"
    fill="#3F4960"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    TITANBOT
</text>

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
