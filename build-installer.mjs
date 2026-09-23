// Build script: 用 7z SFX 把 staging 目录打包成单文件 installer
//
// 本脚本负责:
//   1. 创建/准备 staging 目录
//   2. 同步必需文件(shgb-keepalive.exe, node_modules, README 等)
//   3. 把 installer/ 下的模板文件同步进 staging
//   4. 7z 压缩
//   5. 拼接 SFX + config + 7z → installer.exe
//
// 调用方需要:
//   - 在项目根目录先运行 `npm run build:runner` 出 shgb-keepalive.exe
//   - 本脚本会把 shgb-keepalive.exe + node_modules 自动拷进 staging
//
// installer/ 目录下的模板文件(会自动拷进 staging):
//   - installer/sfx-config.txt
//   - installer/uninstall.bat

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const INSTALLER_DIR = path.join(ROOT, 'installer');
const STAGING = path.join(ROOT, 'dist', 'installer-staging');
const DIST = path.join(ROOT, 'dist');

console.log('[build-installer] Staging dir:', STAGING);

// ---- 1. 准备 staging 目录 ----
if (!fs.existsSync(STAGING)) {
    fs.mkdirSync(STAGING, { recursive: true });
    console.log('[step 0] created staging dir');
}

// ---- 2. 同步必需文件 ----
const mustExist = [
    ['shgb-keepalive.exe', ROOT, STAGING],
    ['config.template.json', ROOT, STAGING],
    ['README.md', ROOT, STAGING],
    ['launch.bat', ROOT, STAGING],
];
for (const [name, src, dst] of mustExist) {
    const from = path.join(src, name);
    const to = path.join(dst, name);
    if (!fs.existsSync(from)) {
        console.error(`[FATAL] missing at project root: ${name}`);
        process.exit(1);
    }
    fs.copyFileSync(from, to);
}
console.log('[step 1] synced launch.bat / config.template.json / README.md');

// 同步 node_modules (只取 playwright + playwright-core)
const nmSrc = path.join(ROOT, 'node_modules');
const nmDst = path.join(STAGING, 'node_modules');
if (!fs.existsSync(nmSrc)) {
    console.error('[FATAL] node_modules missing. Run `npm install` first.');
    process.exit(1);
}
if (!fs.existsSync(nmDst)) fs.mkdirSync(nmDst, { recursive: true });
for (const sub of ['playwright', 'playwright-core']) {
    const from = path.join(nmSrc, sub);
    const to = path.join(nmDst, sub);
    if (!fs.existsSync(from)) {
        console.error(`[FATAL] node_modules/${sub} missing.`);
        process.exit(1);
    }
    fs.cpSync(from, to, { recursive: true });
}
console.log('[step 2] synced node_modules\\playwright + playwright-core');

// ---- 3. 同步 installer/ 模板 ----
if (!fs.existsSync(INSTALLER_DIR)) {
    console.error(`[FATAL] installer/ dir missing at ${INSTALLER_DIR}`);
    process.exit(1);
}
const templates = ['sfx-config.txt', 'uninstall.bat'];
for (const t of templates) {
    const from = path.join(INSTALLER_DIR, t);
    const to = path.join(STAGING, t);
    if (!fs.existsSync(from)) {
        console.error(`[FATAL] installer template missing: ${t}`);
        process.exit(1);
    }
    fs.copyFileSync(from, to);
}
console.log('[step 3] synced installer/sfx-config.txt + uninstall.bat');

// ---- 4. 打包 staging 到 7z 归档 ----
const archivePath = path.join(DIST, 'shgb-keepalive-installer.7z');
console.log('[step 4] Creating 7z archive...');
execSync(`7z a -t7z -mx=7 -sfx7z.sfx "${archivePath}" "*"`, { cwd: STAGING, stdio: 'inherit' });

// ---- 5. 把 7z.sfx + config + archive 拼接成 installer.exe ----
const installerExe = path.join(DIST, 'shgb-keepalive-installer.exe');
const sfxConfig = path.join(STAGING, 'sfx-config.txt');
const sevenZipSfx = 'C:\\Program Files\\7-Zip\\7z.sfx';

console.log('[step 5] Concatenating SFX + config + archive...');
execSync(
    `copy /B "${sevenZipSfx}" + "${sfxConfig}" + "${archivePath}" "${installerExe}"`,
    { stdio: 'inherit', shell: 'cmd.exe' }
);

console.log('[OK] installer built →', installerExe);
console.log('   size:', (fs.statSync(installerExe).size / 1024 / 1024).toFixed(1), 'MB');