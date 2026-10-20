import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {afterEach,describe,it,expect} from 'vitest'
import {MusicBankDatabase} from '../electron/db'
import type {PaperRecord,ExamAttemptRecord,ExamAnswerRecord} from '../electron/types'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'musicbank-exams-'));roots.push(root)
  const db=new MusicBankDatabase(root)
  const question={id:'q',title:'简述旋律',grade:'六年级',category:'音乐要素',type:'简答题' as const,status:'已发布' as const,hasAudio:false,hasImage:false,updated:'刚刚',difficulty:'基础',referenceAnswer:'参考内容'}
  const paper:PaperRecord={id:'p',name:'音乐测试',grade:'六年级',totalScore:10,durationMinutes:10,seed:'2026-秋-A',templateId:'template-1',templateSummary:{sectionOrder:['简答题'],mode:'sections',pageWidth:210,pageHeight:297,warnings:[]},examInfo:{school:'实验小学',schoolYear:'2026—2027学年',term:'第一学期',subject:'音乐',examDate:'2026-10-20',instructions:'请独立完成作答。'},items:[{position:1,questionId:'q',score:10,snapshot:question}]}
  db.savePaper(paper)
  const attempt:ExamAttemptRecord={id:'a',paperId:'p',status:'进行中',startedAt:'2026-10-20T00:00:00Z',remainingSeconds:600}
  db.saveExamAttempt(attempt)
  return {root,db,paper,attempt}
}
describe('recoverable exam sessions',()=>{
  it('recovers the exact answer, remaining time and paper after restart',()=>{
    const {root,db,attempt,paper}=fixture()
    db.saveExamAnswer({attemptId:'a',position:1,answer:'旋律由音高组织',reviewStatus:'待批阅'})
    expect(()=>db.saveExamAttempt({...attempt,paperId:'other'})).toThrow('身份')
    db.saveExamAttempt({...attempt,remainingSeconds:483});db.close()
    const reopened=new MusicBankDatabase(root)
    const [session]=reopened.listExamSessions()
    expect(session.attempt.remainingSeconds).toBe(483)
    expect(session.answers[0].answer).toBe('旋律由音高组织')
    expect(session.paper.items[0].snapshot.referenceAnswer).toBe('参考内容')
    expect(session.paper).toEqual(paper)
    reopened.close()
  })
  it('rolls back incomplete submission and saves a complete answer sheet atomically',()=>{
    const {db,attempt}=fixture()
    expect(()=>db.finishExam(attempt,[])).toThrow('答卷不完整')
    expect(db.listExamSessions()[0].attempt.status).toBe('进行中')
    const answers:ExamAnswerRecord[]=[{attemptId:'a',position:1,answer:'回答',reviewStatus:'待批阅'}]
    db.finishExam({...attempt,remainingSeconds:400},answers)
    const session=db.listExamSessions()[0]
    expect(session.attempt.status).toBe('已交卷');expect(session.attempt.submittedAt).toBeTruthy()
    expect(session.answers[0].answer).toBe('回答')
    expect(()=>db.saveExamAttempt(attempt)).toThrow('不可重新开始')
    expect(()=>db.saveExamAnswer({...answers[0],answer:'篡改'})).toThrow('不可作答')
    db.close()
  })
  it('validates manual grades and preserves the original student response',()=>{
    const {root,db,attempt}=fixture()
    expect(()=>db.reviewExamAnswer('a',1,4,'')).toThrow('已交卷')
    db.finishExam(attempt,[{attemptId:'a',position:1,answer:'原始回答',reviewStatus:'待批阅'}])
    for(const score of [-1,11,NaN,Infinity])expect(()=>db.reviewExamAnswer('a',1,score,'')).toThrow('分数')
    db.reviewExamAnswer('a',1,7.5,'说明清晰');db.close()
    const reopened=new MusicBankDatabase(root)
    expect(reopened.listExamSessions()[0].answers[0]).toMatchObject({answer:'原始回答',score:7.5,reviewStatus:'已评分',comment:'说明清晰'})
    reopened.close()
  })
  it('protects the paper used by an existing attempt from silent replacement',()=>{
    const {db,paper}=fixture()
    expect(()=>db.savePaper({...paper,name:'覆盖原始试卷'})).toThrow('另存为新试卷')
    expect(()=>db.savePaper(paper)).not.toThrow()
    expect(db.listExamSessions()[0].paper.name).toBe('音乐测试');db.close()
  })
})
