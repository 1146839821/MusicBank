import { keyTonic, noteName, type ScoreDocument, type ScoreNote } from './score'
export interface NotePosition { note: ScoreNote; index: number; x: number; y: number; row: number }
export const SCORE_WIDTH = 1000
export const ROW_HEIGHT = 180
export function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[character]!))
}
export function layoutScore(score: ScoreDocument) {
  const positions: NotePosition[] = []
  const start = score.view === 'staff' ? 202 : 130
  const pitches = score.notes.filter(n => n.kind === 'note').map(n => n.pitch)
  const high = Math.max(0,...pitches), low = Math.min(0,...pitches)
  const top = score.view === 'staff' ? 160 + Math.max(0,high*6-72) : 160
  const rowHeight = score.view === 'staff' ? Math.max(ROW_HEIGHT,(high-low)*6+100,140-low*6,high*6+70) : ROW_HEIGHT
  let x = start, row = 0
  const widthOf = (note: ScoreNote) => note.kind === 'bar' ? 26 : Math.max(note.duration === 1 ? 112 : note.duration === 2 ? 72 : 54, Math.min(160, note.lyric.length * 17 + 20))
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
  return { positions, rows: row + 1, top, rowHeight, height: Math.max(390, top + 70 + (row + 1) * rowHeight) }
}
function staffNote(note: ScoreNote, x: number, top: number) {
  const y = top + 60 - note.pitch * 6
  const hollow = note.duration <= 2
  let svg = ''
  if (note.pitch <= 0) for (let ledger = 0; ledger >= note.pitch; ledger -= 2) svg += `<path d="M${x-12} ${top+60-ledger*6}h24" stroke="#202124"/>`
  if (note.pitch >= 12) for (let ledger = 12; ledger <= note.pitch; ledger += 2) svg += `<path d="M${x-12} ${top+60-ledger*6}h24" stroke="#202124"/>`
  svg += `<ellipse cx="${x}" cy="${y}" rx="7" ry="4.8" transform="rotate(-20 ${x} ${y})" fill="${hollow?'white':'#202124'}" stroke="#202124" stroke-width="1.6"/>`
  if (note.duration > 1) {
    const down = note.pitch >= 6
    const stemX = x + (down ? -6 : 6)
    const end = y + (down ? 35 : -35)
    svg += `<path d="M${stemX} ${y}V${end}" stroke="#202124" stroke-width="1.5"/>`
    const flags = Math.max(0, Math.log2(note.duration)-2)
    for(let i=0;i<flags;i++) {
      const start = end + (down ? -i*6 : i*6), d=down?-1:1
      svg += `<path d="M${stemX} ${start}q17 ${d*7} 5 ${d*22}q7 ${-d*15} -5 ${-d*16}" fill="#202124"/>`
    }
  }
  if (note.accidental) svg += `<text x="${x-20}" y="${y+7}" font-size="22">${{'#':'♯',b:'♭',n:'♮'}[note.accidental]}</text>`
  for(let i=0;i<note.dots;i++) svg += `<circle cx="${x+14+i*6}" cy="${y-3}" r="2"/>`
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
  const { positions,rows,height,top,rowHeight } = layoutScore(score)
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
    if(interactive) body+=`<g data-note-id="${escapeXml(note.id)}" data-index="${index}" role="button" tabindex="-1" aria-label="${note.kind==='note'?noteName(note.pitch):note.kind==='rest'?'休止符':note.kind==='bar'?'小节线':'换行'}"><rect x="${x-23}" y="${y-50}" width="48" height="145" rx="4" fill="${selected.includes(note.id)?'#e7eeff':'transparent'}" stroke="${selected.includes(note.id)?'#8ba7f7':'none'}"/>`
    if(note.kind==='note') body+=staff?staffNote(note,x,y):jianpuNote(note,x,y,score.key)
    else if(note.kind==='rest') body+=staff?`<text x="${x}" y="${y+37}" text-anchor="middle" font-size="34">${({1:'𝄻',2:'𝄼',4:'𝄽',8:'𝄾',16:'𝄿',32:'𝅀',64:'𝅁'})[note.duration]}</text>${Array.from({length:note.dots},(_,i)=>`<circle cx="${x+16+i*6}" cy="${y+26}" r="2"/>`).join('')}`:jianpuNote(note,x,y,score.key)
    else if(note.kind==='bar') body+=bar(note,x,y,staff)
    else if(interactive) body+=`<text x="${x}" y="${y+30}" fill="#8a9bad">↵</text>`
    if(note.lyric) body+=`<text x="${x}" y="${y+95}" text-anchor="middle" font-size="17">${escapeXml(note.lyric)}</text>`
    if(note.mark) body+=`<text x="${x}" y="${y-26}" text-anchor="middle" font-size="17" font-style="italic">${escapeXml(note.mark)}</text>`
    if(interactive) body+='</g>'
  }
  for(const field of ['slur','tuplet'] as const) {
    const groups = new Set(score.notes.map(n=>n[field]).filter(Boolean))
    for(const group of groups) {
      const members=positions.filter(p=>p.note[field]===group)
      for(const row of new Set(members.map(p=>p.row))) {
        const onRow=members.filter(p=>p.row===row),a=onRow[0],b=onRow[onRow.length-1]
        if(!a||!b) continue
        const y=a.y-39
        body+=field==='slur'?`<path d="M${a.x-6} ${y+16}Q${(a.x+b.x)/2} ${y-12} ${b.x+6} ${y+16}" fill="none" stroke="#202124" stroke-width="1.3"/>`:`<path d="M${a.x-14} ${y+7}v-7H${b.x+14}v7" fill="none" stroke="#202124"/><rect x="${(a.x+b.x)/2-7}" y="${y-10}" width="14" height="16" fill="white"/><text x="${(a.x+b.x)/2}" y="${y+3}" font-size="14" text-anchor="middle">3</text>`
      }
    }
  }
  if(interactive) {
    const previous=positions[Math.min(caret-1,positions.length-1)]
    const x=caret===0||!previous?(staff?184:112):previous.x+25,y=previous?.y||top
    body+=`<path class="score-caret" d="M${x} ${y-13}v72" stroke="#3b6df6" stroke-width="2"/>`
    if(!score.notes.length) body+=`<text x="500" y="300" text-anchor="middle" font-size="15" fill="#9299a5">点击谱面放置光标，使用 1–7 或上方面板录入音符</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}">${body}</g></svg>`
}
