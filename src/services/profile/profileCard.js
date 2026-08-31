// src/services/profile/profileCard.js

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

    line: '#FFFFFF',
    progressBackground: '#292332',
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
     * =====================================================
     * USER
     * =====================================================
     */

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

    const rankText =
        rank !== null &&
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


    <!-- =================================================
         PURPLE
    ================================================== -->

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


    <!-- =================================================
         AVATAR CLIP
    ================================================== -->

    <clipPath id="avatarClip">
        <circle
            cx="165"
            cy="235"
            r="91"
        />
    </clipPath>


    <!-- =================================================
         GLOWS
    ================================================== -->

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


<!-- =====================================================
     BACKGROUND
====================================================== -->

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="32"
    fill="url(#background)"
/>


<!-- =====================================================
     LARGE BACKGROUND LEVEL
====================================================== -->

<text
    x="1080"
    y="300"
    text-anchor="end"
    fill="${COLORS.purple}"
    opacity="0.035"
    font-family="Russo One"
    font-size="300"
>
    ${safeLevel}
</text>


<!-- =====================================================
     AMBIENT GLOW
====================================================== -->

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


<!-- =====================================================
     TOP LINE
====================================================== -->

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


<!-- =====================================================
     HEADER
====================================================== -->

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


<!-- =====================================================
     LEFT CHARACTER ZONE
====================================================== -->

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


<!-- avatar glow -->

<circle
    cx="165"
    cy="235"
    r="118"
    fill="${COLORS.purple}"
    opacity="0.10"
    filter="url(#avatarGlow)"
/>


<!-- avatar outer -->

<circle
    cx="165"
    cy="235"
    r="105"
    fill="${COLORS.background}"
    stroke="${COLORS.purple}"
    stroke-opacity="0.22"
    stroke-width="2"
/>


<!-- avatar -->

${
    avatarData
        ? `
<image
    href="${avatarData}"
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


<!-- avatar frame -->

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


<!-- =====================================================
     LEVEL PILL
====================================================== -->

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
    УРОВЕНЬ ${safeLevel}
</text>


<!-- =====================================================
     ACHIEVEMENT MINI PANEL
====================================================== -->

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
    ${achievementUnlocked} / ${achievementTotal}
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
        190 * achievementPercentage / 100
    )}"
    height="5"
    rx="2.5"
    fill="url(#purpleGradient)"
/>


<!-- =====================================================
     MAIN INFORMATION
====================================================== -->

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
    ${escapeXml(displayName)}
</text>


<text
    x="322"
    y="204"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="15"
>
    @${escapeXml(username)}
</text>


<!-- server -->

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
    ${escapeXml(serverName)}
</text>


<!-- =====================================================
     LEVEL / RANK
====================================================== -->

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
    ${safeLevel}
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
    ${rankText}
</text>


<!-- =====================================================
     XP HEADER
====================================================== -->

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
    ${xpBar.percentage}%
</text>


<!-- XP BAR -->

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
    width="${xpBar.filled}"
    height="15"
    rx="7.5"
    fill="url(#xpGradient)"
/>


<!-- XP values -->

<text
    x="320"
    y="447"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="13"
>
    ${formatNumber(xp)}
    /
    ${formatNumber(nextLevelXp)}
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
    ВСЕГО ${formatNumber(totalXp)} XP
</text>


<!-- =====================================================
     DIVIDER
====================================================== -->

<line
    x1="320"
    y1="474"
    x2="1015"
    y2="474"
    stroke="${COLORS.line}"
    stroke-opacity="0.06"
/>


<!-- =====================================================
     ECONOMY
====================================================== -->

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
    ${formatNumber(totalBalance)}
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
    ${formatNumber(wallet)}
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
    ${formatNumber(bank)}
</text>


<!-- =====================================================
     DECORATION
====================================================== -->

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


<!-- =====================================================
     BORDER
====================================================== -->

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
