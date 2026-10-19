/** Backup assets are plain filenames on both supported desktop platforms. */
export function isBackupAssetFilename(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..'
    && !/[\\/\x00-\x1f<>:"|?*]/.test(value)
    && !/[. ]$/.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
}
