import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { listPackage, extractFile } from '@electron/asar'

const [platform, arch] = process.argv.slice(2)
if (!['mac', 'win'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
  throw new Error('Usage: node scripts/verify-package.mjs <mac|win> <x64|arm64>')
}
const folder = platform === 'mac'
  ? join('release', arch === 'x64' ? 'mac' : `mac-${arch}`, 'MusicBank.app', 'Contents', 'Resources')
  : join('release', arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`, 'resources')
const archive = join(folder, 'app.asar')
const files = listPackage(archive).map(file => file.replaceAll('\\', '/'))
for (const file of ['dist/index.html', 'dist-electron/main.js', 'dist-electron/preload.cjs', 'dist/templates/试卷模板.docx']) {
  if (!files.includes(`/${file}`) || !extractFile(archive, file).length) throw new Error(`Missing packaged file: ${file}`)
}
for (const file of ['node_modules/better-sqlite3/package.json', 'node_modules/better-sqlite3/lib/index.js']) {
  if (!files.includes(`/${file}`)) throw new Error(`Missing runtime dependency: ${file}`)
}
const nativeBinary = join(`${archive}.unpacked`, `node_modules/better-sqlite3/prebuilds/${platform === 'mac' ? 'darwin' : 'win32'}-${arch}.node`)
if (!existsSync(nativeBinary)) throw new Error(`Missing unpacked SQLite native binary: ${nativeBinary}`)
if (process.argv.includes('--smoke')) {
  // Execute with the shipped Electron runtime, so platform/architecture/ABI errors fail CI too.
  const executable = platform === 'mac'
    ? resolve(folder, '../MacOS/MusicBank')
    : resolve(folder, '../MusicBank.exe')
  const probe = `
    const Database = require(${JSON.stringify(resolve(archive, 'node_modules/better-sqlite3'))});
    const db = new Database(':memory:');
    db.exec('CREATE TABLE smoke (value TEXT)');
    db.prepare('INSERT INTO smoke VALUES (?)').run('musicbank-package-ok');
    if (db.prepare('SELECT value FROM smoke').get().value !== 'musicbank-package-ok') throw Error('SQLite round trip failed');
    db.close();
    console.log('musicbank-package-ok');
  `
  const result = spawnSync(executable, ['--eval', probe], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 30000,
  })
  if (result.error || result.status !== 0 || !result.stdout?.includes('musicbank-package-ok')) {
    throw new Error(`Packaged SQLite smoke test failed: ${result.error || result.stderr || result.stdout || result.status}`)
  }
  console.log(`Packaged ${platform} ${arch} SQLite read/write passed.`)
}
if (!existsSync(join(folder, 'musicbank.png'))) throw new Error('Missing application icon')
const userData = files.filter(file => !file.startsWith('/node_modules/') && (
  /\.(sqlite|sqlite3|db|wav|mp3|musicbank)$/i.test(file)
  || /\/assets\/(audio|images)\//.test(file)
))
if (userData.length) throw new Error(`User data must not ship in the application: ${userData.join(', ')}`)
console.log(`Verified ${platform} ${arch}: application entry points, default template and icon present; SQLite dependency and native binary present; no user data packaged.`)
