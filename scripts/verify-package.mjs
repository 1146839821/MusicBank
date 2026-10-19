import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listPackage, extractFile } from '@electron/asar'

const [platform, arch] = process.argv.slice(2)
if (!['mac', 'win'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
  throw new Error('Usage: node scripts/verify-package.mjs <mac|win> <x64|arm64>')
}
const folder = platform === 'mac'
  ? join('release', arch === 'x64' ? 'mac' : `mac-${arch}`, 'MusicBank.app', 'Contents', 'Resources')
  : join('release', arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`, 'resources')
const archive = join(folder, 'app.asar')
const files = listPackage(archive)
for (const file of ['dist/index.html', 'dist-electron/main.js', 'dist-electron/preload.cjs', 'dist/templates/试卷模板.docx']) {
  if (!files.includes(`/${file}`) || !extractFile(archive, file).length) throw new Error(`Missing packaged file: ${file}`)
}
if (!existsSync(join(folder, 'musicbank.png'))) throw new Error('Missing application icon')
const userData = files.filter(file => !file.startsWith('/node_modules/') && (
  /\.(sqlite|sqlite3|db|wav|mp3|musicbank)$/i.test(file)
  || /\/assets\/(audio|images)\//.test(file)
))
if (userData.length) throw new Error(`User data must not ship in the application: ${userData.join(', ')}`)
console.log(`Verified ${platform} ${arch}: application entry points, default template and icon present; no user data packaged.`)
