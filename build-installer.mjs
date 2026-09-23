// Build script: 用 7z SFX 把 staging 目录打包成单文件 installer
//
// staging 目录由调用方准备,本脚本负责:
//   1. 把 launch.bat(项目根) 同步进 staging
//   2. 检查 staging 必需文件
//   3. 7z 压缩
//   4. 拼接 SFX + config + 7z → installer.exe
//
// staging 至少需要这些文件:
//   - shgb-keepalive.exe
//   - node_modules\playwright + node_modules\playwright-core
//   - config.template.json
//   - README.md
//   - uninstall.bat
//   - sfx-config.txt
//   - launch.bat   ← 本脚本会自动从项目根复制

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const STAGING = path.join(ROOT, 'dist', 'installer-staging');
const DIST = path.join(ROOT, 'dist');

console.log('[build-installer] Staging dir:', STAGING);

if (!fs.existsSync(STAGING)) {
    console.error('[FATAL] staging dir missing:', STAGING);
    console.error('        请先准备 staging 目录(参考 README.md "重新打包" 章节)。');
    process.exit(1);
}

// ---- 1. 同步 launch.bat 到 staging ----
const launchSrc = path.join(ROOT, 'launch.bat');
const launchDst = path.join(STAGING, 'launch.bat');
if (!fs.existsSync(launchSrc)) {
    console.error('[FATAL] launch.bat missing at project root:', launchSrc);
    process.exit(1);
}
fs.copyFileSync(launchSrc, launchDst);
console.log('[step 0] synced launch.bat →', launchDst);

// ---- 2. 校验 staging 必需文件 ----
const required = [
    'shgb-keepalive.exe',
    'config.template.json',
    'README.md',
    'uninstall.bat',
    'sfx-config.txt',
    'launch.bat',
    'node_modules/playwright',
    'node_modules/playwright-core',
];
const missing = required.filter((rel) => !fs.existsSync(path.join(STAGING, rel)));
if (missing.length) {
    console.error('[FATAL] staging missing files:', missing);
    console.error('        解压这些文件到', STAGING);
    process.exit(1);
}
console.log('[check ] staging 必需文件齐全');

// ---- 3. 打包 staging 到 7z 归档 ----
const archivePath = path.join(DIST, 'shgb-keepalive-installer.7z');
console.log('[step 1] Creating 7z archive...');
execSync(`7z a -t7z -mx=7 -sfx7z.sfx "${archivePath}" "*"`, { cwd: STAGING, stdio: 'inherit' });

// ---- 4. 把 7z.sfx + config + archive 拼接成 installer.exe ----
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