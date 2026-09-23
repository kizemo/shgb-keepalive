// Build script: 用 7z SFX 把 node_modules + exe 打包成单文件 installer
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const STAGING = path.join(ROOT, 'dist', 'installer-staging');
const DIST = path.join(ROOT, 'dist');

console.log('[build-installer] Staging dir:', STAGING);

if (!fs.existsSync(STAGING)) {
    console.error('[FATAL] staging dir missing:', STAGING);
    process.exit(1);
}

// 1. 打包 staging 到 7z 归档
const archivePath = path.join(DIST, 'shgb-keepalive-installer.7z');
console.log('[step 1] Creating 7z archive...');
execSync(`7z a -t7z -mx=7 -sfx7z.sfx "${archivePath}" "*"`, { cwd: STAGING, stdio: 'inherit' });

// 2. 把 7z.sfx + config + archive 拼接成 installer.exe
const installerExe = path.join(DIST, 'shgb-keepalive-installer.exe');
const sfxConfig = path.join(STAGING, 'sfx-config.txt');
const sevenZipSfx = 'C:\\Program Files\\7-Zip\\7z.sfx';

console.log('[step 2] Concatenating SFX + config + archive...');
execSync(
    `copy /B "${sevenZipSfx}" + "${sfxConfig}" + "${archivePath}" "${installerExe}"`,
    { stdio: 'inherit', shell: 'cmd.exe' }
);

console.log('[OK] installer built →', installerExe);
console.log('   size:', (fs.statSync(installerExe).size / 1024 / 1024).toFixed(1), 'MB');