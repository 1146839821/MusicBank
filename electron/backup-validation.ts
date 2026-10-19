import { createHash } from 'node:crypto'
import type { AssetRecord } from './types.js'

/** Backup assets are plain filenames on both supported desktop platforms. */
export function isBackupAssetFilename(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..'
    && !/[\\/\x00-\x1f<>:"|?*]/.test(value)
    && !/[. ]$/.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
}

export function verifyBackupAssetBytes(record: AssetRecord, bytes: Uint8Array) {
  if (!Number.isSafeInteger(record.fileSize) || record.fileSize < 0 || bytes.byteLength !== record.fileSize) {
    throw new Error(`素材大小不匹配：${record.originalName || record.storedName}`)
  }
  if (record.sha256 && createHash('sha256').update(bytes).digest('hex') !== record.sha256) {
    throw new Error(`素材校验失败：${record.originalName || record.storedName}`)
  }
}
