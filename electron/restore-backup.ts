import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {validateLearningBackup} from './learning-backup.js'
import { isBackupAssetFilename, verifyBackupAssetBytes } from './backup-validation.js'
import type { MusicBankDatabase } from './db.js'
import type { BackupPayload } from './types.js'

/** Stage files first; keep original assets until the database transaction commits. */
export function restoreBackup(database: MusicBankDatabase, payload: BackupPayload) {
  validateLearningBackup(payload)
  const stage = mkdtempSync(join(database.root, '.restore-'))
  const swaps: Array<{ target: string; original: string; installed: boolean }> = []
  let committed = false
  let rolledBack = false
  try {
    for (const folder of ['audio', 'images']) mkdirSync(join(stage, folder))
    for (const item of payload.assets) {
      if (!isBackupAssetFilename(item.record.storedName)) throw new Error('备份文件包含无效的资源文件名')
      const folder = item.record.assetType === 'audio' ? 'audio' : 'images'
      const bytes = Buffer.from(item.bytesBase64, 'base64')
      verifyBackupAssetBytes(item.record, bytes)
      writeFileSync(join(stage, folder, item.record.storedName), bytes, { flag: 'wx' })
    }
    for (const [folder, target] of [['audio', database.audioPath], ['images', database.imagePath]]) {
      const original = join(stage, `${folder}-original`)
      renameSync(target, original)
      const swap = { target, original, installed: false }
      swaps.push(swap)
      renameSync(join(stage, folder), target)
      swap.installed = true
    }
    database.restoreBackupRecords(payload)
    committed = true
  } catch (error) {
    for (const swap of swaps.reverse()) {
      if (swap.installed) rmSync(swap.target, { recursive: true, force: true })
      renameSync(swap.original, swap.target)
    }
    rolledBack = true
    throw error
  } finally {
    // After commit cleanup is best effort; a cleanup failure must not report restore failure.
    // On rollback failure retain the staging directory so original assets can be recovered.
    if (committed || rolledBack) {
      try { rmSync(stage, { recursive: true, force: true }) } catch { /* retain temporary files */ }
    }
  }
}
