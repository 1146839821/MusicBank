import {BrowserWindow,nativeImage} from 'electron'
import {randomUUID} from 'node:crypto'

/** Word receives PNG bytes even when the owned original is WebP. */
export async function documentImage(bytes:Uint8Array):Promise<{bytes:Uint8Array;width:number;height:number}> {
  const original=Buffer.from(bytes)
  const native=nativeImage.createFromBuffer(original)
  if(!native.isEmpty())return {bytes:native.toPNG(),...native.getSize()}
  // Chromium supports WebP, while nativeImage only decodes some image formats.
  // No user HTML, local files, permissions, node access or network is available here.
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:`musicbank-image-${randomUUID()}`}})
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false))
  window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}))
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  try{
    await window.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27; img-src data:;">')
    const source=`data:image/webp;base64,${original.toString('base64')}`
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const image=new Image();image.src=${JSON.stringify(source)};
      let timer;
      try{
        await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('图片读取超时')),10000)})]);
        const width=image.naturalWidth,height=image.naturalHeight;
        if(!width||!height||width*height>100000000)throw new Error('图片尺寸无效或过大');
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');if(!context)throw new Error('无法转换图片');
        context.drawImage(image,0,0);
        return {width,height,png:canvas.toDataURL('image/png')};
      }finally{clearTimeout(timer)}
    })()`) as {width:number;height:number;png:string}
    if(!Number.isSafeInteger(result?.width)||!Number.isSafeInteger(result?.height)||result.width<=0||result.height<=0||result.width*result.height>100000000||typeof result.png!=='string'||!result.png.startsWith('data:image/png;base64,'))throw new Error('图片转换失败')
    return {bytes:Buffer.from(result.png.slice('data:image/png;base64,'.length),'base64'),width:result.width,height:result.height}
  }catch{
    throw new Error('试卷图片格式无法识别或转换，请检查素材文件')
  }finally{window.destroy()}
}
