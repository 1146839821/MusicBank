import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MusicBankDatabase } from '../electron/db'
import { restoreBackup } from '../electron/restore-backup'
import type { BackupPayload, QuestionRecord } from '../electron/types'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function question(id: string): QuestionRecord {
  return { id, title: '节奏题', grade: '三年级', category: '音乐记号', type: '选择题', status: '已发布', hasAudio: false, hasImage: false, updated: '刚刚', difficulty: '基础' }
}
function payload(): BackupPayload {
  return { format: 'musicbank-backup', version: 1, exportedAt: new Date().toISOString(), questions: [question('NEW')], papers: [], wrongQuestionIds: [], assets: [{ record: { id: 'new-image', assetType: 'image', originalName: 'new.png', storedName: 'new.png', mimeType: 'image/png', fileSize: 3 }, bytesBase64: Buffer.from('new').toString('base64') }] }
}
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'musicbank-restore-test-'))
  roots.push(root)
  const database = new MusicBankDatabase(root)
  database.saveQuestion(question('ORIGINAL'))
  database.createUser('teacher', '老师', 'password123')
  writeFileSync(join(database.imagePath, 'original.png'), 'original')
  return database
}

describe('backup restore rollback', () => {
  it('restores records and files while keeping the current user', () => {
    const database = setup()
    try {
      restoreBackup(database, payload())
      expect(database.listQuestions().map((item) => item.id)).toEqual(['NEW'])
      expect(readFileSync(join(database.imagePath, 'new.png'), 'utf8')).toBe('new')
      expect(readdirSync(database.imagePath)).toEqual(['new.png'])
      expect(database.verifyPassword('password123')).toBe(true)
      expect(readdirSync(database.root).some((name) => name.startsWith('.restore-'))).toBe(false)
    } finally { database.close() }
  })

  it('rolls back database changes and original media if a record cannot be saved', () => {
    const database = setup()
    try {
      const backup = payload()
      backup.questions.push({ ...question('INVALID'), type: 'invalid' as QuestionRecord['type'] })
      expect(() => restoreBackup(database, backup)).toThrow()
      expect(database.listQuestions().map((item) => item.id)).toEqual(['ORIGINAL'])
      expect(database.listAssets()).toEqual([])
      expect(readFileSync(join(database.imagePath, 'original.png'), 'utf8')).toBe('original')
      expect(readdirSync(database.imagePath)).toEqual(['original.png'])
      expect(database.verifyPassword('password123')).toBe(true)
    } finally { database.close() }
  })

  it('rejects duplicate staged filenames before changing the original data', () => {
    const database = setup()
    try {
      const backup = payload()
      backup.assets.push(backup.assets[0])
      expect(() => restoreBackup(database, backup)).toThrow()
      expect(database.listQuestions()[0].id).toBe('ORIGINAL')
      expect(readFileSync(join(database.imagePath, 'original.png'), 'utf8')).toBe('original')
    } finally { database.close() }
  })
  it.each(['truncated', 'checksum'])('rejects %s media before modifying the original data', (failure) => {
    const database = setup()
    try {
      const backup = payload()
      if (failure === 'truncated') backup.assets[0].bytesBase64 = ''
      else backup.assets[0].record.sha256 = '0'.repeat(64)
      expect(() => restoreBackup(database, backup)).toThrow(/素材/)
      expect(database.listQuestions()[0].id).toBe('ORIGINAL')
      expect(readFileSync(join(database.imagePath, 'original.png'), 'utf8')).toBe('original')
      expect(readdirSync(database.root).some((name) => name.startsWith('.restore-'))).toBe(false)
    } finally { database.close() }
  })

})
