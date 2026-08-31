import fs from 'node:fs';
import path from 'node:path';

export function setupFonts() {
    const root = process.cwd();

    const fontsDir = path.join(root, 'assets', 'fonts');
    const fontConfigDir = path.join(root, 'fontconfig');
    const fontConfigFile = path.join(fontConfigDir, 'fonts.conf');
    const cacheDir = path.join(root, '.fontconfig');

    // Проверяем, что необходимые директории существуют
    if (!fs.existsSync(fontsDir)) {
        throw new Error(
            `[FONTS] Папка со шрифтами не найдена:\n${fontsDir}`
        );
    }

    if (!fs.existsSync(fontConfigFile)) {
        throw new Error(
            `[FONTS] fonts.conf не найден:\n${fontConfigFile}`
        );
    }

    // Fontconfig будет искать шрифты в нашей папке
    process.env.FONTCONFIG_PATH = fontConfigDir;
    process.env.FONTCONFIG_FILE = fontConfigFile;

    // Отдельный writable cache.
    // Особенно важно для Railway / Docker / Linux.
    process.env.FONTCONFIG_CACHE =
        cacheDir;

    console.log('[FONTS] Fontconfig настроен');
    console.log(`[FONTS] Fonts: ${fontsDir}`);
    console.log(`[FONTS] Config: ${fontConfigFile}`);
    console.log(`[FONTS] Cache: ${cacheDir}`);
}
2. Полностью замени fontconfig/fonts.conf
Вот здесь у тебя сейчас главная проблема — /app/assets/fonts. 
G
GitHub

Замени весь файл на:

