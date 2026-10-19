import type { QuestionAttachment } from '../electron/types'
interface StoredMedia {id:string;blob:Blob;name:string;assetType:'image'|'audio'}
async function transaction<T>(mode: IDBTransactionMode, action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('musicbank-media',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'id'})
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
  })
  try { return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('assets',mode),request=action(tx.objectStore('assets'))
    tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  }) } finally { db.close() }
}
export async function importMedia(file:File,assetType:'image'|'audio'):Promise<QuestionAttachment> {
  const type=assetType==='audio' ? (/\.wav$/i.test(file.name)?'audio/wav':'audio/mpeg') : file.type
  if(assetType==='audio'&&!/\.(mp3|wav)$/i.test(file.name))throw new Error('仅支持 MP3 或 WAV 音频')
  if(assetType==='image'&&!['image/png','image/jpeg','image/webp'].includes(type))throw new Error('仅支持 JPG、PNG 或 WEBP 图片')
  if(!file.size||file.size>(assetType==='audio'?30:15)*1024*1024)throw new Error(assetType==='audio'?'音频应为 0–30MB':'图片应为 0–15MB')
  if(window.musicBank){const record=await window.musicBank.assets.import({assetType,name:file.name,mimeType:type,bytes:await file.arrayBuffer()});return {id:record.id,assetType,name:file.name}}
  const id=crypto.randomUUID()
  await transaction('readwrite',s=>s.add({id,blob:new Blob([file],{type}),name:file.name,assetType} satisfies StoredMedia))
  return {id,assetType,name:file.name}
}
export async function mediaBlob(id:string):Promise<Blob> {
  const record=await transaction('readonly',s=>s.get(id)) as StoredMedia|undefined
  if(!record)throw new Error('素材文件缺失，请在编辑题目时重新插入')
  return record.blob
}
export async function mediaUrl(id:string):Promise<string> {
  if(window.musicBank)return window.musicBank.assets.url(id)
  return URL.createObjectURL(await mediaBlob(id))
}
export async function resolveMediaImage(id:string) {
  const blob=await mediaBlob(id),url=URL.createObjectURL(blob)
  try {
    const image=new Image();image.src=url;await image.decode()
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
    const context=canvas.getContext('2d');if(!context)throw new Error('无法生成图片')
    context.drawImage(image,0,0)
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片转换失败')),'image/png'))
    return {bytes:new Uint8Array(await png.arrayBuffer()),width:canvas.width,height:canvas.height}
  } finally {URL.revokeObjectURL(url)}
}
