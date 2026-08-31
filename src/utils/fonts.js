import fs from 'node:fs';
import path from 'node:path';

export function setupFonts() {
    const root = process.cwd();

    const fontsDir = path.join(root, 'assets', 'fonts');
    const configDir = path.join(root, 'fontconfig');
    const configFile = path.join(configDir, 'fonts.conf');

    if (!fs.existsSync(fontsDir)) {
        throw new Error(
            `[FONTS] Fonts directory not found: ${fontsDir}`
        );
    }

    if (!fs.existsSync(configFile)) {
        throw new Error(
            `[FONTS] Fontconfig config not found: ${configFile}`
        );
    }

    process.env.FONTCONFIG_PATH = configDir;
    process.env.FONTCONFIG_FILE = configFile;

    console.log('[FONTS] Fontconfig initialized');
    console.log(`[FONTS] Path: ${configDir}`);
    console.log(`[FONTS] Config: ${configFile}`);

    const fonts = fs
        .readdirSync(fontsDir)
        .filter(file => /\.(ttf|otf)$/i.test(file));

    console.log(
        `[FONTS] Found: ${fonts.join(', ') || 'NONE'}`
    );
}
