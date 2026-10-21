import {afterEach,describe,it,expect} from 'vitest'
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import Database from 'better-sqlite3'
import {createHash} from 'node:crypto'
import {createBackup} from '../electron/create-backup'
import {restoreBackup} from '../electron/restore-backup'
import JSZip from 'jszip'
import {MusicBankDatabase} from '../electron/db'
import {matchingAnswer,shuffleMatching,matchingReference} from '../electron/matching'
import {generatePaperPlan} from '../electron/paper-plan'
import {buildPaperDocument,inspectTemplate} from '../electron/paper-documents'
import {questionAssets} from '../electron/question-assets'
import {copyQuestion} from '../src/question-copy'
import type {QuestionRecord,PaperRecord,MatchingData,BackupPayload} from '../electron/types'
const roots:string[]=[]
afterEach(()=>roots.splice(0).forEach(root=>rmSync(root,{force:true,recursive:true})))
function fresh(){const root=mkdtempSync(join(tmpdir(),'musicbank-matching-'));roots.push(root);return {root,db:new MusicBankDatabase(root)}}
function matching():MatchingData{return {version:1,scoring:'per-pair',sources:['二胡','琵琶','竹笛','小提琴'].map((_,order)=>({id:`s${order}`,order,contentType:'image',assetId:`image-${order}`,text:''})),targets:['二胡','琵琶','竹笛','小提琴'].map((text,order)=>({id:`t${order}`,order,contentType:'text',text})),pairs:[0,1,2,3].map(n=>({sourceId:`s${n}`,targetId:`t${n}`}))}}
function question():QuestionRecord{return {id:'MUS-000999',title:'请将乐器图片与名称连线。',grade:'三年级',category:'乐器',type:'连线题',status:'已发布',hasImage:true,hasAudio:false,updated:'刚刚',difficulty:'基础',matching:matching(),attachments:[],imageGrids:[{id:'grid',kind:'image-grid',afterParagraph:1,columns:4,imageHeight:160,fit:'cover',gap:12,align:'center',items:[{id:'cell',assetId:'image-0',caption:'观察图片'}]}]}}
function assets(db:MusicBankDatabase){for(let i=0;i<4;i++)db.saveAsset({id:`image-${i}`,assetType:'image',originalName:`${i}.png`,storedName:`image-${i}.png`,mimeType:'image/png',fileSize:3})}
function paper(q=question()):PaperRecord{return {id:'paper',name:'连线考试',grade:'三年级',totalScore:4,durationMinutes:40,items:[{position:1,questionId:q.id,score:4,snapshot:JSON.parse(JSON.stringify(q))}]}}
describe('matching persistence, snapshots and native Word layout',()=>{
 it('roundtrips matching and grids, copies independently and retains all image references',()=>{const {root,db}=fresh();assets(db);const q=question();db.saveQuestion(q);db.close();const reopened=new MusicBankDatabase(root),restored=reopened.listQuestions()[0];expect(restored.matching).toEqual(q.matching);expect(restored.imageGrids).toEqual(q.imageGrids);const copy=copyQuestion(restored,'copy');copy.matching!.targets[0].text='修改';expect(restored.matching!.targets[0].text).toBe('二胡');expect(questionAssets(restored)).toHaveLength(4);reopened.close()})
 it('preserves snapshots, shuffled order and asset protection after changing/deleting original',()=>{const {db}=fresh();assets(db);const q=question();q.matching=shuffleMatching(q.matching!,()=>0);db.saveQuestion(q);db.savePaper(paper(q));db.saveQuestion({...q,title:'修改后的原题',matching:matching()});db.deleteQuestion(q.id);expect(db.listPapers()[0].items[0].snapshot).toEqual(q);const raw=new Database(db.databasePath);expect(raw.prepare('SELECT * FROM paper_asset_refs').all()).toHaveLength(4);expect(()=>raw.prepare("DELETE FROM assets WHERE id='image-0'").run()).toThrow();expect(raw.pragma('foreign_key_check')).toEqual([]);raw.close();db.close()})
 it('performs a forward CHECK migration retaining old questions and learning history',()=>{const {root,db}=fresh();db.saveQuestion({...question(),type:'判断题',matching:undefined,imageGrids:undefined,hasImage:false,correctAnswer:'true'});db.savePracticeRecord({questionId:'MUS-000999',answer:'true',result:'correct'});db.upsertWrongQuestion('MUS-000999');const path=db.databasePath;db.close();const raw=new Database(path);raw.pragma('foreign_keys=OFF');const schema=(raw.prepare("SELECT sql FROM sqlite_master WHERE name='questions'").get() as {sql:string}).sql;raw.exec(schema.replace(/^CREATE TABLE\s+(?:"questions"|questions)/i,'CREATE TABLE old_questions').replace(",'连线题'",''));raw.exec('INSERT INTO old_questions SELECT * FROM questions; DROP TABLE questions; ALTER TABLE old_questions RENAME TO questions;');raw.close();const migrated=new MusicBankDatabase(root);expect(migrated.listQuestions()).toHaveLength(1);expect(migrated.listPracticeRecords()).toHaveLength(1);expect(migrated.listWrongQuestionIds()).toEqual(['MUS-000999']);assets(migrated);migrated.saveQuestion(question());migrated.close();const check=new Database(path);expect(check.pragma('integrity_check',{simple:true})).toBe('ok');expect(check.pragma('foreign_key_check')).toEqual([]);check.close()})
 it('recomputes partial credit from snapshot at the native finish boundary',()=>{const {db}=fresh();assets(db);const q=question();db.saveQuestion(q);db.savePaper(paper(q));const attempt={id:'attempt',paperId:'paper',status:'进行中' as const,startedAt:new Date().toISOString(),remainingSeconds:2400};db.saveExamAttempt(attempt);db.finishExam({...attempt,status:'已交卷'},[{attemptId:'attempt',position:1,answer:matchingAnswer(q.matching!.pairs.slice(0,2)),score:4}]);expect(db.listExamSessions()[0].answers[0].score).toBe(2);expect(db.listWrongQuestionIds()).toEqual([q.id]);db.close()})
 it('includes matching in seeded random plans even with legacy four-type templates',()=>{const q=question(),plan={name:'测试',grade:'全部年级',category:'全部分类',audioMode:'不限',duration:40,totalScore:4,seed:'same',templateId:'template',examInfo:{school:'',schoolYear:'',term:'',subject:'音乐',examDate:'',instructions:''},rules:{'选择题':{count:0,score:2},'填空题':{count:0,score:2},'判断题':{count:0,score:2},'简答题':{count:0,score:2},'连线题':{count:1,score:4}}},summary={sectionOrder:['选择题' as const],mode:'sections' as const,pageWidth:210,pageHeight:297,warnings:[]};const a=generatePaperPlan(plan,[q],summary),b=generatePaperPlan(plan,[q],summary);expect(a.items).toEqual(b.items);expect(a.items[0].snapshot.matching!.targetOrder).toHaveLength(4);a.items[0].snapshot.matching!.targets[0].text='变更';expect(q.matching!.targets[0].text).toBe('二胡')})
 it('exports structured Word tables, four source images and answer mapping without answer lines on student paper',async()=>{const bytes=new Uint8Array(readFileSync('public/templates/试卷模板.docx')),q=question();q.matching=shuffleMatching(q.matching!,()=>0);const exam=paper(q),resolve=async()=>({bytes:new Uint8Array([1,2,3]),width:400,height:300}),student=await JSZip.loadAsync(await buildPaperDocument(bytes,exam,'paper',resolve)),teacher=await JSZip.loadAsync(await buildPaperDocument(bytes,exam,'answers',resolve)),xml=await student.file('word/document.xml')!.async('string'),answer=await teacher.file('word/document.xml')!.async('string');expect(xml).toContain('<w:tbl>');expect(xml).toContain('二胡');expect(xml).toContain('请将上方项目');expect(xml).not.toContain('→');expect(xml).not.toContain('undefined');expect(answer.replace(/<[^>]+>/g,'')).toContain(matchingReference(q.matching!));expect(Object.keys(student.files).filter(name=>name.startsWith('word/media/musicbank-'))).toHaveLength(5);expect((await inspectTemplate(bytes)).sectionOrder).not.toContain('连线题')})
 it('restores new structured records and rejects invalid matching before replacing existing data',()=>{const {db}=fresh();assets(db);db.saveQuestion(question());const payload:BackupPayload={format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questions:db.listQuestions(),papers:[paper()],wrongQuestionIds:[],assets:db.listAssets().map(record=>({record,bytesBase64:'AQID'}))};db.restoreBackupRecords(payload);expect(db.listQuestions()[0].matching).toEqual(matching());const invalid=JSON.parse(JSON.stringify(payload));invalid.questions[0].matching.pairs[0].targetId='missing';expect(()=>db.restoreBackupRecords(invalid)).toThrow();expect(db.listQuestions()[0].matching).toEqual(matching());db.close()})
})


