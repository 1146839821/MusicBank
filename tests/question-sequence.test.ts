import { it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { MusicBankDatabase } from '../electron/db'
import type { BackupPayload, QuestionRecord } from '../electron/types'
const question:QuestionRecord={id:'MUS-000123',title:'测试',type:'选择题',grade:'六年级',category:'音乐要素',status:'草稿',difficulty:'基础',hasAudio:false,hasImage:false,updated:'刚刚'}
it('never reuses reserved or deleted IDs, including separate connections and restarts',()=>{
  const root=mkdtempSync(join(tmpdir(),'musicbank-sequence-'))
  let db=new MusicBankDatabase(root)
  try{
    db.saveQuestion(question);db.deleteQuestion(question.id)
    expect(db.reserveQuestionId()).toBe('MUS-000124')
    const second=new MusicBankDatabase(root)
    try{expect(second.reserveQuestionId()).toBe('MUS-000125')}finally{second.close()}
    db.close();db=new MusicBankDatabase(root)
    expect(db.reserveQuestionId()).toBe('MUS-000126')
  }finally{db.close();rmSync(root,{recursive:true,force:true})}
})
it('migrates historical snapshot IDs and preserves the high-water mark across backup restores',()=>{
  const root=mkdtempSync(join(tmpdir(),'musicbank-sequence-migration-'))
  let db=new MusicBankDatabase(root)
  try{
    db.savePaper({id:'old-paper',name:'历史试卷',grade:'六年级',totalScore:2,durationMinutes:40,items:[{position:1,questionId:'MUS-000500',score:2,snapshot:{...question,id:'MUS-000500'}}]})
    const raw=new Database(db.databasePath)
    raw.prepare('DELETE FROM system_settings WHERE key=?').run('questions.sequence');raw.close()
    db.close();db=new MusicBankDatabase(root)
    expect(db.reserveQuestionId()).toBe('MUS-000501')
    const backup:BackupPayload={format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questionSequence:700,questions:[],papers:[],assets:[],wrongQuestionIds:[]}
    db.restoreBackupRecords(backup)
    expect(db.reserveQuestionId()).toBe('MUS-000701')
    db.restoreBackupRecords({...backup,questionSequence:1})
    expect(db.reserveQuestionId()).toBe('MUS-000702')
  }finally{db.close();rmSync(root,{recursive:true,force:true})}
})
