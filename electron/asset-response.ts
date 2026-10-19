import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { AssetRecord } from './types.js'

/** Serve owned media with MIME and byte ranges so Chromium can play and seek local audio. */
export function assetResponse(request: Request, asset: AssetRecord | undefined, folder: string): Response {
  if (!asset) return new Response('Asset not found', {status:404})
  let bytes: Buffer
  try {bytes=readFileSync(join(folder,basename(asset.storedName)))} catch {return new Response('Asset file not found',{status:404})}
  const headers=new Headers({'Content-Type':asset.mimeType,'Content-Length':String(bytes.length),'Accept-Ranges':'bytes'})
  const range=request.headers.get('range')
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range)
    let start=0,end=bytes.length-1
    if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}})
    if(!match[1])start=Math.max(0,bytes.length-Number(match[2]))
    else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]))}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=bytes.length)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}})
    headers.set('Content-Range',`bytes ${start}-${end}/${bytes.length}`);headers.set('Content-Length',String(end-start+1))
    return new Response(request.method==='HEAD'?null:new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers})
  }
  return new Response(request.method==='HEAD'?null:new Uint8Array(bytes),{headers})
}
