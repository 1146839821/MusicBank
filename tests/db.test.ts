import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { MusicBankDatabase } from '../electron/db.js'
import { emptyScore, newNote, withChordTone, parseScore } from '../src/notation/score'

const roots: string[] = []

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('MusicBankDatabase', () => {
  it('persists a music notation question and restores its structured answers', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-test-'))
    roots.push(root)
    const database = new MusicBankDatabase(root)
    const score = { ...emptyScore(), notes: [withChordTone(newNote(0), { pitch: 2, accidental: 'b' })] }
    const notationSource = JSON.stringify(score)
    database.saveQuestion({
      id: 'MUS-TEST-001',
      title: '节奏记号“♩”代表的音符是？',
      grade: '三年级',
      category: '音乐记号',
      type: '选择题',
      status: '已发布',
      hasAudio: false,
      hasImage: false,
      updated: '刚刚',
      difficulty: '基础',
      options: ['全音符', '二分音符', '四分音符', '八分音符'],
      correctAnswer: 'C',
      explanation: '♩是四分音符，通常占一拍。',
      notationDocument: notationSource,
    })

    const [question] = database.listQuestions()
    expect(question.notationDocument).toBe(notationSource)
    database.saveQuestion({ ...question, notationDocument: JSON.stringify({ ...score, title: '修改源稿' }) })
    database.close()
    const reopened = new MusicBankDatabase(root)
    const restored = parseScore(reopened.listQuestions()[0].notationDocument)
    expect(restored.title).toBe('修改源稿')
    expect(restored.notes[0].chord).toEqual([{ pitch: 2, accidental: 'b' }])
    reopened.close()
    expect(question.title).toContain('♩')
    expect(question.options).toEqual(['全音符', '二分音符', '四分音符', '八分音符'])
    expect(question.correctAnswer).toBe('C')
    expect(question.explanation).toContain('四分音符')
  })

  it('keeps an asset reference when a question is saved', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-test-'))
    roots.push(root)
    const database = new MusicBankDatabase(root)
    const asset = { id: 'asset-audio-1', assetType: 'audio' as const, originalName: 'erhu.mp3', storedName: 'asset-audio-1.mp3', mimeType: 'audio/mpeg', fileSize: 10, durationMs: 1200 }
    database.saveAsset(asset)
    database.saveQuestion({
      id: 'MUS-TEST-002',
      title: '请聆听音乐片段，判断主要演奏乐器。',
      grade: '六年级',
      category: '民族、西洋乐器',
      type: '选择题',
      status: '已发布',
      hasAudio: true,
      hasImage: false,
      updated: '刚刚',
      difficulty: '中等',
      audioAssetId: asset.id,
      audioName: asset.originalName,
      audioDuration: '00:01',
      options: ['二胡', '小提琴', '琵琶', '竹笛'],
      correctAnswer: 'A',
    })
    const [question] = database.listQuestions()
    expect(question.hasAudio).toBe(true)
    expect(question.audioAssetId).toBe(asset.id)
    expect(database.findAsset(asset.id)?.originalName).toBe('erhu.mp3')
    database.close()
  })

  it('persists multiple-choice answers and answer mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-test-'))
    roots.push(root)
    const database = new MusicBankDatabase(root)
    database.saveQuestion({
      id: 'MUS-TEST-MULTI',
      title: '下列哪些属于打击乐器？',
      grade: '五年级',
      category: '民族、西洋乐器',
      type: '选择题',
      status: '已发布',
      hasAudio: false,
      hasImage: false,
      updated: '刚刚',
      difficulty: '基础',
      options: ['鼓', '小提琴', '锣', '长笛'],
      correctAnswer: 'A,C',
      answerMode: 'multiple',
    })

    const [question] = database.listQuestions()
    expect(question.correctAnswer).toBe('A,C')
    expect(question.answerMode).toBe('multiple')
    database.close()
  })

  it('persists exam attempts, answers, practice records and deduplicated wrong questions', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-test-'))
    roots.push(root)
    const database = new MusicBankDatabase(root)
    database.saveQuestion({ id: 'MUS-TEST-003', title: '♩代表什么？', grade: '六年级', category: '音乐记号', type: '选择题', status: '已发布', hasAudio: false, hasImage: false, updated: '刚刚', difficulty: '基础' })
    database.savePaper({
      id: 'PAPER-TEST-001',
      name: '音乐阶段卷',
      grade: '六年级',
      totalScore: 2,
      durationMinutes: 10,
      items: [{ position: 1, questionId: 'MUS-TEST-003', score: 2, snapshot: { id: 'MUS-TEST-003', title: '♩代表什么？', grade: '六年级', category: '音乐记号', type: '选择题', status: '已发布', hasAudio: false, hasImage: false, updated: '刚刚', difficulty: '基础' } }],
    })
    expect(database.listPapers()[0].items[0].snapshot.title).toContain('♩')
    database.saveExamAttempt({ id: 'ATTEMPT-TEST-001', paperId: 'PAPER-TEST-001', status: '进行中', startedAt: '2026-10-19T04:00:00.000Z', remainingSeconds: 600 })
    database.saveExamAnswer({ attemptId: 'ATTEMPT-TEST-001', position: 1, answer: 'C', score: 2, reviewStatus: '已评分' })
    database.savePracticeRecord({ questionId: 'MUS-TEST-003', answer: 'A', result: 'wrong' })
    database.upsertWrongQuestion('MUS-TEST-003')
    database.upsertWrongQuestion('MUS-TEST-003')
    expect(database.listWrongQuestionIds()).toEqual(['MUS-TEST-003'])
    database.removeWrongQuestion('MUS-TEST-003')
    expect(database.listWrongQuestionIds()).toEqual([])
    database.close()
  })

  it('keeps managed asset directories available when data is cleared for restore', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-test-'))
    roots.push(root)
    const database = new MusicBankDatabase(root)
    const asset = { id: 'asset-image-1', assetType: 'image' as const, originalName: 'score.png', storedName: 'asset-image-1.png', mimeType: 'image/png', fileSize: 4 }
    writeFileSync(join(database.imagePath, asset.storedName), Buffer.from([1, 2, 3, 4]))
    database.saveAsset(asset)
    expect(database.listAssets()).toHaveLength(1)
    database.clearAllData()
    expect(database.listAssets()).toEqual([])
    expect(existsSync(database.audioPath)).toBe(true)
    expect(existsSync(database.imagePath)).toBe(true)
    database.close()
  })

  it('stores a local user securely and supports password change and reset', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-test-'))
    roots.push(root)
    const database = new MusicBankDatabase(root)

    expect(database.getUserProfile()).toBeNull()
    const profile = database.createUser('music.teacher', '林老师', 'old-password')
    expect(profile.username).toBe('music.teacher')
    expect(profile.userCode).toMatch(/^MB-[A-F0-9]{6}$/)
    expect(database.verifyPassword('old-password')).toBe(true)
    expect(database.verifyPassword('wrong-password')).toBe(false)

    database.changePassword('old-password', 'new-password')
    expect(database.verifyPassword('old-password')).toBe(false)
    expect(database.verifyPassword('new-password')).toBe(true)

    expect(() => database.resetPassword('MB-WRONG1', 'reset-password')).toThrow('用户编码不正确')
    database.resetPassword(profile.userCode, 'reset-password')
    expect(database.verifyPassword('new-password')).toBe(false)
    expect(database.verifyPassword('reset-password')).toBe(true)

    const inspector = new Database(database.databasePath, { readonly: true })
    const passwordSetting = inspector.prepare('SELECT value_json AS valueJson FROM system_settings WHERE key = ?').get('user.password') as { valueJson: string }
    expect(passwordSetting.valueJson).not.toContain('old-password')
    expect(passwordSetting.valueJson).not.toContain('new-password')
    expect(passwordSetting.valueJson).not.toContain('reset-password')
    expect(passwordSetting.valueJson).toContain('salt')
    expect(passwordSetting.valueJson).toContain('hash')
    inspector.close()
    database.close()
  })
})
