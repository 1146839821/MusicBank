import {describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {quickExam} from '../src/quick-exam'
import {MusicBankDatabase} from '../electron/db'
import type {QuestionRecord} from '../electron/types'

function question(id: string, overrides: Partial<QuestionRecord> = {}): QuestionRecord {
  return {id, title: '四分音符有一拍。', grade: '三年级', category: '音乐记号专项试题', type: '判断题', status: '已发布', difficulty: '基础', updated: '刚刚', hasAudio: false, hasImage: false, correctAnswer: 'true', ...overrides}
}

describe('quick exam from published questions', () => {
  it('uses the actual selected grade and gives judgment questions an objective-question score', () => {
    const paper = quickExam([question('q1'), question('q2', {type: '简答题', referenceAnswer: '一拍'})])!
    expect(paper).toMatchObject({name: '三年级音乐综合模拟卷', grade: '三年级', totalScore: 12, durationMinutes: 40})
    expect(paper.items.map(item => item.score)).toEqual([2, 10])
  })

  it('labels mixed grades honestly, ignoring drafts and questions beyond the selected ten', () => {
    const questions = [question('draft', {status: '草稿', grade: '六年级'}), ...Array.from({length: 10}, (_, i) => question(`q${i}`)), question('outside', {grade: '六年级'})]
    expect(quickExam(questions)).toMatchObject({grade: '三年级', totalScore: 20})
    questions[2].grade = '二年级'
    const mixed = quickExam(questions)!
    expect(mixed).toMatchObject({name: '混合年级音乐综合模拟卷', grade: '全部年级'})
    expect(mixed.items).toHaveLength(10)
    expect(mixed.items.map(item => item.questionId)).not.toContain('draft')
    expect(mixed.items.at(-1)?.position).toBe(10)
  })

  it('returns no paper for an empty published pool and snapshots question content', () => {
    expect(quickExam([])).toBeNull()
    expect(quickExam([question('draft', {status: '草稿'})])).toBeNull()
    const source = question('q1', {type: '选择题', options: ['一拍', '两拍'], correctAnswer: 'A'})
    const paper = quickExam([source])!
    source.options![0] = '修改后的选项'
    source.title = '修改后的题干'
    expect(paper.items[0].snapshot).toMatchObject({title: '四分音符有一拍。', options: ['一拍', '两拍']})
  })

  it('persists the same metadata and score in the exam record after reopening the database', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-quick-exam-'))
    let db = new MusicBankDatabase(root)
    try {
      const paper = {id: 'quick-paper', ...quickExam([question('q1'), question('q2', {grade: '四年级', type: '填空题', fillAnswers: ['一拍']})])!}
      db.savePaper(paper)
      db.saveExamAttempt({id: 'attempt', paperId: paper.id, status: '进行中', startedAt: new Date().toISOString(), remainingSeconds: 2400})
      db.close()
      db = new MusicBankDatabase(root)
      expect(db.listExamSessions()[0].paper).toMatchObject({name: '混合年级音乐综合模拟卷', grade: '全部年级', totalScore: 5})
      expect(db.listExamSessions()[0].paper.items.map(item => item.score)).toEqual([2, 3])
    } finally {
      db.close()
      rmSync(root, {recursive: true, force: true})
    }
  })
})