describe('historical matching media backup roundtrip',()=>{
 it('restores owned PNG/audio files and exports a snapshot after the original question was deleted',async()=>{
  const source=fresh(),target=fresh()
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
  const wav=Buffer.alloc(46)
  wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40)
  const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex')
  try{
   for(let index=0;index<4;index++){
    source.db.saveAsset({id:`image-${index}`,assetType:'image',originalName:`乐器${index}.png`,storedName:`image-${index}.png`,mimeType:'image/png',fileSize:png.length,sha256:hash(png)})
    writeFileSync(join(source.db.imagePath,`image-${index}.png`),png)
   }
   source.db.saveAsset({id:'audio',assetType:'audio',originalName:'听辨.wav',storedName:'audio.wav',mimeType:'audio/wav',fileSize:wav.length,sha256:hash(wav)})
   writeFileSync(join(source.db.audioPath,'audio.wav'),wav)
   const q=question();q.title='先听音频。\n再观察图片并连线。';q.hasAudio=true;q.attachments=[{id:'audio',assetType:'audio',name:'听辨.wav'}];q.matching=shuffleMatching(q.matching!,()=>0)
   source.db.saveQuestion(q);source.db.savePaper(paper(q))
   const attempt={id:'historical',paperId:'paper',status:'进行中' as const,startedAt:'2026-10-21T00:00:00Z',remainingSeconds:600}
   source.db.saveExamAttempt(attempt)
   source.db.finishExam(attempt,[{attemptId:attempt.id,position:1,answer:matchingAnswer(q.matching!.pairs.slice(0,2))}])
   source.db.savePracticeRecord({questionId:q.id,answer:'',result:'wrong'})
   const other:QuestionRecord={...q,id:'other',title:'保留的题目',type:'判断题',matching:undefined,imageGrids:undefined,attachments:[],hasImage:false,hasAudio:false,correctAnswer:'true'}
   source.db.saveQuestion(other)
   source.db.savePracticeRecord({questionId:other.id,answer:'',result:'wrong'})
   source.db.upsertWrongQuestion(other.id)
   source.db.deleteQuestion(q.id)
   expect(source.db.listPracticeRecords().map(record=>record.questionId)).toEqual(['other'])
   expect(source.db.listWrongQuestionIds()).toEqual(['other'])
   const payload=JSON.parse(JSON.stringify(createBackup(source.db))) as BackupPayload
   expect(payload.questions.map(item=>item.id)).toEqual(['other'])
   expect(payload.assets).toHaveLength(5)
   restoreBackup(target.db,payload)
   target.db.close()
   const reopened=new MusicBankDatabase(target.root)
   try{
    expect(reopened.listQuestions().map(item=>item.id)).toEqual(['other'])
    const [session]=reopened.listExamSessions()
    expect(session.paper.items[0].snapshot).toEqual(q)
    expect(session.answers[0]).toMatchObject({score:2,answer:matchingAnswer(q.matching!.pairs.slice(0,2))})
    expect(readFileSync(join(reopened.audioPath,'audio.wav'))).toEqual(wav)
    for(let index=0;index<4;index++)expect(readFileSync(join(reopened.imagePath,`image-${index}.png`))).toEqual(png)
    const refs=new Database(reopened.databasePath)
    try{expect(refs.prepare('SELECT * FROM paper_asset_refs').all()).toHaveLength(5);expect(()=>refs.prepare("DELETE FROM assets WHERE id='image-0'").run()).toThrow();expect(refs.pragma('foreign_key_check')).toEqual([])}finally{refs.close()}
    const template=new Uint8Array(readFileSync('public/templates/试卷模板.docx'))
    const doc=await JSZip.loadAsync(await buildPaperDocument(template,session.paper,'paper',async id=>({bytes:new Uint8Array(readFileSync(join(reopened.imagePath,`${id}.png`))),width:1,height:1})))
    const xml=await doc.file('word/document.xml')!.async('string')
    expect(xml).toContain('再观察图片并连线。')
    expect(xml).not.toContain('→')
    expect(Object.keys(doc.files).filter(name=>name.startsWith('word/media/musicbank-'))).toHaveLength(5)
   }finally{reopened.close()}
  }finally{source.db.close();target.db.close()}
 })
})
