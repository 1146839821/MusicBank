import { it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createPackage } from '@electron/asar'

it('checks all three bundle locations and rejects shipped user data or missing templates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'musicbank-package-'))
  const source = join(root, 'source')
  const script = resolve('scripts/verify-package.mjs')
  try {
    for (const file of ['dist/index.html','dist-electron/main.js','dist-electron/db.js','dist-electron/preload.cjs','dist/templates/试卷模板.docx','node_modules/better-sqlite3/package.json','node_modules/better-sqlite3/lib/index.js']) {
      const target = join(source, file)
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, 'fixture')
    }
    for (const [platform, arch, folder] of [
      ['mac','x64','mac/MusicBank.app/Contents/Resources'],
      ['mac','arm64','mac-arm64/MusicBank.app/Contents/Resources'],
      ['win','x64','win-unpacked/resources'],
    ]) {
      const resources = join(root, 'release', folder)
      mkdirSync(resources, { recursive: true })
      writeFileSync(join(resources, 'musicbank.png'), 'icon')
      await createPackage(source, join(resources, 'app.asar'))
      const run = () => spawnSync(process.execPath, [script, platform, arch], { cwd: root, encoding: 'utf8' })
      const nativeBinary = join(resources, `app.asar.unpacked/node_modules/better-sqlite3/prebuilds/${platform === 'mac' ? 'darwin' : 'win32'}-${arch}.node`)
      mkdirSync(resolve(nativeBinary, '..'), { recursive: true })
      writeFileSync(nativeBinary, 'native fixture')
      const valid = run()
      expect(valid.status, valid.stderr).toBe(0)
      rmSync(nativeBinary)
      expect(run().stderr).toContain('Missing unpacked SQLite native binary')
      writeFileSync(nativeBinary, 'native fixture')
      rmSync(join(source, 'node_modules/better-sqlite3/package.json'))
      await createPackage(source, join(resources, 'app.asar'))
      expect(run().stderr).toContain('Missing runtime dependency')
      writeFileSync(join(source, 'node_modules/better-sqlite3/package.json'), 'fixture')
      writeFileSync(join(source, 'musicbank.sqlite'), 'private data')
      await createPackage(source, join(resources, 'app.asar'))
      expect(run().stderr).toContain('User data must not ship')
      rmSync(join(source, 'musicbank.sqlite'))
    }
    rmSync(join(source, 'dist/templates/试卷模板.docx'))
    const resources = join(root, 'release/win-unpacked/resources')
    await createPackage(source, join(resources, 'app.asar'))
    expect(spawnSync(process.execPath, [script,'win','x64'], { cwd:root, encoding:'utf8' }).stderr).toContain('Missing packaged file')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
