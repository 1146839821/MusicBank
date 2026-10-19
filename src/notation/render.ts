import { withAutomaticBars, keyTonic, noteName, noteTones, tieLinks, scoreVoices, scoreTimeline, TICKS_PER_BEAT, type ScoreDocument, type ScoreNote } from './score'
export interface NotePosition { note: ScoreNote; index: number; x: number; y: number; row: number; voice: number }
export const SCORE_WIDTH = 1000
export const ROW_HEIGHT = 180
export function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[character]!))
}
function jianpuStack(note: ScoreNote, key: string) {
  const tones = noteTones(note).map((tone,index) => ({ tone,index,offset:0 })).sort((a,b) => a.tone.pitch-b.tone.pitch)
  for (let i=1;i<tones.length;i++) {
    const previousOctave = Math.floor((tones[i-1].tone.pitch-keyTonic(key))/7)
    const octave = Math.floor((tones[i].tone.pitch-keyTonic(key))/7)
    const above = previousOctave > 0 ? 34+(previousOctave-1)*7 : 23
    const below = octave < 0 ? 24+(-octave-1)*7 : 7+Math.max(0,Math.log2(note.duration)-2)*5
    tones[i].offset = tones[i-1].offset - Math.max(44,above+below+12)
  }
  return tones
}
function chordRise(note: ScoreNote, key: string) { return Math.max(0,...jianpuStack(note,key).map(item => -item.offset)) }
function decorationY(note: ScoreNote, y: number, staff: boolean, key: string) {
  return staff ? Math.min(y-26,y+15-Math.max(...noteTones(note).map(tone => tone.pitch))*6) : y-26-chordRise(note,key)
}
export function staffHeaderLayout(score:ScoreDocument) {
  const count=Math.abs(({C:0,G:1,D:2,A:3,E:4,F:-1,Bb:-2,Eb:-3} as Record<string,number>)[score.key]||0)
  const timeX=count?110+(count-1)*11+24:126
  return {timeX,firstNote:timeX+42+(String(score.beats).length-1)*6}
}
export function layoutScore(source: ScoreDocument) {
  const result=layoutEngraving(withAutomaticBars(source)),indices=new Map(source.notes.map((note,index)=>[note.id,index]))
  const bars=result.positions.filter(position=>!indices.has(position.note.id))
  return {...result,bars,positions:result.positions.filter(position=>indices.has(position.note.id)).map(position=>({...position,index:indices.get(position.note.id)!}))}
}
function layoutEngraving(score: ScoreDocument) {
  const positions: NotePosition[] = []
  const start = score.view === 'staff' ? staffHeaderLayout(score).firstNote : 130
  const pitches = score.notes.filter(n => n.kind === 'note').flatMap(n => noteTones(n).map(tone => tone.pitch))
  const high = Math.max(0,...pitches), low = Math.min(0,...pitches)
  const rise = Math.max(0,...score.notes.filter(n => n.kind === 'note').map(n => chordRise(n,score.key)))
  const top = score.view === 'staff' ? 160 + Math.max(0,high*6-40) : 160 + rise
  const rowHeight = score.view === 'staff' ? Math.max(ROW_HEIGHT,(high-low)*6+100,140-low*6,high*6+70) : ROW_HEIGHT + rise
  const widthOf = (note: ScoreNote) => note.kind === 'bar' ? 26 : Math.max(note.chord?.length ? 80 : 0, note.duration === 1 ? 112 : note.duration === 2 ? 72 : 54, Math.min(160, note.lyric.length * 17 + 20))
  const voices=scoreVoices(score)
  if (voices.length > 1) return layoutPolyphony(score,{start,top,stride:rowHeight,rise,widthOf})
  let x = start, row = 0
  score.notes.forEach((note, index) => {
    const measureStart = index === 0 || ['bar','break'].includes(score.notes[index-1].kind)
    let measureWidth = 0
    if (measureStart) {
      for (let next = index; next < score.notes.length; next++) {
        const item = score.notes[next]
        if (item.kind === 'break') break
        measureWidth += widthOf(item)
        if (item.kind === 'bar') break
      }
    }
    const wrapMeasure = measureStart && x > start && measureWidth <= 930-start && x + measureWidth > 944
    if ((x > 908 && note.kind !== 'bar') || wrapMeasure || note.kind === 'break') {
      row += 1
      x = start
      if (note.kind === 'break') { positions.push({ note, index, x: 938, y: top + (row - 1) * rowHeight, row: row - 1, voice: voices[0].id }); return }
    }
    positions.push({ note, index, x, y: top + row * rowHeight, row, voice: voices[0].id })
    x += widthOf(note)
  })
  const staves=Array.from({length:row+1},(_,i)=>({row:i,voice:voices[0].id,y:top+i*rowHeight}))
  return { positions, staves, rows: row + 1, start, top, rowHeight, height: Math.max(390, top + 70 + (row + 1) * rowHeight) }
}
function layoutPolyphony(score: ScoreDocument, geometry: {start:number;top:number;stride:number;rise:number;widthOf:(note:ScoreNote)=>number}) {
  const {start,top,stride,widthOf}=geometry, voices=scoreVoices(score),timeline=scoreTimeline(score)
  const rowHeight=stride*voices.length+40, positions:NotePosition[]=[]
  const measureTicks=score.beats*4/score.beatUnit*TICKS_PER_BEAT
  const itemsByTick=new Map<number,typeof timeline>()
  for(const item of timeline) { const items=itemsByTick.get(item.tick)||[];items.push(item);itemsByTick.set(item.tick,items) }
  const ticks=[...new Set([0,...itemsByTick.keys()])].sort((a,b)=>a-b)
  const slots=ticks.map((tick,index)=>({tick,width:Math.max(54,...(itemsByTick.get(tick)||[]).map(item=>widthOf(item.note)),Math.min(150,((ticks[index+1]??tick+TICKS_PER_BEAT)-tick)/TICKS_PER_BEAT*42))}))
  const slotMap=new Map<number,{x:number;row:number}>()
  const breaks=new Set(timeline.filter(item=>item.note.kind==='break').map(item=>item.tick))
  let x=start,row=0
  for(let i=0;i<slots.length;i++) {
    const slot=slots[i],measure=Math.floor(slot.tick/measureTicks)
    const startsMeasure=i===0||Math.floor(slots[i-1].tick/measureTicks)!==measure
    let measureWidth=0
    if(startsMeasure) for(let j=i;j<slots.length&&Math.floor(slots[j].tick/measureTicks)===measure;j++) measureWidth+=slots[j].width
    const wrapMeasure=startsMeasure&&x>start&&measureWidth<=944-start&&x+measureWidth>944
    if((breaks.has(slot.tick)&&slot.tick>0&&x>start)||wrapMeasure||x+slot.width>944){row++;x=start}
    slotMap.set(slot.tick,{x,row});x+=slot.width
  }
  for(const item of timeline) {
    const slot=slotMap.get(item.tick)!,voiceIndex=voices.findIndex(voice=>voice.id===item.voice)
    const isBreak=item.note.kind==='break'
    const noteRow=isBreak?Math.max(0,slot.row-1):slot.row
    positions.push({note:item.note,index:item.index,voice:item.voice,row:noteRow,x:isBreak?938:slot.x-(item.note.kind==='bar'?22:0),y:top+noteRow*rowHeight+voiceIndex*stride})
  }
  const staves=Array.from({length:row+1},(_,i)=>voices.map((voice,j)=>({row:i,voice:voice.id,y:top+i*rowHeight+j*stride}))).flat()
  return {positions,staves,rows:row+1,start,top,rowHeight,height:Math.max(390,top+70+(row+1)*rowHeight)}
}
function staffNote(note: ScoreNote, x: number, top: number, interactive: boolean) {
  const tones = noteTones(note).map((tone,index) => ({...tone,index})).sort((a,b) => a.pitch-b.pitch)
  const down = (tones[0].pitch+tones[tones.length-1].pitch)/2 >= 6
  const hollow = note.duration <= 2
  let svg = '', shifted = false
  tones.forEach((tone,i) => {
    shifted = i > 0 && tone.pitch-tones[i-1].pitch === 1 ? !shifted : false
    const headX = x + (shifted ? down ? -12 : 12 : 0)
    const y = top+60-tone.pitch*6
    if (interactive) svg += `<g data-tone-index="${tone.index}"><circle cx="${headX}" cy="${y}" r="10" fill="transparent"/>`
    if (tone.pitch <= 0) for (let ledger=0;ledger>=tone.pitch;ledger-=2) svg += `<path d="M${headX-12} ${top+60-ledger*6}h24" stroke="#202124"/>`
    if (tone.pitch >= 12) for (let ledger=12;ledger<=tone.pitch;ledger+=2) svg += `<path d="M${headX-12} ${top+60-ledger*6}h24" stroke="#202124"/>`
    svg += `<ellipse cx="${headX}" cy="${y}" rx="7" ry="4.8" transform="rotate(-20 ${headX} ${y})" fill="${hollow?'white':'#202124'}" stroke="#202124" stroke-width="1.6"/>`
    if (tone.accidental) svg += `<text x="${x-22-(i%3)*10}" y="${y+7}" font-size="22">${{'#':'♯',b:'♭',n:'♮'}[tone.accidental]}</text>`
    for(let dot=0;dot<note.dots;dot++) svg += `<circle cx="${x+26+dot*6}" cy="${y-3}" r="2"/>`
    if (interactive) svg += '</g>'
  })
  if (note.duration > 1) {
    const highY=top+60-tones[tones.length-1].pitch*6,lowY=top+60-tones[0].pitch*6
    const stemX=x+(down?-6:6), start=down?highY:lowY, end=down?lowY+35:highY-35
    svg += `<path d="M${stemX} ${start}V${end}" stroke="#202124" stroke-width="1.5"/>`
    for(let i=0;i<Math.max(0,Math.log2(note.duration)-2);i++) {
      const flagY=end+(down?-i*6:i*6),direction=down?-1:1
      svg += `<path d="M${stemX} ${flagY}q17 ${direction*7} 5 ${direction*22}q7 ${-direction*15} -5 ${-direction*16}" fill="#202124"/>`
    }
  }
  return svg
}
function jianpuNote(note: ScoreNote, x: number, top: number, key: string) {
  const y = top + 36
  const relative = note.pitch - keyTonic(key)
  const degree = ((relative % 7) + 7) % 7 + 1
  const octave = Math.floor(relative/7)
  let svg = `<text x="${x}" y="${y}" text-anchor="middle" font-size="28" font-weight="500">${note.kind==='rest'?'0':degree}</text>`
  if(note.kind==='note') for(let i=0;i<Math.abs(octave);i++) svg += `<circle cx="${x}" cy="${octave>0?y-34-i*7:y+24+i*7}" r="2"/>`
  const lines = Math.max(0,Math.log2(note.duration)-2)
  for(let i=0;i<lines;i++) svg += `<path d="M${x-9} ${y+7+i*5}h18" stroke="#202124" stroke-width="1.5"/>`
  for(let i=1;i<4/note.duration;i++) svg += `<text x="${x+12+i*24}" y="${y-3}" font-size="18">−</text>`
  for(let i=0;i<note.dots;i++) svg += `<circle cx="${x+15+i*6}" cy="${y-10}" r="2"/>`
  if(note.accidental) svg += `<text x="${x-22}" y="${y-9}" font-size="19">${{'#':'♯',b:'♭',n:'♮'}[note.accidental]}</text>`
  return svg
}
function bar(note: ScoreNote,x:number,y:number,staff:boolean) {
  const top=staff?y:y-4, bottom=staff?y+48:y+46
  const line=(dx:number,width=1.4)=>`<path d="M${x+dx} ${top}V${bottom}" stroke="#202124" stroke-width="${width}"/>`
  const dots=(dx:number)=>`<circle cx="${x+dx}" cy="${top+19}" r="2"/><circle cx="${x+dx}" cy="${top+31}" r="2"/>`
  return note.bar==='end'?line(-5)+line(2,4):note.bar==='double'?line(-3)+line(3):note.bar==='repeatStart'?line(-4,3)+line(2)+dots(9):note.bar==='repeatEnd'?dots(-9)+line(-2)+line(4,3):line(0)
}
function renderTies(score:ScoreDocument,positions:NotePosition[],staves:{row:number;voice:number;y:number}[],start:number) {
  const byId=new Map(positions.map(position=>[position.note.id,position])),staff=score.view==='staff'
  let svg=''
  const curve=(x1:number,y1:number,x2:number,y2:number,direction:number)=>`<path class="notation-tie" d="M${x1} ${y1}Q${(x1+x2)/2} ${(y1+y2)/2+direction*20} ${x2} ${y2}" fill="none" stroke="#202124" stroke-width="1.3"/>`
  const toneY=(position:NotePosition,index:number)=>staff?position.y+60-noteTones(position.note)[index].pitch*6:position.y+36+jianpuStack(position.note,score.key).find(item=>item.index===index)!.offset
  for(const link of tieLinks(score)) {
    const a=byId.get(link.from),b=byId.get(link.to)
    if(!a||!b)continue
    const pitch=noteTones(a.note)[link.fromTone].pitch,direction=staff&&pitch>=6?-1:1
    const offset=staff?direction*8:36,y1=toneY(a,link.fromTone)+offset,y2=toneY(b,link.toTone)+offset
    if(a.row===b.row) svg+=curve(a.x+10,y1,b.x-10,y2,direction)
    else {
      svg+=curve(a.x+10,y1,938,y1,direction)
      for(let row=a.row+1;row<b.row;row++) {
        const stave=staves.find(stave=>stave.row===row&&stave.voice===a.voice)
        if(stave) {const y=stave.y+(y1-a.y);svg+=curve(start-22,y,938,y,direction)}
      }
      svg+=curve(start-22,y2,b.x-10,y2,direction)
    }
  }
  return svg
}
export function renderScore(score: ScoreDocument, selected: string[] = [], caret = -1, interactive = false, activeVoice = scoreVoices(score)[0].id) {
  const { positions,bars,staves,height,top,start } = layoutScore(score)
  const staff = score.view==='staff'
  let body = `<rect width="1000" height="${height}" fill="white"/><g fill="#202124" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI Symbol',serif"><text x="500" y="62" font-size="30" font-weight="600" text-anchor="middle">${escapeXml(score.title||'未命名乐谱')}</text><text x="64" y="108" font-size="16">${staff?'调号':'1 ='} ${escapeXml(score.key)}　${score.beats}/${score.beatUnit}　♩ = ${score.tempo}</text>`
  for(const stave of staves) {
    const {row,y,voice}=stave
    const settings=scoreVoices(score).find(item=>item.id===voice)!
    if(interactive) body+=`<rect data-voice="${voice}" x="48" y="${y-50}" width="904" height="155" rx="5" fill="${scoreVoices(score).length>1&&voice===activeVoice?'#f8faff':'transparent'}"/>`
    if(scoreVoices(score).length>1) body+=`<text x="64" y="${y-top+130}" font-size="12" fill="#66748c">${escapeXml(settings.name)}${interactive&&settings.muted?' · 静音':''}</text>`
    if(staff) {
      for(let i=0;i<5;i++) body+=`<path d="M64 ${y+i*12}H944" stroke="#52565e" stroke-width=".85"/>`
      body+=`<text x="72" y="${y+43}" font-size="63">𝄞</text>`
      const signature: Record<string, number> = {C:0,G:1,D:2,A:3,E:4,F:-1,Bb:-2,Eb:-3}
      const count = signature[score.key] || 0
      for(let i=0;i<Math.abs(count);i++) body+=`<text x="${106+i*11}" y="${y+(count>0?[0,18,-6,12][i]:[24,6,30][i])+7}" font-size="22">${count>0?'♯':'♭'}</text>`
      body+=`<text x="${staffHeaderLayout(score).timeX}" y="${y+19}" text-anchor="middle" font-family="Times New Roman,serif" font-style="normal" font-size="26" font-weight="700">${score.beats}</text><text x="${staffHeaderLayout(score).timeX}" y="${y+43}" text-anchor="middle" font-family="Times New Roman,serif" font-style="normal" font-size="26" font-weight="700">${score.beatUnit}</text>`
    }
    body+=`<text x="48" y="${y-19}" font-size="11" fill="#8c929b">${row+1}</text>`
  }
  if(staff)for(const row of new Set(staves.map(stave=>stave.row))){
    const system=staves.filter(stave=>stave.row===row),first=system[0].y,last=system[system.length-1].y+48
    body+=`<path class="system-bar" d="M64 ${first}V${last}" stroke="#202124" stroke-width="1.2"/>`
    if(system.length>1){const middle=(first+last)/2;body+=`<path d="M54 ${first}C36 ${first+20} 54 ${middle-16} 42 ${middle}C54 ${middle+16} 36 ${last-20} 54 ${last}" fill="none" stroke="#202124" stroke-width="2"/>`}
  }
  for(const position of bars) body+=`<g class="automatic-bar">${bar(position.note,position.x,position.y,staff)}</g>`
  for (const pos of positions) {
    const {note,x,y,index}=pos
    const rise=staff?0:chordRise(note,score.key)
    const hitTop=staff?Math.min(y-50,y+40-Math.max(...noteTones(note).map(t=>t.pitch))*6):y-50-rise
    const hitBottom=staff?Math.max(y+95,y+80-Math.min(...noteTones(note).map(t=>t.pitch))*6):y+95
    if(interactive) body+=`<g data-note-id="${escapeXml(note.id)}" data-voice="${pos.voice}" data-index="${index}" role="button" tabindex="-1" aria-label="${note.kind==='note'?noteTones(note).length>1?'和弦 '+noteTones(note).map(t=>noteName(t.pitch)).join(' '):noteName(note.pitch):note.kind==='rest'?'休止符':note.kind==='bar'?'小节线':'换行'}"><rect x="${x-23}" y="${hitTop}" width="48" height="${hitBottom-hitTop}" rx="4" fill="${selected.includes(note.id)?'#e7eeff':'transparent'}" stroke="${selected.includes(note.id)?'#8ba7f7':'none'}"/>`
    if(note.kind==='note') body+=staff?staffNote(note,x,y,interactive):jianpuStack(note,score.key).map(item => `${interactive?`<g data-tone-index="${item.index}">`:''}${jianpuNote({...note,...item.tone},x,y+item.offset,score.key)}${interactive?'</g>':''}`).join('')
    else if(note.kind==='rest') body+=staff?`<text x="${x}" y="${y+37}" text-anchor="middle" font-size="34">${({1:'𝄻',2:'𝄼',4:'𝄽',8:'𝄾',16:'𝄿',32:'𝅀',64:'𝅁'})[note.duration]}</text>${Array.from({length:note.dots},(_,i)=>`<circle cx="${x+16+i*6}" cy="${y+26}" r="2"/>`).join('')}`:jianpuNote(note,x,y,score.key)
    else if(note.kind==='bar') body+=bar(note,x,y,staff)
    else if(interactive) body+=`<text x="${x}" y="${y+30}" fill="#8a9bad">↵</text>`
    if(note.lyric) body+=`<text x="${x}" y="${y+95}" text-anchor="middle" font-size="17">${escapeXml(note.lyric)}</text>`
    if(note.mark) body+=`<text x="${x}" y="${decorationY(note,y,staff,score.key)}" text-anchor="middle" font-size="17" font-style="italic">${escapeXml(note.mark)}</text>`
    if(interactive) body+='</g>'
  }
  for(const field of ['slur','tuplet'] as const) {
    const groups = new Set(score.notes.map(n=>n[field]).filter(Boolean))
    for(const group of groups) {
      const members=positions.filter(p=>p.note[field]===group)
      for(const lane of new Set(members.map(p=>`${p.row}:${p.voice}`))) {
        const onRow=members.filter(p=>`${p.row}:${p.voice}`===lane),a=onRow[0],b=onRow[onRow.length-1]
        if(!a||!b) continue
        const y=Math.min(...onRow.map(p=>decorationY(p.note,p.y,staff,score.key)))-20
        body+=field==='slur'?`<path d="M${a.x-6} ${y+16}Q${(a.x+b.x)/2} ${y-12} ${b.x+6} ${y+16}" fill="none" stroke="#202124" stroke-width="1.3"/>`:`<path d="M${a.x-14} ${y+7}v-7H${b.x+14}v7" fill="none" stroke="#202124"/><rect x="${(a.x+b.x)/2-7}" y="${y-10}" width="14" height="16" fill="white"/><text x="${(a.x+b.x)/2}" y="${y+3}" font-size="14" text-anchor="middle">3</text>`
      }
    }
  }
  body+=renderTies(score,positions,staves,start)
  if(interactive) {
    const voicePositions=positions.filter(pos=>pos.voice===activeVoice)
    const previous=voicePositions[Math.min(caret-1,voicePositions.length-1)]
    const emptyStave=staves.find(stave=>stave.voice===activeVoice)
    const x=caret===0||!previous?(start-18):previous.x+25,y=previous?.y||emptyStave?.y||top
    body+=`<path class="score-caret" d="M${x} ${y-13}v72" stroke="#3b6df6" stroke-width="2"/>`
    if(!voicePositions.length) body+=`<text x="500" y="${(emptyStave?.y||top)+70}" text-anchor="middle" font-size="15" fill="#9299a5">点击谱面放置光标，使用 1–7 或上方面板录入音符</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}">${body}</g></svg>`
}
