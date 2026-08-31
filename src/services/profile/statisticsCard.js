import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1100;
const HEIGHT = 620;

const FONT_PATH = path.resolve(
    process.cwd(),
    'assets/fonts/RussoOne-Regular.ttf'
);

const COLORS = {
    background: '#080611',
    backgroundLight: '#100B1B',

    panel: '#110D1C',
    panelLight: '#171122',

    purple: '#A855F7',
    purpleLight: '#C084FC',
    purpleBright: '#E9D5FF',

    white: '#FFFFFF',
    text: '#D9D3E3',
    muted: '#81778F',
    mutedDark: '#51485D',

    progressBackground: '#292332',
};

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

function formatMoney(value) {
    return `$${formatNumber(value)}`;
}

function truncate(value, maxLength = 28) {
    const text = String(value ?? '');

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
}

function progressWidth(
    current,
    total,
    width
) {
    current = Number(current) || 0;
    total = Number(total) || 0;

    if (total <= 0) {
        return width;
    }

    return Math.round(
        Math.min(
            1,
            Math.max(
                0,
                current / total
            )
        ) * width
    );
}

async function verifyFont() {
    try {
        await fs.access(FONT_PATH);
    } catch {
        throw new Error(
            `[STATISTICS CARD] Russo One не найден:\n${FONT_PATH}`
        );
    }
}

export async function generateStatisticsCard(
    data
) {
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

    const xpValue =
        Number(xp) || 0;

    const nextXp =
        Number(nextLevelXp) || 0;

    const xpPercent =
        nextXp > 0
            ? Math.min(
                100,
                Math.round(
                    xpValue /
                    nextXp *
                    100
                )
            )
            : 100;

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

    const avatarUrl =
        user?.displayAvatarURL?.({
            extension: 'png',
            size: 128,
        });

    let avatarData = null;

    if (avatarUrl) {
        try {
            const response =
                await fetch(avatarUrl);

            if (response.ok) {
                const buffer =
                    Buffer.from(
                        await response.arrayBuffer()
                    );

                const png =
                    await sharp(buffer)
                        .resize(100, 100, {
                            fit: 'cover',
                        })
                        .png()
                        .toBuffer();

                avatarData =
                    `data:image/png;base64,${png.toString('base64')}`;
            }
        } catch {
            avatarData = null;
        }
    }

    const joinedText =
        joinedAt
            ? new Date(joinedAt)
                .toLocaleDateString('ru-RU')
            : 'Неизвестно';

    const createdText =
        createdAt
            ? new Date(createdAt)
                .toLocaleDateString('ru-RU')
            : 'Неизвестно';

    const avatarMarkup =
        avatarData
            ? `
                <defs>
                    <clipPath id="avatarClip">
                        <circle
                            cx="970"
                            cy="80"
                            r="39"
                        />
                    </clipPath>
                </defs>

                <image
                    href="${avatarData}"
                    x="931"
                    y="41"
                    width="78"
                    height="78"
                    preserveAspectRatio="xMidYMid slice"
                    clip-path="url(#avatarClip)"
                />

                <circle
                    cx="970"
                    cy="80"
                    r="43"
                    fill="none"
                    stroke="${COLORS.purple}"
                    stroke-width="2"
                />
            `
            : '';

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
            offset="60%"
            stop-color="${COLORS.backgroundLight}"
        />

        <stop
            offset="100%"
            stop-color="#171024"
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
            stdDeviation="30"
        />
    </filter>

</defs>


<!-- BACKGROUND -->

<rect
    width="${WIDTH}"
    height="${HEIGHT}"
    rx="30"
    fill="url(#background)"
/>


<circle
    cx="970"
    cy="90"
    r="220"
    fill="${COLORS.purple}"
    opacity="0.07"
    filter="url(#glow)"
/>


<!-- TOP -->

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


<text
    x="55"
    y="72"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="21"
    letter-spacing="2"
>
    СТАТИСТИКА АВАНТЮРИСТА
</text>


<text
    x="900"
    y="69"
    text-anchor="end"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    ДИСБОРД
</text>

${avatarMarkup}


<!-- USER -->

<text
    x="55"
    y="112"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    ${escapeXml(
        truncate(
            user?.globalName ||
            user?.username ||
            'АВАНТЮРИСТ',
            30
        ).toUpperCase()
    )}
</text>


<text
    x="55"
    y="147"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="13"
>
    @${escapeXml(
        truncate(
            user?.username ||
            'unknown',
            28
        )
    )}
</text>


<!-- LEVEL -->

<rect
    x="55"
    y="175"
    width="310"
    height="125"
    rx="20"
    fill="${COLORS.panel}"
    stroke="${COLORS.purple}"
    stroke-opacity="0.15"
/>


<text
    x="78"
    y="207"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ТЕКУЩИЙ УРОВЕНЬ
</text>


<text
    x="78"
    y="260"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="44"
>
    ${safeLevel}
</text>


<text
    x="185"
    y="260"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="14"
>
    уровень
</text>


<text
    x="78"
    y="284"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="11"
>
    ${formatNumber(xp)} / ${formatNumber(nextXp)} XP
</text>


<!-- XP -->

<rect
    x="385"
    y="175"
    width="660"
    height="125"
    rx="20"
    fill="${COLORS.panel}"
    stroke="${COLORS.purple}"
    stroke-opacity="0.15"
/>


<text
    x="410"
    y="207"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="2"
>
    ПРОГРЕСС ДО СЛЕДУЮЩЕГО УРОВНЯ
</text>


<text
    x="1015"
    y="207"
    text-anchor="end"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="14"
>
    ${xpPercent}%
</text>


<rect
    x="410"
    y="230"
    width="605"
    height="14"
    rx="7"
    fill="${COLORS.progressBackground}"
/>


<rect
    x="410"
    y="230"
    width="${progressWidth(
        xpValue,
        nextXp,
        605
    )}"
    height="14"
    rx="7"
    fill="url(#purpleGradient)"
