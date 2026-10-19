import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../../electron/default-template'
import { inspectTemplate } from '../../electron/paper-documents'
import type { PaperTemplateRecord } from '../../electron/types'
interface StoredTemplate {record:PaperTemplateRecord;bytes:Uint8Array}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('musicbank-templates',1);request.onupgradeneeded=()=>request.result.createObjectStore('templates',{keyPath:'record.id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function run<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('templates',mode);const request=action(tx.objectStore('templates'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
let defaultPending: Promise<void> | undefined
async function ensureBrowserDefault() {
  if (!defaultPending) defaultPending = (async () => {
    if (await run('readonly', s => s.get(DEFAULT_TEMPLATE_ID))) return
    const response = await fetch(`${import.meta.env.BASE_URL}templates/试卷模板.docx`)
    if (!response.ok) throw new Error('默认试卷模板读取失败')
    const bytes = new Uint8Array(await response.arrayBuffer())
    const record = await createDefaultTemplate(bytes)
    // A second tab may have installed it while we were reading the file.
    try { await run('readwrite', s => s.add({record, bytes})) } catch (error) { if (!(error instanceof DOMException && error.name === 'ConstraintError')) throw error }
  })().catch(error => { defaultPending = undefined; throw error })
  return defaultPending
}
export async function listTemplates():Promise<PaperTemplateRecord[]>{if(window.musicBank)return window.musicBank.templates.list();await ensureBrowserDefault();return (await run('readonly',s=>s.getAll()) as StoredTemplate[]).map(t=>t.record).filter(t=>!t.archived).reverse()}
export async function importTemplate(file:File){if(file.size>15*1024*1024)throw new Error('模板大小不能超过 15MB');if(window.musicBank)return window.musicBank.templates.import({name:file.name,bytes:await file.arrayBuffer()});if(!file.name.toLowerCase().endsWith('.docx'))throw new Error('请选择 .docx 格式的 Word 模板');const bytes=new Uint8Array(await file.arrayBuffer()),summary=await inspectTemplate(bytes);const record:PaperTemplateRecord={id:crypto.randomUUID(),name:file.name,importedAt:new Date().toISOString(),fileSize:bytes.byteLength,summary};await run('readwrite',s=>s.add({record,bytes}));return record}
export async function archiveTemplate(id:string){if(window.musicBank)return window.musicBank.templates.delete(id);const entry=await run('readonly',s=>s.get(id)) as StoredTemplate;entry.record.archived=true;await run('readwrite',s=>s.put(entry))}
export async function templateBytes(id:string){const entry=await run('readonly',s=>s.get(id)) as StoredTemplate|undefined;if(!entry)throw new Error('未找到模板，请重新上传');return entry.bytes}
