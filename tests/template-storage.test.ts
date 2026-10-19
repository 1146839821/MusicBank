import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { MusicBankDatabase } from '../electron/db'
import type { QuestionRecord, PaperTemplateRecord, BackupPayload } from '../electron/types'
const roots:string[]=[]
afterEach(()=>roots.splice(0).forEach(root=>rmSync(root,{force:true,recursive:true})))
function fresh(){const root=mkdtempSync(join(tmpdir(),'musicbank-templates-test-'));roots.push(root);return {root,db:new MusicBankDatabase(root)}}
const q:QuestionRecord={id:'q',title:'判断试题',type:'选择题',grade:'六年级',category:'音乐记号',difficulty:'基础',status:'已发布',hasAudio:false,hasImage:false,updated:'刚刚',correctAnswer:'A',options:['甲','乙']}
const record:PaperTemplateRecord={id:'t',name:'模板.docx',fileSize:3,importedAt:new Date().toISOString(),summary:{sectionOrder:['判断题'],mode:'sections',pageWidth:210,pageHeight:297,warnings:[]}}
describe('template persistence and judgment migration',()=>{
  it('upgrades the old check constraint without losing references, practice or question data',()=>{
    const {root,db}=fresh();db.saveQuestion(q);db.upsertWrongQuestion(q.id);db.savePracticeRecord({questionId:q.id,answer:'A',result:'correct'});const path=db.databasePath;db.close()
    const raw=new Database(path);raw.pragma('foreign_keys=OFF');const schema=(raw.prepare("SELECT sql FROM sqlite_master WHERE name='questions'").get() as {sql:string}).sql
    raw.exec(schema.replace('CREATE TABLE questions','CREATE TABLE questions_legacy').replace("'选择题','填空题','判断题','简答题'","'选择题','填空题','简答题'"));raw.exec('INSERT INTO questions_legacy SELECT * FROM questions; DROP TABLE questions; ALTER TABLE questions_legacy RENAME TO questions;');raw.close()
    const migrated=new MusicBankDatabase(root);expect(migrated.listQuestions()).toHaveLength(1);expect(migrated.listWrongQuestionIds()).toEqual(['q']);migrated.saveQuestion({...q,id:'judge',type:'判断题',correctAnswer:'false'});expect(migrated.listQuestions().find(q=>q.id==='judge')?.correctAnswer).toBe('false');migrated.close()
    const check=new Database(path);expect(check.pragma('foreign_key_check')).toEqual([]);expect((check.prepare('SELECT count(*) AS count FROM practice_records').get() as {count:number}).count).toBe(1);check.close()
  })
  it('archives templates without breaking saved papers and persists their page metadata',()=>{
    const {root,db}=fresh();db.saveTemplate(record,new Uint8Array([1,2,3]));db.savePaper({id:'paper',name:'考试',grade:'六年级',totalScore:2,durationMinutes:40,templateId:'t',templateSummary:record.summary,examInfo:{school:'实验小学',schoolYear:'2026',term:'第一学期',subject:'音乐',examDate:'',instructions:''},items:[{position:1,score:2,questionId:q.id,snapshot:q}]});db.archiveTemplate('t');expect(db.listTemplates()).toEqual([]);expect(db.templateBytes('t')).toEqual(Buffer.from([1,2,3]));db.close()
    const reopened=new MusicBankDatabase(root);expect(reopened.listTemplates(true)[0].archived).toBe(true);expect(reopened.listPapers()[0].templateSummary).toEqual(record.summary);expect(reopened.listPapers()[0].examInfo?.school).toBe('实验小学');reopened.close()
  })
  it('includes template bytes in restore transactions and remains compatible with old backups',()=>{
    const {db}=fresh(),payload:BackupPayload={format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questions:[],papers:[],wrongQuestionIds:[],assets:[],templates:[{record,bytesBase64:'AQID'}]}
    db.restoreBackupRecords(payload);expect(db.templateBytes('t')).toEqual(Buffer.from([1,2,3]));expect(()=>db.restoreBackupRecords({...payload,templates:[{record:{...record,fileSize:99},bytesBase64:'AQID'}]})).toThrow();expect(db.listTemplates()).toHaveLength(1)
    db.restoreBackupRecords({...payload,templates:undefined});expect(db.listTemplates(true)).toHaveLength(0);db.close()
  })
  it('round trips multi-paragraph question emphasis through database backup restoration',()=>{
    const {db}=fresh(),titleRuns=[{text:'判断\n\n',bold:true},{text:'试题',italic:true}]
    db.saveQuestion({...q,title:'判断\n\n试题',titleRuns})
    const questions=JSON.parse(JSON.stringify(db.listQuestions()))
    db.restoreBackupRecords({format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questions,papers:[],wrongQuestionIds:[],assets:[]})
    expect(db.listQuestions()[0].titleRuns).toEqual(titleRuns)
    expect(db.listQuestions()[0].title).toBe('判断\n\n试题')
    db.close()
  })
  it('rejects ambiguous judgment answer values',()=>{const {db}=fresh();for(const correctAnswer of ['',undefined,'0','错误'])expect(()=>db.saveQuestion({...q,type:'判断题',correctAnswer})).toThrow();db.close()})
})
