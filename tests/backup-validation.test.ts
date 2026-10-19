import { describe, expect, it } from 'vitest'
import { isBackupAssetFilename } from '../electron/backup-validation'

describe('backup asset filename preflight', () => {
  it.each(['asset-123.png', '乐谱.png', 'audio-456.wav'])('accepts stored asset %s', (value) => {
    expect(isBackupAssetFilename(value)).toBe(true)
  })
  it.each(['', '.', '..', '../outside.png', '/tmp/image.png', 'folder/image.png',
    'folder\\image.png', 'C:\\image.png', 'CON.png', 'nul', 'com1.wav', 'name.', 'name ',
    'invalid\u0000.png', 'invalid:stream.png', null, undefined, 123])('rejects invalid asset %s before restore', (value) => {
    expect(isBackupAssetFilename(value)).toBe(false)
  })
})
