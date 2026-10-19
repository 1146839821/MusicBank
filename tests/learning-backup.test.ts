import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {MusicBankDatabase} from '../electron/db'
import {createBackup} from '../electron/create-backup'
import {restoreBackup} from '../electron/restore-backup'
import type {BackupPayload,ExamAttemptRecord,PaperRecord,QuestionRecord} from '../electron/types'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function database(){const root=mkdtempSync(join(tmpdir(),'musicbank-learning-backup-'));roots.push(root);return new MusicBankDatabase(root)}
function populated(){
  const db=database()
  const asset={id:'image',assetType:'image' as const,originalName:'乐谱.png',storedName:'owned.png',fileSize:3,mimeType:'image/png'}
  db.saveAsset(asset);writeFileSync(join(db.imagePath,asset.storedName),'png')
  const q:QuestionRecord={id:'Q',title:'旋律是什么？',grade:'三年级',category:'音乐要素',type:'简答题',status:'已发布',hasImage:true,hasAudio:false,updated:'刚刚',difficulty:'基础',referenceAnswer:'音高组织',attachments:[{id:asset.id,assetType:'image',name:asset.originalName}]}
  db.saveQuestion(q)
  const paper:PaperRecord={id:'P',name:'学习记录验收',grade:'三年级',totalScore:10,durationMinutes:10,items:[{position:1,questionId:q.id,score:10,snapshot:q}]}
  db.savePaper(paper)
  const progress:ExamAttemptRecord={id:'active',paperId:'P',status:'进行中',startedAt:'2026-10-20T01:00:00.000Z',remainingSeconds:231}
  db.saveExamAttempt(progress);db.saveExamAnswer({attemptId:'active',position:1,answer:'作答中',reviewStatus:'待批阅'})
  db.saveExamAttempt({...progress,id:'finished'})
  db.finishExam({...progress,id:'finished'},[{attemptId:'finished',position:1,answer:'音高的组织',reviewStatus:'待批阅'}])
  db.reviewExamAnswer('finished',1,8.5,'表述准确')
  db.savePracticeRecord({questionId:'Q',answer:'第一次作答',result:'wrong'})
  db.savePracticeRecord({questionId:'Q',answer:'第二次作答',result:'pending'})
  db.upsertWrongQuestion('Q');db.upsertWrongQuestion('Q')
  return db
}
function serialized(db:MusicBankDatabase):BackupPayload{return JSON.parse(JSON.stringify(createBackup(db)))}
describe('complete learning backup',()=>{
  it('round trips recoverable exams, manual grades, practice history and wrong counts without changing the destination account',()=>{
    const source=populated(),target=database()
    target.createUser('destination','本机用户','local-password-123')
    const backup=serialized(source)
    restoreBackup(target,backup)
    expect(target.listExamSessions()).toEqual(source.listExamSessions())
    expect(target.listPracticeRecords()).toEqual(source.listPracticeRecords())
    expect(target.listWrongQuestionRecords()).toEqual(source.listWrongQuestionRecords())
    expect(target.verifyPassword('local-password-123')).toBe(true)
    expect(target.getUserProfile()?.nickname).toBe('本机用户')
    expect(readFileSync(join(target.imagePath,'owned.png'),'utf8')).toBe('png')
    target.saveExamAnswer({attemptId:'active',position:1,answer:'恢复后继续作答',reviewStatus:'待批阅'})
    target.finishExam(backup.exams!.find(session=>session.attempt.id==='active')!.attempt,[{attemptId:'active',position:1,answer:'恢复后继续作答',reviewStatus:'待批阅'}])
    target.reviewExamAnswer('active',1,9,'恢复后批阅')
    expect(target.listExamSessions().find(session=>session.attempt.id==='active')?.answers[0]).toMatchObject({answer:'恢复后继续作答',score:9,comment:'恢复后批阅'})
    source.close();target.close()
  })
  it('keeps version-1 backups without learning extensions compatible',()=>{
    const source=populated(),target=database(),backup=serialized(source)
    delete backup.exams;delete backup.practiceRecords;delete backup.wrongRecords
    restoreBackup(target,backup)
    expect(target.listExamSessions()).toEqual([]);expect(target.listPracticeRecords()).toEqual([])
    expect(target.listWrongQuestionIds()).toEqual(['Q']);expect(target.listWrongQuestionRecords()[0].wrongCount).toBe(1)
    source.close();target.close()
  })
  it.each(['duplicate-question','duplicate-paper','missing-paper','duplicate-attempt','invalid-position','score-outside-range','missing-submission','broken-practice','contradictory-wrong-count'] as const)('rejects %s and preserves all current records and media',failure=>{
    const source=populated(),target=populated(),backup=serialized(source),before=serialized(target)
    const finished=backup.exams!.find(session=>session.attempt.status==='已交卷')!
    if(failure==='duplicate-question')backup.questions.push(backup.questions[0])
    if(failure==='duplicate-paper')backup.papers.push(backup.papers[0])
    if(failure==='missing-paper')backup.exams![0].attempt.paperId='MISSING'
    if(failure==='duplicate-attempt')backup.exams!.push(backup.exams![0])
    if(failure==='invalid-position')finished.answers[0].position=99
    if(failure==='score-outside-range')finished.answers[0].score=11
    if(failure==='missing-submission')delete finished.attempt.submittedAt
    if(failure==='broken-practice')backup.practiceRecords![0].questionId='MISSING'
    if(failure==='contradictory-wrong-count')backup.wrongRecords![0].mastered=true
    expect(()=>restoreBackup(target,backup)).toThrow('学习记录无效')
    expect(target.listExamSessions()).toEqual(before.exams!.map(session=>({...session,paper:target.listPapers()[0]})))
    expect(target.listPracticeRecords()).toEqual(before.practiceRecords)
    expect(target.listWrongQuestionRecords()).toEqual(before.wrongRecords)
    expect(readFileSync(join(target.imagePath,'owned.png'),'utf8')).toBe('png')
    source.close();target.close()
  })
})
