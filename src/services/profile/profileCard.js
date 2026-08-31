import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1100;
const HEIGHT = 620;

const FONT_PATH = path.resolve(
    process.cwd(),
    'assets/fonts/RussoOne-Regular.ttf'
);

/* =========================================================
 * HELPERS
 * ========================================================= */

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

function createProgressBar(current, total, width = 700) {
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
            width * (percentage / 100)
        ),
    };
}

/* =========================================================
 * FONT
 * ========================================================= */

async function verifyFont() {
    try {
        await fs.access(FONT_PATH);
    } catch {
        throw new Error(
            `[PROFILE CARD] Russo One не найден:\n${FONT_PATH}`
        );
    }
}

/* =========================================================
 * AVATAR
 * ========================================================= */

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

/* =========================================================
 * MAIN
 * ========================================================= */

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
    } = data;

    /* =====================================================
     * USER
     * ===================================================== */

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
        24
    );

    const serverName = truncate(
        member?.guild?.name ||
        'TitanBot',
        26
    );

    /* =====================================================
     * COLORS
     * ===================================================== */

    const levelColor = getLevelColor(level);

    /* =====================================================
     * XP
     * ===================================================== */

    const xpProgress = createProgressBar(
        xp,
        nextLevelXp,
        720
    );

    /* =====================================================
     * ACHIEVEMENTS
     * ===================================================== */

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
                (achievementUnlocked / achievementTotal) * 100
            )
            : 0;

    const achievementProgress =
        Math.round(
            300 * (achievementPercentage / 100)
        );

    /* =====================================================
     * AVATAR
     * ===================================================== */

    let avatarData;

    try {
        const avatarUrl = user.displayAvatarURL({
            extension: 'png',
            size: 256,
        });

        avatarData = await avatarToDataUri(
            avatarUrl
        );
    } catch {
        // Если Discord avatar не загрузился,
        // используем простой fallback.

        avatarData = null;
    }

    /* =====================================================
     * SVG
     * ===================================================== */

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
                stop-color="#060811"
            />

            <stop
                offset="48%"
                stop-color="#0C1020"
            />

            <stop
                offset="100%"
                stop-color="#151B31"
            />
        </linearGradient>

        <!-- =================================================
             MAIN GRADIENT
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
            />

            <stop
                offset="100%"
                stop-color="#FFFFFF"
            />
        </linearGradient>

        <!-- =================================================
             XP GRADIENT
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
                cx="150"
                cy="215"
                r="93"
            />
        </clipPath>

        <!-- =================================================
             GLOW
        ================================================== -->

        <filter id="glow">
            <feGaussianBlur
                stdDeviation="28"
            />
        </filter>

        <filter id="smallGlow">
            <feGaussianBlur
                stdDeviation="10"
            />
        </filter>

        <!-- =================================================
             SHADOW
        ================================================== -->

        <filter id="shadow">
            <feDropShadow
                dx="0"
                dy="12"
                stdDeviation="18"
                flood-color="#000000"
                flood-opacity="0.55"
            />
        </filter>

        <!-- =================================================
             PATTERN
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
                stroke-opacity="0.025"
                stroke-width="1"
            />
        </pattern>

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

    <!-- grid -->

    <rect
        x="0"
        y="0"
        width="${WIDTH}"
        height="${HEIGHT}"
        rx="34"
        fill="url(#grid)"
    />

    <!-- ambient glows -->

    <circle
        cx="980"
        cy="80"
        r="210"
        fill="${levelColor}"
        opacity="0.09"
        filter="url(#glow)"
    />

    <circle
        cx="100"
        cy="560"
        r="190"
        fill="${levelColor}"
        opacity="0.07"
        filter="url(#glow)"
    />

    <circle
        cx="540"
        cy="240"
        r="100"
        fill="${levelColor}"
        opacity="0.025"
        filter="url(#glow)"
    />


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
        opacity="0.65"
    />

    <rect
        x="18"
        y="18"
        width="${WIDTH - 36}"
        height="${HEIGHT - 36}"
        rx="24"
        fill="none"
        stroke="#FFFFFF"
        stroke-width="1"
        opacity="0.035"
    />


    <!-- =====================================================
         HEADER
    ====================================================== -->

    <text
        x="55"
        y="58"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="21"
        letter-spacing="4"
    >
        TITANBOT
    </text>

    <text
        x="1045"
        y="58"
        text-anchor="end"
        fill="${levelColor}"
        font-family="Russo One"
        font-size="15"
        letter-spacing="2"
    >
        PROFILE
    </text>

    <rect
        x="55"
        y="73"
        width="990"
        height="1"
        fill="url(#accent)"
        opacity="0.35"
    />


    <!-- =====================================================
         AVATAR PANEL
    ====================================================== -->

    <rect
        x="45"
        y="100"
        width="210"
        height="280"
        rx="28"
        fill="#050711"
        fill-opacity="0.72"
        stroke="#FFFFFF"
        stroke-opacity="0.06"
        stroke-width="1"
        filter="url(#shadow)"
    />

    <!-- avatar glow -->

    <circle
        cx="150"
        cy="215"
        r="112"
        fill="${levelColor}"
        opacity="0.08"
        filter="url(#smallGlow)"
    />

    <!-- avatar background -->

    <circle
        cx="150"
        cy="215"
        r="101"
        fill="#080B15"
        stroke="${levelColor}"
        stroke-width="2"
        opacity="0.95"
    />

    ${
        avatarData
            ? `
    <image
        href="${avatarData}"
        x="57"
        y="122"
        width="186"
        height="186"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#avatarClip)"
    />
    `
            : `
    <circle
        cx="150"
        cy="215"
        r="93"
        fill="#171D32"
    />

    <text
        x="150"
        y="228"
        text-anchor="middle"
        fill="${levelColor}"
        font-family="Russo One"
        font-size="38"
    >
        ?
    </text>
    `
    }

    <!-- avatar border -->

    <circle
        cx="150"
        cy="215"
        r="99"
        fill="none"
        stroke="${levelColor}"
        stroke-width="5"
    />

    <circle
        cx="150"
        cy="215"
        r="108"
        fill="none"
        stroke="${levelColor}"
        stroke-width="1"
        opacity="0.25"
    />

    <!-- level badge -->

    <rect
        x="91"
        y="331"
        width="118"
        height="34"
        rx="17"
        fill="${levelColor}"
    />

    <text
        x="150"
        y="354"
        text-anchor="middle"
        fill="#05060B"
        font-family="Russo One"
        font-size="15"
    >
        LEVEL ${Number(level) || 0}
    </text>


    <!-- =====================================================
         USER INFO
    ====================================================== -->

    <text
        x="295"
        y="119"
        fill="#78839D"
        font-family="Russo One"
        font-size="13"
        letter-spacing="3"
    >
        PLAYER PROFILE
    </text>

    <text
        x="295"
        y="169"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="40"
    >
        ${escapeXml(displayName)}
    </text>

    <text
        x="295"
        y="200"
        fill="#66728D"
        font-family="Russo One"
        font-size="16"
    >
        @${escapeXml(username)}
    </text>

    <!-- server -->

    <rect
        x="295"
        y="224"
        width="350"
        height="38"
        rx="19"
        fill="${levelColor}"
        fill-opacity="0.10"
        stroke="${levelColor}"
        stroke-opacity="0.20"
    />

    <circle
        cx="316"
        cy="243"
        r="5"
        fill="${levelColor}"
    />

    <text
        x="332"
        y="249"
        fill="#AAB4CA"
        font-family="Russo One"
        font-size="14"
    >
        ${escapeXml(serverName)}
    </text>


    <!-- =====================================================
         XP SECTION
    ====================================================== -->

    <text
        x="295"
        y="306"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="25"
    >
        LEVEL ${Number(level) || 0}
    </text>

    <text
        x="1045"
        y="306"
        text-anchor="end"
        fill="${levelColor}"
        font-family="Russo One"
        font-size="18"
    >
        ${xpProgress.percentage}%
    </text>

    <rect
        x="295"
        y="324"
        width="750"
        height="16"
        rx="8"
        fill="#252C40"
    />

    <rect
        x="295"
        y="324"
        width="${xpProgress.filled}"
        height="16"
        rx="8"
        fill="url(#xp)"
    />

    <!-- XP glow -->

    ${
        xpProgress.filled > 8
            ? `
    <rect
        x="295"
        y="324"
        width="${Math.min(
            xpProgress.filled,
            100
        )}"
        height="16"
        rx="8"
        fill="${levelColor}"
        opacity="0.35"
        filter="url(#smallGlow)"
    />
    `
            : ''
    }

    <text
        x="295"
        y="363"
        fill="#6E7890"
        font-family="Russo One"
        font-size="14"
    >
        ${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP
    </text>

    <text
        x="1045"
        y="363"
        text-anchor="end"
        fill="#5C6780"
        font-family="Russo One"
        font-size="13"
    >
        TOTAL XP ${formatNumber(totalXp)}
    </text>


    <!-- =====================================================
         STAT CARDS
    ====================================================== -->

    <!-- card 1 -->

    <rect
        x="45"
        y="410"
        width="315"
        height="95"
        rx="20"
        fill="#080C18"
        fill-opacity="0.85"
        stroke="#FFFFFF"
        stroke-opacity="0.055"
    />

    <rect
        x="45"
        y="410"
        width="4"
        height="95"
        rx="2"
        fill="${levelColor}"
    />

    <text
        x="70"
        y="441"
        fill="#69748D"
        font-family="Russo One"
        font-size="12"
        letter-spacing="2"
    >
        ОБЩИЙ КАПИТАЛ
    </text>

    <text
        x="70"
        y="478"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="25"
    >
        ${formatNumber(totalBalance)}
    </text>


    <!-- card 2 -->

    <rect
        x="380"
        y="410"
        width="315"
        height="95"
        rx="20"
        fill="#080C18"
        fill-opacity="0.85"
        stroke="#FFFFFF"
        stroke-opacity="0.055"
    />

    <rect
        x="380"
        y="410"
        width="4"
        height="95"
        rx="2"
        fill="#34D399"
    />

    <text
        x="405"
        y="441"
        fill="#69748D"
        font-family="Russo One"
        font-size="12"
        letter-spacing="2"
    >
        КОШЕЛЁК
    </text>

    <text
        x="405"
        y="478"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="25"
    >
        ${formatNumber(wallet)}
    </text>


    <!-- card 3 -->

    <rect
        x="715"
        y="410"
        width="330"
        height="95"
        rx="20"
        fill="#080C18"
        fill-opacity="0.85"
        stroke="#FFFFFF"
        stroke-opacity="0.055"
    />

    <rect
        x="715"
        y="410"
        width="4"
        height="95"
        rx="2"
        fill="#38BDF8"
    />

    <text
        x="740"
        y="441"
        fill="#69748D"
        font-family="Russo One"
        font-size="12"
        letter-spacing="2"
    >
        БАНК
    </text>

    <text
        x="740"
        y="478"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="25"
    >
        ${formatNumber(bank)}
    </text>


    <!-- =====================================================
         ACHIEVEMENTS
    ====================================================== -->

    <rect
        x="45"
        y="525"
        width="1000"
        height="55"
        rx="18"
        fill="#080C18"
        fill-opacity="0.9"
        stroke="#FFFFFF"
        stroke-opacity="0.055"
    />

    <text
        x="70"
        y="559"
        fill="#69748D"
        font-family="Russo One"
        font-size="12"
        letter-spacing="2"
    >
        ДОСТИЖЕНИЯ
    </text>

    <text
        x="205"
        y="559"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="16"
    >
        ${achievementUnlocked}
        /
        ${achievementTotal}
    </text>

    <!-- achievement bar -->

    <rect
        x="300"
        y="548"
        width="300"
        height="8"
        rx="4"
        fill="#252C40"
    />

    <rect
        x="300"
        y="548"
        width="${achievementProgress}"
        height="8"
        rx="4"
        fill="${levelColor}"
    />

    <text
        x="625"
        y="559"
        fill="${levelColor}"
        font-family="Russo One"
        font-size="15"
    >
        ${achievementPercentage}%
    </text>

    <text
        x="1018"
        y="559"
        text-anchor="end"
        fill="#454F67"
        font-family="Russo One"
        font-size="12"
        letter-spacing="2"
    >
        TITANBOT
    </text>

</svg>
`;

    /* =====================================================
     * RENDER
     * ===================================================== */

    return sharp(
        Buffer.from(svg, 'utf8')
    )
        .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
        })
        .toBuffer();
}
