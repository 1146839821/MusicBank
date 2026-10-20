import {afterEach,describe,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {normalizeChoice,choiceOptions,choiceAnswerLetters} from '../electron/choice-options'
import {MusicBankDatabase} from '../electron/db'
import {createBackup} from '../electron/create-backup'
import {restoreBackup} from '../electron/restore-backup'
import type {QuestionRecord} from '../electron/types'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function database(){const root=mkdtempSync(join(tmpdir(),'musicbank-choice-'));roots.push(root);return {root,db:new MusicBankDatabase(root)}}
function question():QuestionRecord{return {id:'CHOICE',title:'选出正确的乐器',grade:'三年级',category:'音乐要素',type:'选择题',status:'已发布',hasAudio:false,hasImage:false,updated:'刚刚',difficulty:'基础',options:['笛','箫','笙','管','二胡','琵琶','古筝','古琴'],optionIds:['flute','xiao','sheng','guan','erhu','pipa','guzheng','guqin'],correctOptionIds:['guzheng','guqin'],correctAnswer:'G,H',answerMode:'multiple'}}
describe('stable choice option identities',()=>{
 it('keeps the same correct contents when preceding options are removed or reordered',()=>{
  const q=question(),options=choiceOptions(q).filter(option=>option.id!=='flute').reverse()
  const edited=normalizeChoice({...q,options:options.map(option=>option.text),optionIds:options.map(option=>option.id)})
  expect(edited.correctAnswer).toBe('A,B')
  expect(edited.correctOptionIds).toEqual(['guzheng','guqin'])
  expect(choiceAnswerLetters(options,edited.correctOptionIds!)).toEqual(['A','B'])
 })
 it('migrates legacy letter answers to stable identifiers',()=>{
  const q=question();delete q.optionIds;delete q.correctOptionIds
  const migrated=normalizeChoice(q)
  expect(migrated.correctOptionIds).toEqual(['legacy-6','legacy-7'])
  expect(normalizeChoice(migrated)).toEqual(migrated)
 })
 it('does not silently select another answer after the correct option is deleted',()=>{
  const q=question(),options=choiceOptions(q).filter(option=>!q.correctOptionIds!.includes(option.id))
  const edited=normalizeChoice({...q,options:options.map(option=>option.text),optionIds:options.map(option=>option.id),correctOptionIds:[]})
  expect(edited.correctAnswer).toBe('')
 })
 it('rejects duplicate or missing identifiers, dangling answers and more than eight choices',()=>{
  const q=question()
  expect(()=>normalizeChoice({...q,optionIds:['duplicate','duplicate']})).toThrow('编号')
  expect(()=>normalizeChoice({...q,correctOptionIds:['missing']})).toThrow('不存在')
  expect(()=>normalizeChoice({...q,options:[...q.options!,'第九项']})).toThrow('8')
 })
 it('retains H answers and identities across SQLite restarts, snapshots and backup restoration',()=>{
  const source=database(),target=database(),q=question()
  source.db.saveQuestion(q)
  source.db.savePaper({id:'paper',name:'八选项试卷',grade:q.grade,totalScore:10,durationMinutes:10,items:[{position:1,questionId:q.id,score:10,snapshot:q}]})
  source.db.close()
  const reopened=new MusicBankDatabase(source.root)
  expect(reopened.listQuestions()[0]).toMatchObject({optionIds:q.optionIds,correctOptionIds:q.correctOptionIds,correctAnswer:'G,H'})
  const changed={...q,options:q.options!.slice(1),optionIds:q.optionIds!.slice(1)}
  reopened.saveQuestion(changed)
  expect(reopened.listQuestions()[0].correctAnswer).toBe('F,G')
  expect(reopened.listPapers()[0].items[0].snapshot.correctAnswer).toBe('G,H')
  restoreBackup(target.db,JSON.parse(JSON.stringify(createBackup(reopened))))
  expect(target.db.listQuestions()[0]).toMatchObject({correctOptionIds:q.correctOptionIds,correctAnswer:'F,G'})
  expect(target.db.listPapers()[0].items[0].snapshot.correctAnswer).toBe('G,H')
  reopened.close();target.db.close()
 })
})
