import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1000;
const HEIGHT = 560;

const FONT_PATH = path.resolve(
    process.cwd(),
    'assets/fonts/RussoOne-Regular.ttf'
);

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
            Math.floor((current / total) * 100)
        )
    );

    return {
        percentage,
        filled: Math.round(
            width * (percentage / 100)
        ),
    };
}

async function loadFont() {
    try {
        return await fs.readFile(FONT_PATH);
    } catch (error) {
        throw new Error(
            `Не удалось загрузить Russo One: ${FONT_PATH}`
        );
    }
}

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
        })
        .png()
        .toBuffer();

    return `data:image/png;base64,${png.toString('base64')}`;
}

export async function generateProfileCard(data) {
    const {
        user,
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

    const fontBuffer = await loadFont();

    const fontBase64 =
        fontBuffer.toString('base64');

    const avatarUrl =
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        });

    const avatarData =
        await avatarToDataUri(avatarUrl);

    const levelColor =
        getLevelColor(level);

    const xpBar =
        createProgressBar(
            xp,
            nextLevelXp,
            700
        );

    const achievementTotal =
        achievements.length;

    const achievementUnlocked =
        unlockedAchievements.length;

    const achievementBar =
        createProgressBar(
            achievementUnlocked,
            achievementTotal,
            360
        );

    const achievementIcons =
        unlockedAchievements
            .slice(0, 8)
            .map(
                (achievement) =>
                    achievement.emoji || '🏆'
            )
            .join(' ');

    const username =
        escapeXml(user.globalName || user.username);

    const serverName =
        escapeXml(
            data.member?.guild?.name ||
            'TitanBot'
        );

    const svg = `
<svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
>
    <defs>

        <style>
            @font-face {
                font-family: 'RussoOne';
                src: url(data:font/ttf;base64,${fontBase64});
            }

            text {
                font-family: 'RussoOne';
            }
        </style>

        <linearGradient
            id="background"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
        >
            <stop
                offset="0%"
                stop-color="#080B14"
            />

            <stop
                offset="55%"
                stop-color="#101729"
            />

            <stop
                offset="100%"
                stop-color="#171D38"
            />
        </linearGradient>

        <linearGradient
            id="glow"
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
                stop-opacity="0.8"
            />

            <stop
                offset="100%"
                stop-color="${levelColor}"
                stop-opacity="0"
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
                stop-color="${levelColor}"
            />

            <stop
                offset="100%"
                stop-color="#FFFFFF"
                stop-opacity="0.9"
            />
        </linearGradient>

        <clipPath id="avatarClip">
            <circle
                cx="145"
                cy="205"
                r="105"
            />
        </clipPath>

        <filter id="shadow">
            <feDropShadow
                dx="0"
                dy="8"
                stdDeviation="12"
                flood-color="#000000"
                flood-opacity="0.55"
            />
        </filter>

        <filter id="softGlow">
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

    <!-- AMBIENT GLOW -->

    <circle
        cx="850"
        cy="80"
        r="170"
        fill="${levelColor}"
        opacity="0.10"
        filter="url(#softGlow)"
    />

    <circle
        cx="100"
        cy="500"
        r="140"
        fill="${levelColor}"
        opacity="0.07"
        filter="url(#softGlow)"
    />

    <!-- BORDER -->

    <rect
        x="2"
        y="2"
        width="${WIDTH - 4}"
        height="${HEIGHT - 4}"
        rx="30"
        fill="none"
        stroke="${levelColor}"
        stroke-width="3"
        opacity="0.75"
    />

    <!-- TOP LINE -->

    <rect
        x="70"
        y="32"
        width="860"
        height="2"
        fill="url(#glow)"
    />

    <!-- AVATAR PANEL -->

    <rect
        x="55"
        y="90"
        width="180"
        height="230"
        rx="24"
        fill="#050810"
        opacity="0.65"
        stroke="${levelColor}"
        stroke-width="2"
    />

    <circle
        cx="145"
        cy="205"
        r="110"
        fill="${levelColor}"
        opacity="0.12"
    />

    <image
        href="${avatarData}"
        x="40"
        y="100"
        width="210"
        height="210"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#avatarClip)"
    />

    <circle
        cx="145"
        cy="205"
        r="106"
        fill="none"
        stroke="${levelColor}"
        stroke-width="5"
    />

    <!-- NAME -->

    <text
        x="280"
        y="115"
        fill="#7F8BAA"
        font-size="20"
        letter-spacing="3"
    >
        TITAN ADVENTURER
    </text>

    <text
        x="280"
        y="170"
        fill="#FFFFFF"
        font-size="42"
    >
        ${username}
    </text>

    <text
        x="280"
        y="205"
        fill="${levelColor}"
        font-size="21"
    >
        ${serverName}
    </text>

    <!-- LEVEL -->

    <text
        x="280"
        y="255"
        fill="#FFFFFF"
        font-size="28"
    >
        LEVEL ${level}
    </text>

    <text
        x="280"
        y="285"
        fill="#8994AE"
        font-size="17"
    >
        ${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP
    </text>

    <!-- XP BAR -->

    <rect
        x="280"
        y="300"
        width="700"
        height="18"
        rx="9"
        fill="#252D43"
    />

    <rect
        x="280"
        y="300"
        width="${xpBar.filled}"
        height="18"
        rx="9"
        fill="url(#xpGradient)"
    />

    <text
        x="980"
        y="290"
        text-anchor="end"
        fill="#FFFFFF"
        font-size="18"
    >
        ${xpBar.percentage}%
    </text>

    <!-- STAT CARDS -->

    <rect
        x="55"
        y="350"
        width="265"
        height="90"
        rx="18"
        fill="#0B1020"
        stroke="#242D45"
        stroke-width="2"
    />

    <text
        x="75"
        y="380"
        fill="#7F8BAA"
        font-size="15"
    >
        💰 ОБЩИЙ КАПИТАЛ
    </text>

    <text
        x="75"
        y="418"
        fill="#FFFFFF"
        font-size="27"
    >
        ${formatNumber(totalBalance)}
    </text>

    <rect
        x="340"
        y="350"
        width="265"
        height="90"
        rx="18"
        fill="#0B1020"
        stroke="#242D45"
        stroke-width="2"
    />

    <text
        x="360"
        y="380"
        fill="#7F8BAA"
        font-size="15"
    >
        💵 КОШЕЛЁК
    </text>

    <text
        x="360"
        y="418"
        fill="#FFFFFF"
        font-size="27"
    >
        ${formatNumber(wallet)}
    </text>

    <rect
        x="625"
        y="350"
        width="320"
        height="90"
        rx="18"
        fill="#0B1020"
        stroke="#242D45"
        stroke-width="2"
    />

    <text
        x="645"
        y="380"
        fill="#7F8BAA"
        font-size="15"
    >
        🏦 БАНК
    </text>

    <text
        x="645"
        y="418"
        fill="#FFFFFF"
        font-size="27"
    >
        ${formatNumber(bank)}
    </text>

    <!-- ACHIEVEMENTS -->

    <rect
        x="55"
        y="460"
        width="890"
        height="65"
        rx="18"
        fill="#0B1020"
        stroke="#242D45"
        stroke-width="2"
    />

    <text
        x="75"
        y="493"
        fill="#7F8BAA"
        font-size="15"
    >
        🏆 ACHIEVEMENTS
    </text>

    <text
        x="270"
        y="496"
        fill="#FFFFFF"
        font-size="21"
    >
        ${achievementIcons || 'Пока нет достижений'}
    </text>

    <text
        x="920"
        y="493"
        text-anchor="end"
        fill="#FFFFFF"
        font-size="18"
    >
        ${achievementUnlocked}/${achievementTotal}
    </text>

    <rect
        x="700"
        y="505"
        width="220"
        height="6"
        rx="3"
        fill="#252D43"
    />

    <rect
        x="700"
        y="505"
        width="${Math.min(
            220,
            Math.round(
                220 *
                (
                    achievementTotal > 0
                        ? achievementUnlocked /
                          achievementTotal
                        : 0
                )
            )
        )}"
        height="6"
        rx="3"
        fill="${levelColor}"
    />

</svg>
`;

    return sharp(
        Buffer.from(svg)
    )
        .png({
            compressionLevel: 9,
        })
        .toBuffer();
}
