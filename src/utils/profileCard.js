import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 675;

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

function calculateProgress(current, required) {
    if (!required || required <= 0) {
        return 1;
    }

    return Math.min(
        1,
        Math.max(
            0,
            Number(current || 0) / Number(required)
        )
    );
}

function getLevelColor(level) {
    if (level >= 100) return '#f1c40f';
    if (level >= 50) return '#a855f7';
    if (level >= 25) return '#3498db';
    if (level >= 10) return '#2ecc71';

    return '#5865f2';
}

function createStatCard(x, y, width, title, value, accent) {
    return `
        <rect
            x="${x}"
            y="${y}"
            width="${width}"
            height="105"
            rx="18"
            fill="#111827"
            stroke="#263244"
            stroke-width="2"
        />

        <rect
            x="${x}"
            y="${y}"
            width="5"
            height="105"
            rx="2"
            fill="${accent}"
        />

        <text
            x="${x + 25}"
            y="${y + 34}"
            fill="#94a3b8"
            font-size="19"
            font-family="Arial, sans-serif"
            font-weight="600"
        >
            ${escapeXml(title)}
        </text>

        <text
            x="${x + 25}"
            y="${y + 75}"
            fill="#ffffff"
            font-size="28"
            font-family="Arial, sans-serif"
            font-weight="700"
        >
            ${escapeXml(value)}
        </text>
    `;
}

