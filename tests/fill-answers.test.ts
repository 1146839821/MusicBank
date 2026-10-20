import {describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {parseFillAnswers, fillAnswersCorrect, formatFillAnswers} from '../electron/fill-answers'
import {answerText} from '../electron/paper-documents'
import {MusicBankDatabase} from '../electron/db'
import {createBackup} from '../electron/create-backup'
import {restoreBackup} from '../electron/restore-backup'
import type {QuestionRecord} from '../electron/types'

describe('ordered fill-in blanks with explicit alternatives', () => {
  it('requires all blanks in order rather than accepting any one standard answer', () => {
    const expected = ['四分音符', '一拍']
    expect(fillAnswersCorrect('四分音符', expected)).toBe(false)
    expect(fillAnswersCorrect('四分音符\n一拍', expected)).toBe(true)
    for (const response of ['一拍\n四分音符', '\n一拍', '四分音符\n', '四分音符\n一拍\n多余内容']) expect(fillAnswersCorrect(response, expected)).toBe(false)
  })
  it('accepts only the explicitly configured alternatives for each blank', () => {
    const answers = parseFillAnswers(' 四分音符 | ♩ | 四分音符 \n 一拍 | 1拍 ')
    expect(answers).toEqual(['四分音符 | ♩', '一拍 | 1拍'])
    expect(fillAnswersCorrect('♩\n1拍', answers)).toBe(true)
    expect(fillAnswersCorrect('四分音符号\n一拍', answers)).toBe(false)
    expect(fillAnswersCorrect('♩\n1拍', [])).toBe(false)
  })
  it('rejects missing standard answers and preserves meaningful numeric and music symbols', () => {
    for (const text of ['', ' | ♩', '♩ | ', '一拍\n\n二拍']) expect(() => parseFillAnswers(text)).toThrow('标准答案')
    expect(fillAnswersCorrect(' MF ', ['mf'])).toBe(true)
    expect(fillAnswersCorrect('15', ['1.5'])).toBe(false)
    expect(fillAnswersCorrect('C', ['C♯'])).toBe(false)
  })
  it('formats separate blank numbers and alternatives in answer documents', () => {
    expect(formatFillAnswers(['四分音符 | ♩', '一拍'])).toBe('第1空：四分音符 / ♩；第2空：一拍')
    expect(answerText({type: '填空题', fillAnswers: ['四分音符 | ♩', '一拍']} as QuestionRecord)).toBe('第1空：四分音符 / ♩；第2空：一拍')
  })
  it('preserves blank groups through SQLite restart and backup restore without a schema reset', () => {
    const root = mkdtempSync(join(tmpdir(), 'musicbank-fill-')), restored = mkdtempSync(join(tmpdir(), 'musicbank-fill-restore-'))
    let db = new MusicBankDatabase(root)
    const target = new MusicBankDatabase(restored)
    try {
      db.saveQuestion({id:'fill',title:'音符名称____，拍数____。',grade:'三年级',category:'音乐记号',type:'填空题',status:'已发布',difficulty:'基础',hasAudio:false,hasImage:false,updated:'刚刚',fillAnswers:parseFillAnswers('四分音符 | ♩\n一拍')})
      db.close(); db = new MusicBankDatabase(root)
      const question = db.listQuestions()[0]
      expect(fillAnswersCorrect('♩\n一拍', question.fillAnswers)).toBe(true)
      restoreBackup(target, JSON.parse(JSON.stringify(createBackup(db))))
      expect(target.listQuestions()[0].fillAnswers).toEqual(question.fillAnswers)
    } finally { db.close(); target.close(); rmSync(root,{recursive:true,force:true}); rmSync(restored,{recursive:true,force:true}) }
  })
})
