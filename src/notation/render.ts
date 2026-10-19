import { keyTonic, noteName, noteTones, type ScoreDocument, type ScoreNote } from './score'
export interface NotePosition { note: ScoreNote; index: number; x: number; y: number; row: number }
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
export function layoutScore(score: ScoreDocument) {
  const positions: NotePosition[] = []
  const start = score.view === 'staff' ? 234 : 130
  const pitches = score.notes.filter(n => n.kind === 'note').flatMap(n => noteTones(n).map(tone => tone.pitch))
  const high = Math.max(0,...pitches), low = Math.min(0,...pitches)
  const rise = Math.max(0,...score.notes.filter(n => n.kind === 'note').map(n => chordRise(n,score.key)))
  const top = score.view === 'staff' ? 160 + Math.max(0,high*6-40) : 160 + rise
  const rowHeight = score.view === 'staff' ? Math.max(ROW_HEIGHT,(high-low)*6+100,140-low*6,high*6+70) : ROW_HEIGHT + rise
  let x = start, row = 0
  const widthOf = (note: ScoreNote) => note.kind === 'bar' ? 26 : Math.max(note.chord?.length ? 80 : 0, note.duration === 1 ? 112 : note.duration === 2 ? 72 : 54, Math.min(160, note.lyric.length * 17 + 20))
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
    if (x > 908 || wrapMeasure || note.kind === 'break') {
      row += 1
      x = start
      if (note.kind === 'break') { positions.push({ note, index, x: 938, y: top + (row - 1) * rowHeight, row: row - 1 }); return }
    }
    positions.push({ note, index, x, y: top + row * rowHeight, row })
    x += widthOf(note)
  })
  return { positions, rows: row + 1, start, top, rowHeight, height: Math.max(390, top + 70 + (row + 1) * rowHeight) }
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
export function renderScore(score: ScoreDocument, selected: string[] = [], caret = -1, interactive = false) {
  const { positions,rows,height,top,rowHeight,start } = layoutScore(score)
  const staff = score.view==='staff'
  let body = `<rect width="1000" height="${height}" fill="white"/><g fill="#202124" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI Symbol',serif"><text x="500" y="62" font-size="30" font-weight="600" text-anchor="middle">${escapeXml(score.title||'未命名乐谱')}</text><text x="64" y="108" font-size="16">${staff?'调号':'1 ='} ${escapeXml(score.key)}　${score.beats}/${score.beatUnit}　♩ = ${score.tempo}</text>`
  for(let row=0;row<rows;row++) {
    const y=top+row*rowHeight
    if(staff) {
      for(let i=0;i<5;i++) body+=`<path d="M64 ${y+i*12}H944" stroke="#52565e" stroke-width=".85"/>`
      body+=`<text x="72" y="${y+43}" font-size="63">𝄞</text>`
      const signature: Record<string, number> = {C:0,G:1,D:2,A:3,E:4,F:-1,Bb:-2,Eb:-3}
      const count = signature[score.key] || 0
      for(let i=0;i<Math.abs(count);i++) body+=`<text x="${106+i*11}" y="${y+(count>0?[0,18,-6,12][i]:[24,6,30][i])+7}" font-size="22">${count>0?'♯':'♭'}</text>`
      body+=`<text x="170" y="${y+19}" text-anchor="middle" font-size="22" font-weight="600">${score.beats}</text><text x="170" y="${y+43}" text-anchor="middle" font-size="22" font-weight="600">${score.beatUnit}</text>`
    }
    body+=`<text x="48" y="${y-19}" font-size="11" fill="#8c929b">${row+1}</text>`
  }
  for (const pos of positions) {
    const {note,x,y,index}=pos
    const rise=staff?0:chordRise(note,score.key)
    const hitTop=staff?Math.min(y-50,y+40-Math.max(...noteTones(note).map(t=>t.pitch))*6):y-50-rise
    const hitBottom=staff?Math.max(y+95,y+80-Math.min(...noteTones(note).map(t=>t.pitch))*6):y+95
    if(interactive) body+=`<g data-note-id="${escapeXml(note.id)}" data-index="${index}" role="button" tabindex="-1" aria-label="${note.kind==='note'?noteTones(note).length>1?'和弦 '+noteTones(note).map(t=>noteName(t.pitch)).join(' '):noteName(note.pitch):note.kind==='rest'?'休止符':note.kind==='bar'?'小节线':'换行'}"><rect x="${x-23}" y="${hitTop}" width="48" height="${hitBottom-hitTop}" rx="4" fill="${selected.includes(note.id)?'#e7eeff':'transparent'}" stroke="${selected.includes(note.id)?'#8ba7f7':'none'}"/>`
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
      for(const row of new Set(members.map(p=>p.row))) {
        const onRow=members.filter(p=>p.row===row),a=onRow[0],b=onRow[onRow.length-1]
        if(!a||!b) continue
        const y=Math.min(...onRow.map(p=>decorationY(p.note,p.y,staff,score.key)))-20
        body+=field==='slur'?`<path d="M${a.x-6} ${y+16}Q${(a.x+b.x)/2} ${y-12} ${b.x+6} ${y+16}" fill="none" stroke="#202124" stroke-width="1.3"/>`:`<path d="M${a.x-14} ${y+7}v-7H${b.x+14}v7" fill="none" stroke="#202124"/><rect x="${(a.x+b.x)/2-7}" y="${y-10}" width="14" height="16" fill="white"/><text x="${(a.x+b.x)/2}" y="${y+3}" font-size="14" text-anchor="middle">3</text>`
      }
    }
  }
  if(interactive) {
    const previous=positions[Math.min(caret-1,positions.length-1)]
    const x=caret===0||!previous?(start-18):previous.x+25,y=previous?.y||top
    body+=`<path class="score-caret" d="M${x} ${y-13}v72" stroke="#3b6df6" stroke-width="2"/>`
    if(!score.notes.length) body+=`<text x="500" y="300" text-anchor="middle" font-size="15" fill="#9299a5">点击谱面放置光标，使用 1–7 或上方面板录入音符</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}">${body}</g></svg>`
}
