import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {finishExam,listExamSessions,saveExamProgress,saveExamResponse} from '../src/exam-store'
import {matchingAnswer} from '../electron/matching'
import type {ExamAttemptRecord,MatchingData,PaperRecord} from '../electron/types'
const matching:MatchingData={version:1,scoring:'per-pair',sources:[0,1,2,3].map(order=>({id:`s${order}`,order,contentType:'text',text:`乐器${order}`})),targets:[0,1,2,3].map(order=>({id:`t${order}`,order,contentType:'text',text:`名称${order}`})),pairs:[0,1,2,3].map(n=>({sourceId:`s${n}`,targetId:`t${n}`})),targetOrder:['t3','t1','t0','t2']}
const paper:PaperRecord={id:'paper',name:'连线交卷',grade:'三年级',totalScore:4,durationMinutes:10,items:[{position:1,questionId:'q',score:4,snapshot:{id:'q',title:'连接乐器',grade:'三年级',category:'乐器',type:'连线题',status:'已发布',hasImage:false,hasAudio:false,updated:'刚刚',difficulty:'基础',matching}}]}
const attempt:ExamAttemptRecord={id:'attempt',paperId:'paper',status:'进行中',startedAt:'2026-10-21T00:00:00Z',remainingSeconds:600}
const response=(answer='')=>({attemptId:attempt.id,position:1,answer})
beforeEach(async()=>{const values=new Map<string,string>();vi.stubGlobal('window',{});vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});await saveExamProgress(attempt,paper)})
afterEach(()=>vi.unstubAllGlobals())
describe('browser exam submission integrity',()=>{
 it('rejects missing, duplicate, foreign-attempt and invalid-position records without ending the exam',async()=>{
  for(const answers of [[],[response(),response()],[{...response(),attemptId:'other'}],[{...response(),position:2}]]){
   await expect(finishExam(attempt,answers)).rejects.toThrow('答卷不完整')
   expect((await listExamSessions())[0].attempt.status).toBe('进行中')
  }
  await saveExamResponse(response(matchingAnswer(matching.pairs.slice(0,1))))
  expect((await listExamSessions())[0].answers).toHaveLength(1)
 })
 it('rejects malformed matching answers atomically and preserves saved progress',async()=>{
  const progress=response(matchingAnswer(matching.pairs.slice(0,1)))
  await saveExamResponse(progress)
  for(const answer of ['{bad','null',matchingAnswer([matching.pairs[0],matching.pairs[0]]),matchingAnswer([{sourceId:'unknown',targetId:'t0'}])]){
   await expect(finishExam(attempt,[response(answer)])).rejects.toThrow('连线答案')
   const [session]=await listExamSessions()
   expect(session.attempt.status).toBe('进行中')
   expect(session.answers).toEqual([progress])
  }
 })
 it('accepts a valid incomplete answer and recomputes partial credit despite supplied score',async()=>{
  await finishExam(attempt,[{...response(matchingAnswer(matching.pairs.slice(0,2))),score:4}])
  const [session]=await listExamSessions()
  expect(session.attempt.status).toBe('已交卷')
  expect(session.answers[0]).toMatchObject({score:2,reviewStatus:'已评分'})
  expect(session.paper.items[0].snapshot.matching?.targetOrder).toEqual(matching.targetOrder)
  await expect(saveExamResponse(response())).rejects.toThrow('不可作答')
 })
 it('accepts an empty answer as an unanswered question with zero points',async()=>{
  await finishExam(attempt,[response()])
  expect((await listExamSessions())[0].answers[0].score).toBe(0)
 })
})
