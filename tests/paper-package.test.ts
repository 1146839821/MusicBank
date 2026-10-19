import { it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildPaperPackage } from '../electron/paper-package'
import type { PaperRecord, AssetRecord } from '../electron/types'

const documents={paperWord:new Uint8Array([1]),answersWord:new Uint8Array([2]),paperPdf:new Uint8Array([3]),answersPdf:new Uint8Array([4])}
const paper:PaperRecord={id:'offline',name:'听辨试卷',grade:'六年级',totalScore:4,durationMinutes:40,items:[1,2].map(position=>({position,questionId:`q${position}`,score:2,snapshot:{id:`q${position}`,title:'听辨',type:'选择题',grade:'六年级',category:'音乐要素',difficulty:'基础',status:'已发布',updated:'刚刚',hasImage:false,hasAudio:true,attachments:[{id:'shared',assetType:'audio',name:`片段${position}`} ]}}))}
const record:AssetRecord={id:'shared',assetType:'audio',originalName:'原始录音.WAV',storedName:'owned.wav',mimeType:'audio/wav',fileSize:3}
it('includes four documents and original audio once with every question reference',async()=>{
  let reads=0
  const zip=await JSZip.loadAsync(await buildPaperPackage(paper,documents,async()=>{reads++;return {record,bytes:new Uint8Array([8,9,10])}}))
  for(const name of ['试题.docx','参考答案.docx','试题.pdf','参考答案.pdf','使用说明.txt'])expect(zip.file(name)).not.toBeNull()
  expect(reads).toBe(1)
  expect(await zip.file('audio/music_001.wav')!.async('uint8array')).toEqual(new Uint8Array([8,9,10]))
  const manifest=JSON.parse(await zip.file('音频清单.json')!.async('string'))
  expect(manifest.audio.map((item:{audioNumber:string})=>item.audioNumber)).toEqual(['1-1','2-1'])
  expect(new Set(manifest.audio.map((item:{file:string})=>item.file)).size).toBe(1)
})
it('fails export rather than silently omitting missing or truncated audio',async()=>{
  await expect(buildPaperPackage(paper,documents,async()=>{throw new Error('文件缺失')})).rejects.toThrow('文件缺失')
  await expect(buildPaperPackage(paper,documents,async()=>({record,bytes:new Uint8Array([1])}))).rejects.toThrow('音频文件无效')
  const missing={...paper,items:paper.items.map(item=>({...item,snapshot:{...item.snapshot,attachments:[]}}))}
  await expect(buildPaperPackage(missing,documents,async()=>({record,bytes:new Uint8Array(3)}))).rejects.toThrow('缺少音频')
})