async function downloadAvatar(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Не удалось загрузить аватар: ${response.status}`
        );
    }

    return Buffer.from(
        await response.arrayBuffer()
    );
}

async function prepareAvatar(url) {
    const avatarBuffer = await downloadAvatar(url);

    return sharp(avatarBuffer)
        .resize(190, 190, {
            fit: 'cover',
        })
        .composite([
            {
                input: Buffer.from(`
                    <svg width="190" height="190">
                        <circle
                            cx="95"
                            cy="95"
                            r="92"
                            fill="none"
                            stroke="#5865f2"
                            stroke-width="6"
                        />
                    </svg>
                `),
                blend: 'over',
            },
        ])
        .png()
        .toBuffer();
}

/**
 * Создаёт PNG RPG-профиля.
 */
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

    const levelColor = getLevelColor(level);

    const progress = calculateProgress(
        xp,
        nextLevelXp
    );

    const progressPercent =
        Math.round(progress * 100);

    const avatarUrl =
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        });

    let avatarBuffer;

    try {
        avatarBuffer =
            await prepareAvatar(avatarUrl);
    } catch {
        avatarBuffer = null;
    }

    const statsWidth = 255;

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
                        stop-color="#080b14"
                    />

                    <stop
                        offset="55%"
                        stop-color="#111827"
                    />

                    <stop
                        offset="100%"
                        stop-color="#080b14"
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
                        stop-color="#8b5cf6"
                    />
                </linearGradient>

                <filter
                    id="shadow"
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                >
                    <feDropShadow
                        dx="0"
                        dy="8"
                        stdDeviation="12"
                        flood-color="#000000"
                        flood-opacity="0.45"
                    />
                </filter>

            </defs>

            <!-- BACKGROUND -->

            <rect
                width="${WIDTH}"
                height="${HEIGHT}"
                fill="url(#background)"
            />

            <circle
                cx="1050"
                cy="80"
                r="220"
                fill="${levelColor}"
                opacity="0.07"
            />

            <circle
                cx="80"
                cy="620"
                r="220"
                fill="#8b5cf6"
                opacity="0.05"
            />

            <!-- TOP GLOW -->

            <rect
                x="50"
                y="32"
                width="1100"
                height="2"
                fill="url(#glow)"
            />

            <!-- AVATAR AREA -->

            <rect
                x="55"
                y="70"
                width="215"
                height="215"
                rx="28"
                fill="#0b1220"
                stroke="${levelColor}"
                stroke-width="3"
                filter="url(#shadow)"
            />

            ${
                avatarBuffer
                    ? `
                        <image
                            x="67"
                            y="82"
                            width="190"
                            height="190"
                            href="data:image/png;base64,${avatarBuffer.toString('base64')}"
                        />
                    `
                    : `
                        <circle
                            cx="162"
                            cy="177"
                            r="70"
                            fill="#1e293b"
                        />

                        <text
                            x="162"
                            y="195"
                            text-anchor="middle"
                            fill="#94a3b8"
                            font-size="48"
                            font-family="Arial, sans-serif"
                        >
                            ?
                        </text>
                    `
            }

            <!-- USER NAME -->

            <text
                x="310"
                y="110"
                fill="#94a3b8"
                font-size="18"
                font-family="Arial, sans-serif"
                font-weight="600"
            >
                TITANBOT PROFILE
            </text>

            <text
                x="310"
                y="160"
                fill="#ffffff"
                font-size="42"
                font-family="Arial, sans-serif"
                font-weight="700"
            >
                ${escapeXml(user.displayName ?? user.username)}
            </text>

            <text
                x="310"
                y="192"
                fill="#64748b"
                font-size="19"
                font-family="Arial, sans-serif"
            >
                @${escapeXml(user.username)}
            </text>

            <!-- LEVEL -->

            <text
                x="310"
                y="245"
                fill="${levelColor}"
                font-size="27"
                font-family="Arial, sans-serif"
                font-weight="700"
            >
                LEVEL ${level}
            </text>

            <text
                x="510"
                y="245"
                fill="#64748b"
                font-size="18"
                font-family="Arial, sans-serif"
            >
                ${progressPercent}% до следующего уровня
            </text>

            <!-- XP BACKGROUND -->

            <rect
                x="310"
                y="265"
                width="790"
                height="24"
                rx="12"
                fill="#1e293b"
            />

            <!-- XP -->

            <rect
                x="310"
                y="265"
                width="${Math.max(
                    8,
                    790 * progress
                )}"
                height="24"
                rx="12"
                fill="url(#xp)"
            />

            <text
                x="310"
                y="315"
                fill="#94a3b8"
                font-size="18"
                font-family="Arial, sans-serif"
            >
                ${formatNumber(xp)} / ${formatNumber(nextLevelXp)} XP
            </text>

            <text
                x="1100"
                y="315"
                text-anchor="end"
                fill="#64748b"
                font-size="18"
                font-family="Arial, sans-serif"
            >
                ${formatNumber(totalXp)} всего XP
            </text>

            <!-- DIVIDER -->

            <rect
                x="55"
                y="345"
                width="1090"
                height="1"
                fill="#263244"
            />

            <!-- STATISTICS -->

            ${createStatCard(
                55,
                375,
                statsWidth,
                'КАПИТАЛ',
                formatNumber(totalBalance),
                '#f1c40f'
            )}

            ${createStatCard(
                335,
                375,
                statsWidth,
                'КОШЕЛЁК',
                formatNumber(wallet),
                '#2ecc71'
            )}

            ${createStatCard(
                615,
                375,
                statsWidth,
                'БАНК',
                formatNumber(bank),
                '#3498db'
            )}

            ${createStatCard(
                895,
                375,
                statsWidth,
                'ДОСТИЖЕНИЯ',
                `${unlockedAchievements.length} / ${achievements.length}`,
                '#a855f7'
            )}

            <!-- FOOTER -->

            <text
                x="55"
                y="540"
                fill="#64748b"
                font-size="17"
                font-family="Arial, sans-serif"
            >
                ACHIEVEMENT COLLECTION
            </text>

            <text
                x="55"
                y="580"
                fill="#ffffff"
                font-size="23"
                font-family="Arial, sans-serif"
                font-weight="600"
            >
                ${
                    unlockedAchievements.length
                        ? unlockedAchievements
                            .slice(0, 6)
                            .map(
                                (achievement) =>
                                    `${achievement.emoji ?? '🏆'} ${escapeXml(achievement.name)}`
                            )
                            .join('   •   ')
                        : 'Пока нет полученных достижений'
                }
            </text>

            <text
                x="1145"
                y="620"
                text-anchor="end"
                fill="#475569"
                font-size="16"
                font-family="Arial, sans-serif"
            >
                TITANBOT
            </text>

            <rect
                x="55"
                y="630"
                width="1090"
                height="2"
                fill="url(#glow)"
            />

        </svg>
    `;

    return sharp(
        Buffer.from(svg)
    )
        .png()
        .toBuffer();
}
