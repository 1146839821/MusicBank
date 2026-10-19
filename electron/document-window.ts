import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export interface DocumentPage { html: string; pageWidth: number; pageHeight: number }
export async function withDocumentWindow<T>(payload: DocumentPage, action: (window: BrowserWindow) => Promise<T>) {
  if(typeof payload?.html!=='string'||payload.html.length>60*1024*1024||![payload.pageWidth,payload.pageHeight].every(n=>Number.isFinite(n)&&n>=80&&n<=600)) throw new Error('打印文档无效')
  // This window receives static document markup only. No scripts, file access or network requests.
  const window=new BrowserWindow({show:false,webPreferences:{javascript:false,sandbox:true,contextIsolation:true,partition:`musicbank-print-${randomUUID()}`}})
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false))
  const printRoot=mkdtempSync(join(app.getPath('temp'),'musicbank-print-')),printPath=join(printRoot,'document.html'),printUrl=pathToFileURL(printPath).href
  window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:details.url!==printUrl&&!details.url.startsWith('data:')}))
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';"><style>@page{size:${payload.pageWidth}mm ${payload.pageHeight}mm;margin:0}html,body{margin:0!important;padding:0!important;background:white!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.docx-wrapper{padding:0!important;background:white!important}.docx-wrapper>section.docx{margin:0!important;box-shadow:none!important;break-after:page}section.docx:last-child{break-after:auto}a{color:inherit}</style></head><body>${payload.html}</body></html>`
  try{
    writeFileSync(printPath,html,'utf8')
    await window.loadURL(printUrl)
    return await action(window)
  }finally{window.destroy();rmSync(printRoot,{recursive:true,force:true})}
}
export function documentPdf(page: DocumentPage) {
  return withDocumentWindow(page, window=>window.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}}))
}
