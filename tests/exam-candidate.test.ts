import {afterEach,describe,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MusicBankDatabase} from '../electron/db'
import {createBackup} from '../electron/create-backup'
import {restoreBackup} from '../electron/restore-backup'
import {candidateName} from '../electron/exam-identity'
import {saveExamProgress,saveExamResponse,finishExam,listExamSessions} from '../src/exam-store'
import type {ExamAttemptRecord,PaperRecord} from '../electron/types'
const roots:string[]=[]
afterEach(()=>{vi.unstubAllGlobals();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function database(){const root=mkdtempSync(join(tmpdir(),'musicbank-candidate-'));roots.push(root);return {root,db:new MusicBankDatabase(root)}}
const paper:PaperRecord={id:'paper',name:'姓名测试',grade:'三年级',totalScore:10,durationMinutes:10,items:[{position:1,questionId:'q',score:10,snapshot:{id:'q',title:'四分音符占几拍？',grade:'三年级',category:'音乐要素',type:'简答题',status:'已发布',hasAudio:false,hasImage:false,updated:'刚刚',difficulty:'基础',referenceAnswer:'一拍'}}]}
function attempt(name?:string):ExamAttemptRecord{return {id:'attempt',paperId:paper.id,status:'进行中',startedAt:'2026-10-20T01:00:00Z',remainingSeconds:600,candidateName:name}}
describe('optional exam candidate identity',()=>{
 it('allows anonymous exams and validates a trimmed, bounded single-line name',()=>{
  expect(candidateName(undefined)).toBeUndefined();expect(candidateName('   ')).toBeUndefined()
  expect(candidateName('  小明  ')).toBe('小明')
  for(const value of ['名'.repeat(61),'小明\n小红',3])expect(()=>candidateName(value)).toThrow('姓名')
 })
 it('preserves names across progress updates, restart, submission and backup restore',()=>{
  const source=database(),target=database();source.db.savePaper(paper)
  source.db.saveExamAttempt(attempt('  小明  '));source.db.saveExamAttempt({...attempt('小明'),remainingSeconds:520})
  expect(()=>source.db.saveExamAttempt(attempt('小红'))).toThrow('身份')
  source.db.close();const reopened=new MusicBankDatabase(source.root)
  expect(reopened.listExamSessions()[0].attempt).toMatchObject({candidateName:'小明',remainingSeconds:520})
  reopened.finishExam({...attempt('小明'),remainingSeconds:510},[{attemptId:'attempt',position:1,answer:'一拍',reviewStatus:'待批阅'}])
  restoreBackup(target.db,JSON.parse(JSON.stringify(createBackup(reopened))))
  expect(target.db.listExamSessions()[0].attempt).toMatchObject({candidateName:'小明',status:'已交卷'})
  reopened.close();target.db.close()
 })
 it('keeps anonymous legacy sessions compatible and rejects malformed names before restore',()=>{
  const source=database(),target=database();source.db.savePaper(paper);source.db.saveExamAttempt(attempt())
  const backup=JSON.parse(JSON.stringify(createBackup(source.db)));delete backup.exams[0].attempt.candidateName
  restoreBackup(target.db,backup)
  expect(target.db.listExamSessions()[0].attempt.candidateName).toBeUndefined()
  backup.exams[0].attempt.candidateName='x'.repeat(61)
  expect(()=>restoreBackup(target.db,backup)).toThrow('姓名')
  expect(target.db.listExamSessions()[0].attempt.candidateName).toBeUndefined()
  source.db.close();target.db.close()
 })
 it('keeps browser sessions bound to the original candidate through submission',async()=>{
  const values=new Map<string,string>();vi.stubGlobal('window',{});vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)})
  await saveExamProgress(attempt(' 小明 '),paper)
  await expect(saveExamProgress(attempt('小红'),paper)).rejects.toThrow('身份')
  await finishExam({...attempt('小红'),status:'已交卷',submittedAt:'2026-10-20T01:05:00Z'},[])
  expect((await listExamSessions())[0].attempt).toMatchObject({candidateName:'小明',status:'已交卷'})
 })
 it('preserves full paper metadata through browser progress, resume and submission',async()=>{
  const values=new Map<string,string>();vi.stubGlobal('window',{});vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)})
  const original:PaperRecord={...paper,seed:'2026-秋-A',templateId:'original-template',templateSummary:{sectionOrder:['简答题'],mode:'sections',pageWidth:210,pageHeight:297,warnings:[]},examInfo:{school:'实验小学',schoolYear:'2026—2027学年',term:'第一学期',subject:'音乐',examDate:'2026-10-20',instructions:'独立作答'}}
  await saveExamProgress(attempt(),original)
  await saveExamResponse({attemptId:'attempt',position:1,answer:'一拍'})
  const [resumed]=await listExamSessions()
  expect(resumed.paper).toEqual(original)
  resumed.paper.examInfo!.school='被其他页面修改'
  await saveExamProgress({...attempt(),remainingSeconds:500},resumed.paper)
  await finishExam({...attempt(),submittedAt:'2026-10-20T01:05:00Z'},[{attemptId:'attempt',position:1,answer:'一拍',reviewStatus:'待批阅'}])
  expect((await listExamSessions())[0].paper).toEqual(original)
 })
})
