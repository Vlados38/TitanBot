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
    background: '#080611',
    backgroundLight: '#100B1B',

    panel: '#110D1C',
    panelLight: '#161021',

    purple: '#A855F7',
    purpleLight: '#C084FC',
    purpleBright: '#E9D5FF',

    white: '#FFFFFF',
    text: '#D9D3E3',
    muted: '#81778F',
    mutedDark: '#51485D',

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
        .resize(230, 230, {
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

    const displayName = truncate(
        user?.globalName ||
        user?.displayName ||
        user?.username ||
        'Неизвестный авантюрист',
        20
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
     * -------------------------------------------------------
     * XP
     * -------------------------------------------------------
     */

    const xpBar = createProgressBar(
        xp,
        nextLevelXp,
        670
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

    const achievementBar =
        Math.round(
            200 *
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
            offset="60%"
            stop-color="${COLORS.backgroundLight}"
        />

        <stop
            offset="100%"
            stop-color="#171024"
        />
    </linearGradient>


    <!-- =================================================
         PURPLE GRADIENT
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
         XP GRADIENT
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
            stop-color="#8B3FD9"
        />

        <stop
            offset="65%"
            stop-color="${COLORS.purple}"
        />

        <stop
            offset="100%"
            stop-color="${COLORS.purpleBright}"
        />
    </linearGradient>


    <!-- =================================================
         AVATAR
    ================================================== -->

    <clipPath id="avatarClip">
        <circle
            cx="165"
            cy="245"
            r="88"
        />
    </clipPath>


    <!-- =================================================
         GLOW
    ================================================== -->

    <filter id="glow">
        <feGaussianBlur
            stdDeviation="30"
        />
    </filter>

    <filter id="smallGlow">
        <feGaussianBlur
            stdDeviation="12"
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


<!-- =====================================================
     PURPLE AMBIENT LIGHT
====================================================== -->

<circle
    cx="950"
    cy="90"
    r="220"
    fill="${COLORS.purple}"
    opacity="0.075"
    filter="url(#glow)"
/>

<circle
    cx="80"
    cy="570"
    r="180"
    fill="${COLORS.purple}"
    opacity="0.055"
    filter="url(#glow)"
/>


<!-- =====================================================
     TOP DECORATION
====================================================== -->

<rect
    x="55"
    y="35"
    width="990"
    height="1"
    fill="url(#purpleGradient)"
    opacity="0.35"
/>


<rect
    x="55"
    y="35"
    width="190"
    height="2"
    fill="${COLORS.purple}"
    opacity="0.75"
/>


<!-- =====================================================
     TITLE
====================================================== -->

<text
    x="55"
    y="70"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="21"
    letter-spacing="2"
>
    КАРТОЧКА АВАНТЮРИСТА
</text>


<text
    x="1045"
    y="70"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    ДИСБОРД
</text>


<!-- =====================================================
     AVATAR AREA
====================================================== -->

<rect
    x="45"
    y="105"
    width="240"
    height="280"
    rx="28"
    fill="${COLORS.panel}"
    fill-opacity="0.85"
    stroke="${COLORS.purple}"
    stroke-opacity="0.14"
    stroke-width="1"
/>


<!-- avatar glow -->

<circle
    cx="165"
    cy="245"
    r="112"
    fill="${COLORS.purple}"
    opacity="0.12"
    filter="url(#smallGlow)"
/>


<!-- avatar background -->

<circle
    cx="165"
    cy="245"
    r="99"
    fill="${COLORS.background}"
    stroke="${COLORS.purple}"
    stroke-opacity="0.30"
    stroke-width="2"
/>


${
    avatarData
        ? `
<image
    href="${avatarData}"
    x="77"
    y="157"
    width="176"
    height="176"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#avatarClip)"
/>
`
        : `
<circle
    cx="165"
    cy="245"
    r="88"
    fill="${COLORS.panelLight}"
/>

<text
    x="165"
    y="260"
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
    cy="245"
    r="96"
    fill="none"
    stroke="url(#purpleGradient)"
    stroke-width="4"
/>


<circle
    cx="165"
    cy="245"
    r="104"
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="1"
    opacity="0.25"
/>


<!-- =====================================================
     LEVEL BADGE
====================================================== -->

<rect
    x="91"
    y="351"
    width="148"
    height="38"
    rx="19"
    fill="${COLORS.purple}"
/>


<text
    x="165"
    y="376"
    text-anchor="middle"
    fill="#100815"
    font-family="Russo One"
    font-size="15"
>
    УРОВЕНЬ ${safeLevel}
</text>


<!-- =====================================================
     USER
====================================================== -->

<text
    x="320"
    y="122"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="3"
>
    АВАНТЮРИСТ
</text>


<text
    x="320"
    y="171"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="40"
>
    ${escapeXml(displayName)}
</text>


<text
    x="322"
    y="201"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="15"
>
    @${escapeXml(username)}
</text>


<!-- server -->

<circle
    cx="329"
    cy="238"
    r="5"
    fill="${COLORS.purpleLight}"
/>


<text
    x="344"
    y="244"
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
    y="299"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    УРОВЕНЬ
</text>


<text
    x="320"
    y="343"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="38"
>
    ${safeLevel}
</text>


<text
    x="430"
    y="299"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ПОЗИЦИЯ В РЕЙТИНГЕ
</text>


<text
    x="430"
    y="343"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="30"
>
    ${rankText}
</text>


<!-- =====================================================
     XP
====================================================== -->

<text
    x="320"
    y="390"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ОПЫТ ДО СЛЕДУЮЩЕГО УРОВНЯ
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


<rect
    x="320"
    y="405"
    width="695"
    height="14"
    rx="7"
    fill="${COLORS.progressBackground}"
/>


<rect
    x="320"
    y="405"
    width="${xpBar.filled}"
    height="14"
    rx="7"
    fill="url(#xpGradient)"
/>


<text
    x="320"
    y="444"
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
    y="444"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="12"
>
    ВСЕГО ${formatNumber(totalXp)} XP
</text>


<!-- =====================================================
     ECONOMY
====================================================== -->

<line
    x1="320"
    y1="469"
    x2="1015"
    y2="469"
    stroke="#FFFFFF"
    stroke-opacity="0.055"
/>


<!-- balance -->

<text
    x="320"
    y="501"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ОБЩИЙ БАЛАНС
</text>


<text
    x="320"
    y="533"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="22"
>
    ${formatNumber(totalBalance)}
</text>


<!-- wallet -->

<text
    x="550"
    y="501"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    КОШЕЛЁК
</text>


<text
    x="550"
    y="533"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="22"
>
    ${formatNumber(wallet)}
</text>


<!-- bank -->

<text
    x="750"
    y="501"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    БАНК
</text>


<text
    x="750"
    y="533"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="22"
>
    ${formatNumber(bank)}
</text>


<!-- =====================================================
     ACHIEVEMENTS
====================================================== -->

<rect
    x="45"
    y="520"
    width="240"
    height="55"
    rx="18"
    fill="${COLORS.panel}"
    fill-opacity="0.8"
    stroke="${COLORS.purple}"
    stroke-opacity="0.12"
/>


<text
    x="65"
    y="543"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="9"
    letter-spacing="1"
>
    ДОСТИЖЕНИЯ
</text>


<text
    x="65"
    y="563"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="15"
>
    ${achievementUnlocked}
    /
    ${achievementTotal}
</text>


<rect
    x="130"
    y="548"
    width="90"
    height="5"
    rx="2.5"
    fill="${COLORS.progressBackground}"
/>


<rect
    x="130"
    y="548"
    width="${Math.min(
        achievementBar,
        90
    )}"
    height="5"
    rx="2.5"
    fill="${COLORS.purple}"
/>


<text
    x="250"
    y="553"
    text-anchor="end"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="11"
>
    ${achievementPercentage}%
</text>


<!-- =====================================================
     DECORATIVE ELEMENTS
====================================================== -->

<path
    d="
        M 1015 105
        L 1045 105
        L 1045 135
    "
    fill="none"
    stroke="${COLORS.purpleLight}"
    stroke-width="2"
    opacity="0.55"
/>


<path
    d="
        M 1025 105
        L 1015 105
        L 1015 115
    "
    fill="none"
    stroke="${COLORS.purple}"
    stroke-width="1"
    opacity="0.4"
/>


<circle
    cx="1000"
    cy="560"
    r="3"
    fill="${COLORS.purpleLight}"
    opacity="0.6"
/>


<line
    x1="1010"
    y1="560"
    x2="1045"
    y2="560"
    stroke="${COLORS.purple}"
    stroke-width="1"
    opacity="0.3"
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