/>


<text
    x="410"
    y="275"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="13"
>
    ${formatNumber(xp)} XP
</text>


<text
    x="1015"
    y="275"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="12"
>
    ВСЕГО ${formatNumber(totalXp)} XP
</text>


<!-- ECONOMY -->

<text
    x="55"
    y="345"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="17"
    letter-spacing="1"
>
    ЭКОНОМИКА
</text>


<rect
    x="55"
    y="365"
    width="310"
    height="105"
    rx="18"
    fill="${COLORS.panel}"
/>


<text
    x="78"
    y="395"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    ОБЩИЙ КАПИТАЛ
</text>


<text
    x="78"
    y="435"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatMoney(totalBalance)}
</text>


<rect
    x="385"
    y="365"
    width="310"
    height="105"
    rx="18"
    fill="${COLORS.panel}"
/>


<text
    x="408"
    y="395"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    КОШЕЛЁК
</text>


<text
    x="408"
    y="435"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatMoney(wallet)}
</text>


<rect
    x="715"
    y="365"
    width="330"
    height="105"
    rx="18"
    fill="${COLORS.panel}"
/>


<text
    x="738"
    y="395"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    БАНК
</text>


<text
    x="738"
    y="435"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="24"
>
    ${formatMoney(bank)}
</text>


<!-- ADDITIONAL -->

<text
    x="55"
    y="515"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    ДОСТИЖЕНИЯ
</text>


<text
    x="55"
    y="548"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="20"
>
    ${achievementUnlocked}
    /
    ${achievementTotal}
</text>


<rect
    x="145"
    y="538"
    width="300"
    height="7"
    rx="3.5"
    fill="${COLORS.progressBackground}"
/>


<rect
    x="145"
    y="538"
    width="${progressWidth(
        achievementUnlocked,
        achievementTotal,
        300
    )}"
    height="7"
    rx="3.5"
    fill="url(#purpleGradient)"
/>


<text
    x="470"
    y="548"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="13"
>
    ${achievementPercent}%
</text>


<text
    x="620"
    y="515"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    НА СЕРВЕРЕ С
</text>


<text
    x="620"
    y="548"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(joinedText)}
</text>


<text
    x="815"
    y="515"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    АККАУНТ СОЗДАН
</text>


<text
    x="815"
    y="548"
    fill="${COLORS.text}"
    font-family="Russo One"
    font-size="15"
>
    ${escapeXml(createdText)}
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
        Buffer.from(
            svg,
            'utf8'
        )
    )
        .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
        })
        .toBuffer();
}
