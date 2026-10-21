import { app, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {documentImage} from './document-images.js'
import { buildPaperDocument, inspectTemplate } from './paper-documents.js'
import type { MusicBankDatabase } from './db.js'
import { withDocumentWindow, documentPdf } from './document-window.js'
import { buildPaperPackage } from './paper-package.js'
import type { DocumentKind } from './types.js'

const safeName=(name:string)=>String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').slice(0,100)||'MusicBank-试卷'
export function registerDocumentHandlers(database:MusicBankDatabase){
  ipcMain.handle('templates:list',()=>database.listTemplates())
  ipcMain.handle('templates:import',async(_event,payload:{name:string;bytes:ArrayBuffer})=>{
    if(!payload||typeof payload.name!=='string'||!payload.name.toLowerCase().endsWith('.docx'))throw new Error('请选择 .docx 格式的 Word 模板')
    const bytes=Buffer.from(payload.bytes),summary=await inspectTemplate(bytes)
    return database.saveTemplate({id:randomUUID(),name:basename(payload.name).slice(0,160),importedAt:new Date().toISOString(),fileSize:bytes.byteLength,summary},bytes)
  })
  ipcMain.handle('templates:delete',(_event,id:string)=>database.archiveTemplate(id))
  async function build(paperId:string,kind:DocumentKind){
    if(kind!=='paper'&&kind!=='answers')throw new Error('无效的文档类型')
    const paper=database.listPapers().find(p=>p.id===paperId)
    if(!paper?.templateId)throw new Error('该试卷未设置模板，请载入试卷后选择模板并保存')
    const bytes=await buildPaperDocument(database.templateBytes(paper.templateId),paper,kind,async id=>{
      const asset=database.findAsset(id)
      if(!asset||asset.assetType!=='image')throw new Error('试卷图片缺失，请检查题目素材')
      return documentImage(readFileSync(join(database.imagePath,basename(asset.storedName))))
    })
    return {paper,bytes}
  }
  ipcMain.handle('documents:build',async(_event,id:string,kind:DocumentKind)=>(await build(id,kind)).bytes)
  ipcMain.handle('documents:save-word',async(_event,id:string,kind:DocumentKind)=>{
    const {paper,bytes}=await build(id,kind)
    const result=await dialog.showSaveDialog({title:kind==='paper'?'下载试卷 Word':'下载答案 Word',defaultPath:join(app.getPath('documents'),`${safeName(paper.name)}-${kind==='paper'?'试卷':'答案'}.docx`),filters:[{name:'Word 文档',extensions:['docx']}]})
    if(result.canceled||!result.filePath)return {canceled:true}
    writeFileSync(result.filePath,bytes)
    return {canceled:false,filePath:result.filePath}
  })
  ipcMain.handle('documents:package',async(_event,payload:{paperId:string;paperHtml:string;answersHtml:string})=>{
    if(!payload||typeof payload.paperId!=='string') throw new Error('无效的试卷')
    const {paper,bytes:paperWord}=await build(payload.paperId,'paper')
    const {bytes:answersWord}=await build(payload.paperId,'answers')
    const summary=paper.templateSummary || (await inspectTemplate(database.templateBytes(paper.templateId!)))
    const result=await dialog.showSaveDialog({title:'导出完整离线资源包',defaultPath:join(app.getPath('documents'),`${safeName(paper.name)}.zip`),filters:[{name:'试卷资源包',extensions:['zip']}]})
    if(result.canceled||!result.filePath)return {canceled:true}
    const page={pageWidth:summary.pageWidth,pageHeight:summary.pageHeight}
    const paperPdf=await documentPdf({...page,html:payload.paperHtml})
    const answersPdf=await documentPdf({...page,html:payload.answersHtml})
    const zip=await buildPaperPackage(paper,{paperWord,answersWord,paperPdf,answersPdf},async id=>{
      const record=database.findAsset(id)
      if(!record||record.assetType!=='audio')throw new Error('试卷音频缺失，请检查题目素材')
      return {record,bytes:readFileSync(join(database.audioPath,basename(record.storedName)))}
    })
    writeFileSync(result.filePath,zip)
    return {canceled:false,filePath:result.filePath}
  })
  ipcMain.handle('documents:output',async(_event,payload:{name:string;html:string;format:'pdf'|'print';pageWidth:number;pageHeight:number})=>{
    if(!payload||!['pdf','print'].includes(payload.format)||typeof payload.html!=='string'||payload.html.length>60*1024*1024||![payload.pageWidth,payload.pageHeight].every(n=>Number.isFinite(n)&&n>=80&&n<=600))throw new Error('打印文档无效')
    let filePath:string|undefined
    if(payload.format==='pdf'){
      const result=await dialog.showSaveDialog({title:'下载 PDF',defaultPath:join(app.getPath('documents'),`${safeName(payload.name)}.pdf`),filters:[{name:'PDF 文档',extensions:['pdf']}]})
      if(result.canceled||!result.filePath)return {canceled:true}
      filePath=result.filePath
    }
    return withDocumentWindow(payload, async window => {
      if(payload.format==='pdf'){
        const pdf=await window.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}})
        writeFileSync(filePath!,pdf)
        return {canceled:false,filePath}
      }
      return new Promise<{canceled:boolean}>((resolve,reject)=>window.webContents.print({silent:false,printBackground:true,margins:{marginType:'none'}},(success,reason)=>{
        if(success)resolve({canceled:false})
        else if(/cancel/i.test(reason))resolve({canceled:true})
        else reject(new Error(reason||'打印失败，请检查打印机'))
      }))
    })
  })
}
