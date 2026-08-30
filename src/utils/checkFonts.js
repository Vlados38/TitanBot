import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const fontPath = path.resolve(
    process.cwd(),
    'assets/fonts/RussoOne-Regular.ttf'
);

console.log('========================================');
console.log('[FONT CHECK]');
console.log('========================================');

console.log('Current directory:');
console.log(process.cwd());

console.log('');

console.log('Font path:');
console.log(fontPath);

console.log('');

console.log('Font exists:');
console.log(fs.existsSync(fontPath));

console.log('');

console.log('FONTCONFIG_PATH:');
console.log(process.env.FONTCONFIG_PATH || 'NOT SET');

console.log('');

console.log('FONTCONFIG_FILE:');
console.log(process.env.FONTCONFIG_FILE || 'NOT SET');

console.log('');

console.log('========================================');
console.log('[FC-LIST]');
console.log('========================================');

try {
    const result = execSync(
        'fc-list',
        {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

    console.log(result);
} catch (error) {
    console.error(
        'fc-list failed:',
        error.message
    );
}

console.log('');

console.log('========================================');
console.log('[RUSSO ONE SEARCH]');
console.log('========================================');

try {
    const result = execSync(
        'fc-list | grep -i "Russo"',
        {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

    console.log(result);
} catch {
    console.log(
        'Russo One was NOT found by fontconfig.'
    );
}

console.log('');

console.log('========================================');
console.log('[FONT FILE]');
console.log('========================================');

if (fs.existsSync(fontPath)) {
    const stat = fs.statSync(fontPath);

    console.log(
        `Size: ${stat.size} bytes`
    );
} else {
    console.log(
        'FONT FILE DOES NOT EXIST.'
    );
}
