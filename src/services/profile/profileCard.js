import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1000;
const HEIGHT = 560;

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
    return Number(value || 0).toLocaleString('ru-RU');
}

function getLevelColor(level) {
    if (level >= 100) return '#F1C40F';
    if (level >= 50) return '#A855F7';
    if (level >= 25) return '#3498DB';
    if (level >= 10) return '#2ECC71';

    return '#5865F2';
}

function createProgressBar(
    current,
    total,
    width = 700
) {
    if (!total || total <= 0) {
        return {
            percentage: 100,
            filled: width,
        };
    }

    const percentage = Math.min(
        100,
        Math.max(
            0,
            Math.floor(
                (Number(current) / Number(total)) * 100
            )
        )
    );

    return {
        percentage,
        filled: Math.round(
            width * (percentage / 100)
        ),
    };
}

/**
 * =========================================================
 * FONT
 * =========================================================
 *
 * Проверяем, что файл Russo One действительно существует.
 *
 * Сам шрифт НЕ встраиваем через @font-face.
 *
 * Он должен находиться здесь:
 *
 * assets/
 *   fonts/
 *     RussoOne-Regular.ttf
 *
 * А fontconfig уже настраивается через:
 *
 * src/utils/fonts.js
 *
 * и:
 *
 * fontconfig/fonts.conf
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
        .resize(220, 220, {
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

        level,
        xp,
        nextLevelXp,
        totalXp,

        wallet,
        bank,
        totalBalance,

        unlockedAchievements,
        achievements,
    } = data;

    /**
     * -------------------------------------------------------
     * USER DATA
     * -------------------------------------------------------
     */

    const username = escapeXml(
        user.globalName ||
        user.username ||
        'Unknown'
    );

    const serverName = escapeXml(
        member?.guild?.name ||
        'TitanBot'
    );

    /**
     * -------------------------------------------------------
     * COLORS
     * -------------------------------------------------------
     */

    const levelColor =
        getLevelColor(level);

    /**
     * -------------------------------------------------------
     * XP
     * -------------------------------------------------------
     */

    const xpBar =
        createProgressBar(
            xp,
            nextLevelXp,
            660
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
            ? Math.floor(
                (
                    achievementUnlocked /
                    achievementTotal
                ) * 100
            )
            : 0;

    const achievementBar =
        Math.round(
            190 *
            (
                achievementPercentage /
                100
            )
        );

    /**
     * -------------------------------------------------------
     * AVATAR
     * -------------------------------------------------------
     */

    const avatarUrl =
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        });

    const avatarData =
        await avatarToDataUri(
            avatarUrl
        );

    /**
     * -------------------------------------------------------
     * SVG
     * -------------------------------------------------------
     *
     * ВАЖНО:
     *
     * Здесь НЕ используется emoji.
     *
     * Используем только символы,
     * которые гарантированно есть
     * в Russo One / Unicode Cyrillic.
     */

    const svg = `
<svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
>

    <!-- ===================================================
         DEFINITIONS
    ==================================================== -->

    <defs>

        <!-- MAIN BACKGROUND -->

        <linearGradient
            id="background"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
        >
            <stop
                offset="0%"
                stop-color="#070A12"
            />

            <stop
                offset="50%"
                stop-color="#10172A"
            />

            <stop
                offset="100%"
                stop-color="#171D38"
            />
        </linearGradient>

        <!-- LEVEL GLOW -->

        <linearGradient
            id="levelGlow"
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
                offset="50%"
                stop-color="${levelColor}"
                stop-opacity="0.85"
            />

            <stop
                offset="100%"
                stop-color="${levelColor}"
                stop-opacity="0"
            />
        </linearGradient>

        <!-- XP -->

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
                offset="100%"
                stop-color="#FFFFFF"
            />
        </linearGradient>

        <!-- AVATAR -->

        <clipPath id="avatarClip">
            <circle
                cx="145"
                cy="205"
                r="96"
            />
        </clipPath>

        <!-- SOFT GLOW -->

        <filter id="softGlow">
            <feGaussianBlur
                stdDeviation="25"
            />
        </filter>

        <!-- SHADOW -->

        <filter id="shadow">
            <feDropShadow
                dx="0"
                dy="8"
                stdDeviation="12"
                flood-color="#000000"
                flood-opacity="0.6"
            />
        </filter>

    </defs>


    <!-- ===================================================
         BACKGROUND
    ==================================================== -->

    <rect
        x="0"
        y="0"
        width="${WIDTH}"
        height="${HEIGHT}"
        rx="32"
        fill="url(#background)"
    />

    <!-- ambient glow -->

    <circle
        cx="870"
        cy="80"
        r="170"
        fill="${levelColor}"
        opacity="0.09"
        filter="url(#softGlow)"
    />

    <circle
        cx="80"
        cy="520"
        r="150"
        fill="${levelColor}"
        opacity="0.07"
        filter="url(#softGlow)"
    />


    <!-- ===================================================
         OUTER BORDER
    ==================================================== -->

    <rect
        x="2"
        y="2"
        width="${WIDTH - 4}"
        height="${HEIGHT - 4}"
        rx="30"
        fill="none"
        stroke="${levelColor}"
        stroke-width="3"
        opacity="0.8"
    />


    <!-- ===================================================
         TOP DECORATION
    ==================================================== -->

    <rect
        x="70"
        y="32"
        width="860"
        height="2"
        fill="url(#levelGlow)"
    />

    <rect
        x="70"
        y="34"
        width="140"
        height="2"
        fill="${levelColor}"
        opacity="0.7"
    />


    <!-- ===================================================
         AVATAR PANEL
    ==================================================== -->

    <rect
        x="50"
        y="75"
        width="190"
        height="270"
        rx="26"
        fill="#050810"
        opacity="0.75"
        stroke="${levelColor}"
        stroke-width="2"
    />

    <!-- avatar glow -->

    <circle
        cx="145"
        cy="205"
        r="112"
        fill="${levelColor}"
        opacity="0.10"
    />

    <circle
        cx="145"
        cy="205"
        r="104"
        fill="#080B14"
    />

    <!-- avatar -->

    <image
        href="${avatarData}"
        x="49"
        y="109"
        width="192"
        height="192"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#avatarClip)"
    />

    <!-- avatar frame -->

    <circle
        cx="145"
        cy="205"
        r="100"
        fill="none"
        stroke="${levelColor}"
        stroke-width="5"
    />

    <circle
        cx="145"
        cy="205"
        r="106"
        fill="none"
        stroke="${levelColor}"
        stroke-width="1"
        opacity="0.35"
    />


    <!-- ===================================================
         USER INFORMATION
    ==================================================== -->

    <text
        x="280"
        y="112"
        fill="#7F8BAA"
        font-family="Russo One"
        font-size="18"
        letter-spacing="3"
    >
        TITAN ADVENTURER
    </text>

    <text
        x="280"
        y="168"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="40"
    >
        ${username}
    </text>

    <text
        x="280"
        y="203"
        fill="${levelColor}"
        font-family="Russo One"
        font-size="20"
    >
        ${serverName}
    </text>


    <!-- ===================================================
         LEVEL
    ==================================================== -->

    <text
        x="280"
        y="250"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="28"
    >
        LEVEL ${level}
    </text>

    <text
        x="280"
        y="279"
        fill="#8994AE"
        font-family="Russo One"
        font-size="16"
    >
        ${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP
    </text>


    <!-- ===================================================
         XP BAR
    ==================================================== -->

    <rect
        x="280"
        y="295"
        width="660"
        height="18"
        rx="9"
        fill="#252D43"
    />

    <rect
        x="280"
        y="295"
        width="${xpBar.filled}"
        height="18"
        rx="9"
        fill="url(#xpGradient)"
    />

    <text
        x="940"
        y="285"
        text-anchor="end"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="17"
    >
        ${xpBar.percentage}%
    </text>


    <!-- ===================================================
         STAT CARD 1
    ==================================================== -->

    <rect
        x="50"
        y="365"
        width="270"
        height="92"
        rx="18"
        fill="#0A0F1D"
        stroke="#252D43"
        stroke-width="2"
    />

    <text
        x="72"
        y="397"
        fill="#7F8BAA"
        font-family="Russo One"
        font-size="14"
        letter-spacing="1"
    >
        ОБЩИЙ КАПИТАЛ
    </text>

    <text
        x="72"
        y="435"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="26"
    >
        ${formatNumber(totalBalance)}
    </text>


    <!-- ===================================================
         STAT CARD 2
    ==================================================== -->

    <rect
        x="335"
        y="365"
        width="270"
        height="92"
        rx="18"
        fill="#0A0F1D"
        stroke="#252D43"
        stroke-width="2"
    />

    <text
        x="357"
        y="397"
        fill="#7F8BAA"
        font-family="Russo One"
        font-size="14"
        letter-spacing="1"
    >
        КОШЕЛЁК
    </text>

    <text
        x="357"
        y="435"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="26"
    >
        ${formatNumber(wallet)}
    </text>


    <!-- ===================================================
         STAT CARD 3
    ==================================================== -->

    <rect
        x="620"
        y="365"
        width="330"
        height="92"
        rx="18"
        fill="#0A0F1D"
        stroke="#252D43"
        stroke-width="2"
    />

    <text
        x="642"
        y="397"
        fill="#7F8BAA"
        font-family="Russo One"
        font-size="14"
        letter-spacing="1"
    >
        БАНК
    </text>

    <text
        x="642"
        y="435"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="26"
    >
        ${formatNumber(bank)}
    </text>


    <!-- ===================================================
         ACHIEVEMENTS
    ==================================================== -->

    <rect
        x="50"
        y="480"
        width="900"
        height="55"
        rx="17"
        fill="#0A0F1D"
        stroke="#252D43"
        stroke-width="2"
    />

    <text
        x="72"
        y="514"
        fill="#7F8BAA"
        font-family="Russo One"
        font-size="14"
        letter-spacing="1"
    >
        ДОСТИЖЕНИЯ
    </text>

    <text
        x="250"
        y="514"
        fill="#FFFFFF"
        font-family="Russo One"
        font-size="18"
    >
        ${achievementUnlocked} / ${achievementTotal}
    </text>

    <!-- achievement progress -->

    <rect
        x="390"
        y="503"
        width="190"
        height="7"
        rx="3.5"
        fill="#252D43"
    />

    <rect
        x="390"
        y="503"
        width="${achievementBar}"
        height="7"
        rx="3.5"
        fill="${levelColor}"
    />

    <text
        x="610"
        y="514"
        fill="${levelColor}"
        font-family="Russo One"
        font-size="16"
    >
        ${achievementPercentage}%
    </text>

    <text
        x="920"
        y="514"
        text-anchor="end"
        fill="#59657F"
        font-family="Russo One"
        font-size="13"
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
