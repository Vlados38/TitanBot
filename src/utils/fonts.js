import fs from 'node:fs';
import path from 'node:path';

export function setupFonts() {
    const root = process.cwd();

    const fontsDir = path.join(root, 'assets', 'fonts');
    const fontConfigDir = path.join(root, 'fontconfig');
    const fontConfigFile = path.join(fontConfigDir, 'fonts.conf');

    if (!fs.existsSync(fontsDir)) {
        throw new Error(`[FONTS] Fonts directory not found: ${fontsDir}`);
    }

    if (!fs.existsSync(fontConfigFile)) {
        throw new Error(`[FONTS] Fontconfig file not found: ${fontConfigFile}`);
    }

    // ВАЖНО: задаём абсолютный путь к конфигурации.
    process.env.FONTCONFIG_PATH = fontConfigDir;
    process.env.FONTCONFIG_FILE = fontConfigFile;

    // Создаём cache directory, если её нет.
    const cacheDir = path.join(root, '.fontconfig');

    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    process.env.XDG_CACHE_HOME = root;

    const fonts = fs
        .readdirSync(fontsDir)
        .filter(file => /\.(ttf|otf)$/i.test(file));

    console.log('[FONTS] Configuration loaded');
    console.log(`[FONTS] Config: ${fontConfigFile}`);
    console.log(`[FONTS] Directory: ${fontsDir}`);
    console.log(`[FONTS] Fonts found: ${fonts.join(', ') || 'NONE'}`);
}
