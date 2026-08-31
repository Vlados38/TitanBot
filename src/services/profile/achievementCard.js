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

    locked: '#393243',
};

const ACHIEVEMENTS_PER_PAGE = 5;

const RARITY_INFO = {
    common: {
        name: 'Обычное',
        color: '#95A5A6',
    },

    uncommon: {
        name: 'Необычное',
        color: '#2ECC71',
    },

    rare: {
        name: 'Редкое',
        color: '#3498DB',
    },

    epic: {
        name: 'Эпическое',
        color: '#A855F7',
    },

    legendary: {
        name: 'Легендарное',
        color: '#F1C40F',
    },
};

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function truncate(value, maxLength = 42) {
    const text = String(value ?? '');

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
}

function getRarity(rarity) {
    return (
        RARITY_INFO[rarity] ||
        RARITY_INFO.common
    );
}

async function verifyFont() {
    try {
        await fs.access(FONT_PATH);
    } catch {
        throw new Error(
            `[ACHIEVEMENT CARD] Russo One не найден:\n${FONT_PATH}`
        );
    }
}

export async function generateAchievementCard(
    data,
    page = 0
) {
    await verifyFont();

    const {
        user,
        achievements = [],
    } = data;

    const safeAchievements =
        Array.isArray(achievements)
            ? achievements
            : [];

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                safeAchievements.length /
                ACHIEVEMENTS_PER_PAGE
            )
        );

    const safePage =
        Math.min(
            Math.max(
                0,
                Number(page) || 0
            ),
            totalPages - 1
        );

    const start =
        safePage *
        ACHIEVEMENTS_PER_PAGE;

    const current =
        safeAchievements.slice(
            start,
            start + ACHIEVEMENTS_PER_PAGE
        );

    const unlocked =
        safeAchievements.filter(
            achievement =>
                achievement?.unlocked
        ).length;

    const total =
        safeAchievements.length;

    const percentage =
        total > 0
            ? Math.round(
                unlocked / total * 100
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
                        .resize(96, 96, {
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

    const rows = current.map(
        (achievement, index) => {
            const y = 148 + index * 76;

            const isUnlocked =
                Boolean(
                    achievement?.unlocked
                );

            const isSecret =
                Boolean(
                    achievement?.secret ||
                    achievement?.hidden
                );

            const rarity =
                getRarity(
                    achievement?.rarity
                );

            const color =
                isUnlocked
                    ? rarity.color
                    : COLORS.locked;

            let name = 'Секретное достижение';
            let description =
                'Выполните особое условие, чтобы открыть его.';

            if (!isSecret || isUnlocked) {
                name =
                    truncate(
                        achievement?.name ||
                        'Без названия',
                        34
                    );

                description =
                    truncate(
                        achievement?.description ||
                        'Нет описания',
                        55
                    );
            }

            const emoji =
                isUnlocked
                    ? (
                        achievement?.emoji ||
                        '🏅'
                    )
                    : '🔒';

            return `
                <rect
                    x="55"
                    y="${y}"
                    width="990"
                    height="62"
                    rx="16"
                    fill="${
                        isUnlocked
                            ? COLORS.panelLight
                            : '#0D0A14'
                    }"
                    stroke="${color}"
                    stroke-opacity="${
                        isUnlocked
                            ? '0.28'
                            : '0.12'
                    }"
                    stroke-width="1"
                />

                <rect
                    x="55"
                    y="${y}"
                    width="5"
                    height="62"
                    rx="2"
                    fill="${color}"
                    opacity="${
                        isUnlocked
                            ? '0.9'
                            : '0.35'
                    }"
                />

                <circle
                    cx="93"
                    cy="${y + 31}"
                    r="22"
                    fill="${
                        isUnlocked
                            ? color
                            : COLORS.locked
                    }"
                    opacity="${
                        isUnlocked
                            ? '0.16'
                            : '0.25'
                    }"
                />

                <text
                    x="93"
                    y="${y + 38}"
                    text-anchor="middle"
                    font-size="21"
                >
                    ${escapeXml(emoji)}
                </text>

                <text
                    x="130"
                    y="${y + 25}"
                    fill="${
                        isUnlocked
                            ? COLORS.white
                            : COLORS.muted
                    }"
                    font-family="Russo One"
                    font-size="16"
                >
                    ${escapeXml(name)}
                </text>

                <text
                    x="130"
                    y="${y + 47}"
                    fill="${
                        isUnlocked
                            ? COLORS.muted
                            : COLORS.mutedDark
                    }"
                    font-family="Russo One"
                    font-size="11"
                >
                    ${escapeXml(description)}
                </text>

                <text
                    x="1008"
                    y="${y + 24}"
                    text-anchor="end"
                    fill="${color}"
                    font-family="Russo One"
                    font-size="10"
                >
                    ${escapeXml(rarity.name.toUpperCase())}
                </text>

                <text
                    x="1008"
                    y="${y + 45}"
                    text-anchor="end"
                    fill="${
                        isUnlocked
                            ? COLORS.purpleLight
                            : COLORS.mutedDark
                    }"
                    font-family="Russo One"
                    font-size="10"
                >
                    ${
                        isUnlocked
                            ? 'ПОЛУЧЕНО'
                            : 'ЗАБЛОКИРОВАНО'
                    }
                </text>
            `;
        }
    ).join('');

    const progressWidth =
        Math.round(
            400 * percentage / 100
        );

    const avatarMarkup =
        avatarData
            ? `
                <defs>
                    <clipPath id="avatarClip">
                        <circle
                            cx="980"
                            cy="73"
                            r="30"
                        />
                    </clipPath>
                </defs>

                <image
                    href="${avatarData}"
                    x="950"
                    y="43"
                    width="60"
                    height="60"
                    preserveAspectRatio="xMidYMid slice"
                    clip-path="url(#avatarClip)"
                />

                <circle
                    cx="980"
                    cy="73"
                    r="33"
                    fill="none"
                    stroke="${COLORS.purple}"
                    stroke-width="2"
                    opacity="0.7"
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
    КОЛЛЕКЦИЯ ДОСТИЖЕНИЙ
</text>


<text
    x="945"
    y="69"
    text-anchor="end"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="11"
    letter-spacing="2"
>
    АВАНТЮРИСТ
</text>

${avatarMarkup}


<!-- USER -->

<text
    x="55"
    y="106"
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


<!-- ACHIEVEMENT ROWS -->

${rows}


<!-- BOTTOM PANEL -->

<rect
    x="55"
    y="535"
    width="990"
    height="48"
    rx="16"
    fill="${COLORS.panel}"
    stroke="${COLORS.purple}"
    stroke-opacity="0.12"
/>


<text
    x="75"
    y="565"
    fill="${COLORS.muted}"
    font-family="Russo One"
    font-size="10"
    letter-spacing="1"
>
    ПРОГРЕСС
</text>


<text
    x="185"
    y="565"
    fill="${COLORS.white}"
    font-family="Russo One"
    font-size="15"
>
    ${unlocked} / ${total}
</text>


<rect
    x="290"
    y="557"
    width="400"
    height="6"
    rx="3"
    fill="#292332"
/>


<rect
    x="290"
    y="557"
    width="${progressWidth}"
    height="6"
    rx="3"
    fill="url(#purpleGradient)"
/>


<text
    x="715"
    y="565"
    fill="${COLORS.purpleLight}"
    font-family="Russo One"
    font-size="13"
>
    ${percentage}%
</text>


<text
    x="1015"
    y="565"
    text-anchor="end"
    fill="${COLORS.mutedDark}"
    font-family="Russo One"
    font-size="11"
>
    СТРАНИЦА ${safePage + 1} / ${totalPages}
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

    const buffer =
        await sharp(
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

    return {
        buffer,
        page: safePage,
        totalPages,
    };
}
