import path from 'node:path';

export function setupFonts() {
    process.env.FONTCONFIG_PATH = path.resolve(
        process.cwd(),
        'fontconfig'
    );

    process.env.FONTCONFIG_FILE = path.resolve(
        process.cwd(),
        'fontconfig/fonts.conf'
    );
}
