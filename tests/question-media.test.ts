import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MusicBankDatabase } from '../electron/db'
import { questionAttachments } from '../electron/question-assets'
import { assetResponse } from '../electron/asset-response'
import { restoreBackup } from '../electron/restore-backup'
import type { QuestionRecord, AssetRecord, BackupPayload } from '../electron/types'
const question:QuestionRecord={id:'media-question',title:'根据图片和音频作答',type:'选择题',grade:'六年级',category:'音乐要素',difficulty:'基础',status:'已发布',hasAudio:true,hasImage:true,updated:'刚刚',options:['甲','乙'],correctAnswer:'A'}
function asset(id:string,type:'audio'|'image'):AssetRecord{return {id,assetType:type,originalName:`${id}.${type==='audio'?'wav':'png'}`,storedName:`${id}.${type==='audio'?'wav':'png'}`,mimeType:type==='audio'?'audio/wav':'image/png',fileSize:6}}
describe('owned multi-file question media',()=>{
  it('keeps legacy attachments readable and respects explicit removal of every file',()=>{
    const legacy={...question,audioAssetId:'audio',audioName:'音乐.wav',imageAssetId:'image'}
    expect(questionAttachments(legacy).map(item=>item.id)).toEqual(['image','audio'])
    expect(questionAttachments({...legacy,attachments:[]})).toEqual([])
  })
  it('persists all files and ordering after reopening, snapshotting and backup restoration',()=>{
    const root=mkdtempSync(join(tmpdir(),'musicbank-multi-'));let db=new MusicBankDatabase(root)
    try{
      const records=[asset('image-1','image'),asset('audio-1','audio'),asset('image-2','image'),asset('audio-2','audio')]
      for(const record of records){db.saveAsset(record);writeFileSync(join(record.assetType==='audio'?db.audioPath:db.imagePath,record.storedName),Buffer.from('abcdef'))}
      const attachments=records.map(record=>({id:record.id,assetType:record.assetType,name:record.originalName}))
      db.saveQuestion({...question,attachments})
      db.savePaper({id:'paper',name:'试卷',grade:'六年级',totalScore:2,durationMinutes:40,items:[{position:1,questionId:question.id,score:2,snapshot:db.listQuestions()[0]}]})
      db.close();db=new MusicBankDatabase(root)
      expect(db.listQuestions()[0].attachments).toEqual(attachments)
      expect(db.listPapers()[0].items[0].snapshot.attachments).toEqual(attachments)
      const payload:BackupPayload={format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questions:db.listQuestions(),papers:db.listPapers(),wrongQuestionIds:[],assets:records.map(record=>({record,bytesBase64:Buffer.from('abcdef').toString('base64')}))}
      restoreBackup(db,payload)
      expect(db.listQuestions()[0].attachments).toEqual(attachments)
      for(const record of records)expect(readFileSync(join(record.assetType==='audio'?db.audioPath:db.imagePath,record.storedName)).toString()).toBe('abcdef')
      db.saveQuestion({...question,attachments:attachments.filter(item=>item.id!=='image-1')})
      expect(db.listQuestions()[0].attachments).toHaveLength(3)
      expect(db.listPapers()[0].items[0].snapshot.attachments).toHaveLength(4)
    }finally{db.close();rmSync(root,{recursive:true,force:true})}
  })
  it('protects snapshot assets after removing the original question and migrates older papers',()=>{
    const root=mkdtempSync(join(tmpdir(),'musicbank-paper-media-'))
    let db=new MusicBankDatabase(root)
    try{
      db.saveAsset(asset('image','image'))
      const snapshot={...question,attachments:[{id:'image',assetType:'image' as const,name:'乐谱.png'}]}
      db.saveQuestion(snapshot)
      const paper={id:'protected',name:'固定试卷',grade:'六年级',totalScore:2,durationMinutes:40,items:[{position:1,questionId:question.id,score:2,snapshot}]}
      db.savePaper(paper)
      db.deleteQuestion(question.id)
      const raw=new Database(db.databasePath)
      raw.pragma('foreign_keys = ON')
      expect(()=>raw.prepare('DELETE FROM assets WHERE id=?').run('image')).toThrow()
      raw.prepare('DELETE FROM paper_asset_refs').run()
      raw.prepare('DELETE FROM system_settings WHERE key=?').run('migration.paper-asset-references.v1')
      raw.close();db.close();db=new MusicBankDatabase(root)
      const migrated=new Database(db.databasePath)
      try{expect(migrated.prepare('SELECT asset_id FROM paper_asset_refs WHERE paper_id=?').all('protected')).toEqual([{asset_id:'image'}])}finally{migrated.close()}
      expect(()=>db.savePaper({...paper,items:[{...paper.items[0],snapshot:{...snapshot,attachments:[{id:'missing',assetType:'audio',name:'缺失.wav'}]}}]})).toThrow()
      expect(db.listPapers()[0].items[0].snapshot.attachments).toEqual(snapshot.attachments)
      db.savePaper({...paper,items:[{...paper.items[0],snapshot:{...snapshot,attachments:[]}}]})
      const updated=new Database(db.databasePath)
      try{expect(updated.prepare('SELECT COUNT(*) AS count FROM paper_asset_refs').get()).toEqual({count:0})}finally{updated.close()}
    }finally{db.close();rmSync(root,{recursive:true,force:true})}
  })
  it('serves image MIME, playable audio ranges, seek suffixes and missing-file errors',async()=>{
    const root=mkdtempSync(join(tmpdir(),'musicbank-range-')),record=asset('audio','audio')
    try{
      writeFileSync(join(root,record.storedName),'abcdef')
      const request=(range?:string)=>new Request('musicbank-asset://audio/',{headers:range?{Range:range}:{}})
      const full=assetResponse(request(),record,root);expect(full.headers.get('content-type')).toBe('audio/wav');expect(await full.text()).toBe('abcdef')
      const partial=assetResponse(request('bytes=2-4'),record,root);expect(partial.status).toBe(206);expect(partial.headers.get('content-range')).toBe('bytes 2-4/6');expect(await partial.text()).toBe('cde')
      expect(await assetResponse(request('bytes=-2'),record,root).text()).toBe('ef')
      expect(assetResponse(request('bytes=99-'),record,root).status).toBe(416)
      expect(assetResponse(request('bytes=-0'),record,root).status).toBe(416)
      expect(assetResponse(request(),undefined,root).status).toBe(404)
      expect(assetResponse(request(),{...record,storedName:'missing.wav'},root).status).toBe(404)
      expect(assetResponse(request(),{...record,mimeType:'image/png'},root).headers.get('content-type')).toBe('image/png')
    }finally{rmSync(root,{recursive:true,force:true})}
  })
})
