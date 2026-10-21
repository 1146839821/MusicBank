const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const deadline = setTimeout(() => { console.error('Native audio smoke test timed out'); app.exit(1) }, 30000);
const root = process.cwd();
protocol.registerSchemesAsPrivileged([{scheme:'musicbank-asset',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
// CI hosts need no physical sound device; Chromium still exercises decoding and playback.
app.commandLine.appendSwitch('disable-audio-output');
app.on('window-all-closed',()=>{});
function wav(frequency) {
 const rate=8000,samples=rate*3,bytes=Buffer.alloc(44+samples*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)bytes.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*frequency/rate)*8000),44+i*2);
 return bytes;
}
app.whenReady().then(async()=>{
 const {assetResponse}=await import(pathToFileURL(root+'/dist-electron/asset-response.js').href);
 const folder=fs.mkdtempSync(join(tmpdir(),'musicbank-audio-owned-'));
 const assets=new Map([440,660].map((hz,index)=>{const id='audio-'+index,bytes=wav(hz),record={id,storedName:id+'.wav',mimeType:'audio/wav',assetType:'audio'};fs.writeFileSync(folder+'/'+record.storedName,bytes);return[id,record]}));
 protocol.handle('musicbank-asset',request=>assetResponse(request,assets.get(new URL(request.url).hostname),folder));
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 window.webContents.setAudioMuted(true);
 try {
  await window.loadURL('data:text/html,<html><body>Audio regression</body></html>');
  const result=await window.webContents.executeJavaScript(`(async()=>{
   const players=[];
   for(const id of ['audio-0','audio-1']){
    const audio=document.createElement('audio');audio.controls=true;audio.src='musicbank-asset://'+id+'/';document.body.append(audio);
    await Promise.race([new Promise((resolve,reject)=>{audio.onloadedmetadata=resolve;audio.onerror=()=>reject(Error('metadata failed '+id));audio.load()}),new Promise((_,reject)=>setTimeout(()=>reject(Error('metadata timeout')),10000))]);
    if(Math.abs(audio.duration-3)>.05)throw Error('invalid duration '+audio.duration);
    await audio.play();
    await new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>{if(!audio.paused&&audio.currentTime>0)return resolve();if(Date.now()-started>5000)return reject(Error('playback did not advance'));setTimeout(poll,50)};poll()});
    audio.pause();audio.currentTime=2;await new Promise((resolve,reject)=>{audio.onseeked=resolve;setTimeout(()=>reject(Error('seek timeout')),5000)});
    if(Math.abs(audio.currentTime-2)>.1)throw Error('seek failed');players.push(audio);
   }
   return players.map(a=>({duration:a.duration,time:a.currentTime,paused:a.paused,error:a.error}));
  })()`);
  console.log('Two owned WAV assets: metadata, playback advancement and seeking passed',JSON.stringify(result));
 } finally {window.destroy();fs.rmSync(folder,{recursive:true,force:true})}
 clearTimeout(deadline);
 app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
