export type ScoreView = 'jianpu' | 'staff'
export type Duration = 1 | 2 | 4 | 8 | 16 | 32 | 64
export interface ScorePitch {
  pitch: number
  accidental: '' | '#' | 'b' | 'n'
  tieTo?: string
}
export interface ScoreVoice { id: number; name: string; muted?: boolean }
export interface ScoreNote {
  id: string
  voice?: number
  kind: 'note' | 'rest' | 'bar' | 'break'
  pitch: number // Diatonic steps from middle C (C4).
  duration: Duration
  dots: number
  accidental: '' | '#' | 'b' | 'n'
  tieTo?: string
  chord?: ScorePitch[] // Additional simultaneous pitches; the primary pitch remains compatible with old scores.
  lyric: string
  mark: string
  slur?: string
  tuplet?: string
  bar?: 'single' | 'double' | 'end' | 'repeatStart' | 'repeatEnd'
}
export interface ScoreDocument {
  version: 1
  title: string
  key: string
  beats: number
  beatUnit: number
  tempo: number
  view: ScoreView
  notes: ScoreNote[]
  voices?: ScoreVoice[]
}
export function emptyScore(): ScoreDocument {
  return { version: 1, title: '', key: 'C', beats: 4, beatUnit: 4, tempo: 96, view: 'jianpu', notes: [] }
}
export function newNote(pitch: number, duration: Duration = 4, kind: ScoreNote['kind'] = 'note'): ScoreNote {
  return { id: crypto.randomUUID(), kind, pitch, duration, dots: 0, accidental: '', lyric: '', mark: '' }
}
export const durations: Duration[] = [1, 2, 4, 8, 16, 32, 64]
export function parseScore(source?: string): ScoreDocument {
  if (!source) return emptyScore()
  const value = JSON.parse(source) as ScoreDocument
  if (value.version !== 1 || !Array.isArray(value.notes) || !['staff', 'jianpu'].includes(value.view)
    || typeof value.title !== 'string' || !['C','G','D','A','E','F','Bb','Eb'].includes(value.key)
    || !Number.isInteger(value.beats) || value.beats < 1 || value.beats > 12
    || ![2,4,8,16].includes(value.beatUnit) || !Number.isFinite(value.tempo) || value.tempo < 30 || value.tempo > 240
    || value.notes.length > 2000) throw new Error('无效的乐谱源稿')
  if (value.voices !== undefined && (!Array.isArray(value.voices) || value.voices.length < 1 || value.voices.length > 4
    || value.voices.some(voice => !voice || !Number.isInteger(voice.id) || voice.id < 1 || voice.id > 4 || typeof voice.name !== 'string' || !voice.name.trim() || voice.name.length > 32 || (voice.muted !== undefined && typeof voice.muted !== 'boolean'))
    || new Set(value.voices.map(voice => voice.id)).size !== value.voices.length)) throw new Error('无效的声部设置')
  const voiceIds = new Set(scoreVoices(value).map(voice => voice.id))
  const ids = new Set<string>()
  for (const note of value.notes) {
    if (!note || (note.voice !== undefined && !Number.isInteger(note.voice)) || !voiceIds.has(note.voice ?? 1) || typeof note.id !== 'string' || ids.has(note.id) || !['note','rest','bar','break'].includes(note.kind)
      || !Number.isInteger(note.pitch) || note.pitch < -14 || note.pitch > 28 || !durations.includes(note.duration)
      || ![0,1,2].includes(note.dots) || !['','#','b','n'].includes(note.accidental)
      || (note.tieTo !== undefined && (note.kind !== 'note' || typeof note.tieTo !== 'string'))
      || typeof note.lyric !== 'string' || typeof note.mark !== 'string'
      || (note.slur !== undefined && typeof note.slur !== 'string') || (note.tuplet !== undefined && typeof note.tuplet !== 'string')
      || (note.bar !== undefined && !['single','double','end','repeatStart','repeatEnd'].includes(note.bar))) throw new Error('无效的乐谱音符')
    if (note.chord !== undefined) {
      if (note.kind !== 'note' || !Array.isArray(note.chord) || note.chord.length > 7
        || note.chord.some(tone => !tone || !Number.isInteger(tone.pitch) || tone.pitch < -14 || tone.pitch > 28 || !['','#','b','n'].includes(tone.accidental) || (tone.tieTo !== undefined && typeof tone.tieTo !== 'string'))
        || new Set(noteTones(note).map(tone => tone.pitch)).size !== noteTones(note).length) throw new Error('无效的和弦音')
    }
    ids.add(note.id)
  }
  if (JSON.stringify(normalizeTies(value)) !== JSON.stringify(value)) throw new Error('延音线必须连接同声部相邻音符中的相同音高')
  return value
}
export function noteBeats(note: ScoreNote) {
  return note.kind === 'bar' || note.kind === 'break' ? 0 : 4 / note.duration * (note.dots === 2 ? 1.75 : note.dots === 1 ? 1.5 : 1) * (note.tuplet ? 2 / 3 : 1)
}
export function noteTones(note: ScoreNote): ScorePitch[] {
  return [{ pitch: note.pitch, accidental: note.accidental, ...(note.tieTo !== undefined ? {tieTo:note.tieTo} : {}) }, ...(note.chord || []).map(tone => ({ ...tone }))]
}
export function withChordTone(note: ScoreNote, tone: ScorePitch): ScoreNote {
  if (note.kind !== 'note') throw new Error('请选择一个音符来叠加和弦。')
  if (noteTones(note).some(item => item.pitch === tone.pitch)) throw new Error('该音高已在和弦中，可选中后调整升降号。')
  if ((note.chord?.length || 0) >= 7) throw new Error('一个和弦最多支持 8 个音。')
  if (!Number.isInteger(tone.pitch) || tone.pitch < -14 || tone.pitch > 28 || !['','#','b','n'].includes(tone.accidental)) throw new Error('和弦音超出范围。')
  return { ...note, chord: [...(note.chord || []).map(item => ({ ...item })), { ...tone }] }
}
export function updateTone(note: ScoreNote, index: number, change: Partial<ScorePitch>): ScoreNote {
  const tones = noteTones(note)
  if (!tones[index]) throw new Error('请重新选择和弦音。')
  tones[index] = { ...tones[index], ...change }
  if (tones.some(tone => !Number.isInteger(tone.pitch) || tone.pitch < -14 || tone.pitch > 28)
    || new Set(tones.map(tone => tone.pitch)).size !== tones.length) throw new Error('音高超出范围或与其他和弦音重合。')
  return { ...note, ...tones[0], tieTo:tones[0].tieTo, chord: tones.length > 1 ? tones.slice(1) : undefined }
}
export function removeTone(note: ScoreNote, index: number): ScoreNote {
  const tones = noteTones(note)
  if (tones.length === 1 || !tones[index]) return note
  tones.splice(index, 1)
  return { ...note, ...tones[0], tieTo:tones[0].tieTo, chord: tones.length > 1 ? tones.slice(1) : undefined }
}
export function transposeNotes(notes: ScoreNote[], amount: number): ScoreNote[] {
  const pitches = notes.filter(note => note.kind === 'note').flatMap(note => noteTones(note).map(tone => tone.pitch))
  const delta = pitches.length ? Math.max(-14 - Math.min(...pitches), Math.min(28 - Math.max(...pitches), amount)) : 0
  return notes.map(note => note.kind === 'note' ? {
    ...note, pitch: note.pitch + delta,
    ...(note.chord ? { chord: note.chord.map(tone => ({ ...tone, pitch: tone.pitch + delta })) } : {}),
  } : { ...note })
}
export function noteName(pitch: number) {
  const index = ((pitch % 7) + 7) % 7
  return `${['C','D','E','F','G','A','B'][index]}${4 + Math.floor(pitch / 7)}`
}
export function pitchMidi(note: ScorePitch, key = 'C') {
  const degree = ((note.pitch % 7) + 7) % 7
  const sharpOrder = [3,0,4,1,5,2,6]
  const flatOrder = [6,2,5,1,4,0,3]
  const keys: Record<string, number> = { C:0, G:1, D:2, A:3, E:4, F:-1, Bb:-2, Eb:-3 }
  const signature = keys[key] || 0
  const implicit = signature > 0 && sharpOrder.slice(0,signature).includes(degree) ? 1 : signature < 0 && flatOrder.slice(0,-signature).includes(degree) ? -1 : 0
  const accidental = note.accidental === '#' ? 1 : note.accidental === 'b' ? -1 : note.accidental === 'n' ? 0 : implicit
  return 60 + Math.floor(note.pitch / 7) * 12 + [0,2,4,5,7,9,11][degree] + accidental
}

export function keyTonic(key: string) { return 'CDEFGAB'.indexOf(key[0]) }

export function scoreVoices(score: ScoreDocument): ScoreVoice[] {
  return score.voices || [{ id: 1, name: '声部 1' }]
}
export function voiceNotes(score: ScoreDocument, voice: number): ScoreNote[] {
  return score.notes.filter(note => (note.voice ?? 1) === voice)
}
export function replaceVoiceNotes(score: ScoreDocument, voice: number, notes: ScoreNote[]): ScoreDocument {
  if (!scoreVoices(score).some(item => item.id === voice)) throw new Error('声部不存在')
  return { ...score, notes: [...score.notes.filter(note => (note.voice ?? 1) !== voice), ...notes.map(note => ({ ...note, voice }))] }
}
export function addScoreVoice(score: ScoreDocument): ScoreDocument {
  const voices = scoreVoices(score)
  const id = [1,2,3,4].find(candidate => !voices.some(voice => voice.id === candidate))
  if (!id) throw new Error('最多支持四个声部。')
  return { ...score, voices: [...voices.map(voice => ({ ...voice })), { id, name: `声部 ${id}` }] }
}
export function removeScoreVoice(score: ScoreDocument, id: number): ScoreDocument {
  if (scoreVoices(score).length === 1) throw new Error('至少保留一个声部。')
  return { ...score, voices: scoreVoices(score).filter(voice => voice.id !== id), notes: score.notes.filter(note => (note.voice ?? 1) !== id) }
}
// Integer ticks keep dotted 64ths and triplets on identical beat positions across voices.
export const TICKS_PER_BEAT = 192
export function scoreTimeline(score: ScoreDocument) {
  const elapsed = new Map<number,number>()
  return score.notes.map((note,index) => {
    const voice = note.voice ?? 1, tick = elapsed.get(voice) || 0
    const ticks = Math.round(noteBeats(note)*TICKS_PER_BEAT)
    elapsed.set(voice,tick+ticks)
    return { note, index, voice, tick, ticks }
  })
}
export function resolvedScore(score: ScoreDocument) {
  const registers=new Map<number,Map<number,ScorePitch['accidental']>>()
  const previous=new Map<number,{id:string;tones:(ScorePitch & {midi:number})[]}>()
  return scoreTimeline(withAutomaticBars(score)).map(item=>{
    const register=registers.get(item.voice)||new Map<number,ScorePitch['accidental']>()
    registers.set(item.voice,register)
    if(item.note.kind==='bar') register.clear()
    const tones=item.note.kind==='note'?noteTones(item.note).map(tone=>{
      const inherited=previous.get(item.voice)?.tones.find(source=>source.tieTo===item.note.id&&source.pitch===tone.pitch)
      const accidental=tone.accidental||register.get(tone.pitch)||''
      let midi=pitchMidi({...tone,accidental},score.key)
      if(inherited&&!tone.accidental) midi=inherited.midi
      if(tone.accidental) register.set(tone.pitch,tone.accidental)
      return {...tone,midi}
    }):[]
    if(item.note.kind==='note'||item.note.kind==='rest') previous.set(item.voice,{id:item.note.id,tones})
    return {...item,tones}
  })
}
export interface TieLink { from:string; to:string; fromTone:number; toTone:number }
function linksFromResolved(resolved: ReturnType<typeof resolvedScore>): TieLink[] {
  const links:TieLink[]=[],previous=new Map<number,(typeof resolved)[number]>()
  for(const item of resolved) {
    if(item.note.kind!=='note'&&item.note.kind!=='rest') continue
    const source=previous.get(item.voice)
    if(source&&item.note.kind==='note') source.tones.forEach((tone,index)=>{
      if(tone.tieTo!==item.note.id)return
      const target=item.tones.findIndex(target=>target.pitch===tone.pitch&&target.midi===tone.midi)
      if(target>=0)links.push({from:source.note.id,to:item.note.id,fromTone:index,toTone:target})
    })
    previous.set(item.voice,item)
  }
  return links
}
export function tieLinks(score:ScoreDocument) { return linksFromResolved(resolvedScore(score)) }
export function normalizeTies(score:ScoreDocument): ScoreDocument {
  const valid=new Set(tieLinks(score).map(link=>`${link.from}:${link.fromTone}`))
  return {...score,notes:score.notes.map(note=>{
    if(note.tieTo===undefined&&!note.chord?.some(tone=>tone.tieTo!==undefined))return note
    return {...note,tieTo:valid.has(`${note.id}:0`)?note.tieTo:undefined,chord:note.chord?.map((tone,index)=>({...tone,tieTo:valid.has(`${note.id}:${index+1}`)?tone.tieTo:undefined}))}
  })}
}
export function disconnectTies(score:ScoreDocument,ids:string[]):ScoreDocument {
  const selected=new Set(ids)
  const clear=(tone:ScorePitch,id:string)=>({...tone,tieTo:selected.has(id)||(tone.tieTo&&selected.has(tone.tieTo))?undefined:tone.tieTo})
  return {...score,notes:score.notes.map(note=>({...note,...clear(note,note.id),chord:note.chord?.map(tone=>clear(tone,note.id))}))}
}
export function toggleTies(score:ScoreDocument,ids:string[]):ScoreDocument {
  const selected=new Set(ids),rhythm=resolvedScore(score).filter(item=>item.note.kind==='note'||item.note.kind==='rest')
  const notes=rhythm.filter(item=>selected.has(item.note.id))
  if(notes.length<2||notes.some(item=>item.note.kind!=='note')||new Set(notes.map(item=>item.voice)).size!==1) throw new Error('请选择同声部至少两个相邻音符。')
  const voice=rhythm.filter(item=>item.voice===notes[0].voice),start=voice.indexOf(notes[0])
  if(voice.slice(start,start+notes.length).some((item,index)=>item.note.id!==notes[index].note.id))throw new Error('延音线不能跨过未选择的音符或休止符。')
  const existing=tieLinks(score)
  const remove=notes.slice(0,-1).every((item,index)=>existing.some(link=>link.from===item.note.id&&link.to===notes[index+1].note.id))
  const changes=new Map<string,ScoreNote>()
  for(let i=0;i<notes.length-1;i++) {
    const source=notes[i],target=notes[i+1]
    const tones=noteTones(source.note)
    let matches=0
    tones.forEach((tone,index)=>{
      const matching=target.tones.find(t=>t.pitch===tone.pitch&&(!t.accidental||t.midi===source.tones[index].midi))
      if(matching){tone.tieTo=remove?undefined:target.note.id;if(!remove&&!matching.accidental)matching.midi=source.tones[index].midi;matches++}
    })
    if(!matches)throw new Error('相邻音符没有可延续的相同音高；不同音高请使用连音线。')
    changes.set(source.note.id,{...source.note,...tones[0],tieTo:tones[0].tieTo,chord:tones.length>1?tones.slice(1):undefined})
  }
  return normalizeTies({...score,notes:score.notes.map(note=>changes.get(note.id)||note)})
}
export function duplicateNotes(notes:ScoreNote[]):ScoreNote[] {
  const ids=new Map(notes.map(note=>[note.id,crypto.randomUUID()])),groups=new Map<string,string>()
  const cloneTone=(tone:ScorePitch)=>({...tone,tieTo:tone.tieTo?ids.get(tone.tieTo):undefined})
  return notes.map(source=>{
    const note={...source,...cloneTone(source),id:ids.get(source.id)!,chord:source.chord?.map(cloneTone)}
    for(const field of ['slur','tuplet'] as const)if(note[field]){
      if(!groups.has(note[field]!))groups.set(note[field]!,crypto.randomUUID())
      note[field]=groups.get(note[field]!)
    }
    return note
  })
}
export function scorePlayback(score: ScoreDocument, onlyVoice?: number) {
  const voices = scoreVoices(score).filter(voice => onlyVoice === undefined || voice.id === onlyVoice)
  const resolved=resolvedScore(score),links=linksFromResolved(resolved)
  const incoming=new Map(links.map(link=>[`${link.to}:${link.toTone}`,`${link.from}:${link.fromTone}`]))
  const chains:{voice:number;tick:number;ticks:number;midi:number}[]=[],byTone=new Map<string,(typeof chains)[number]>()
  let ticks=0
  for(const item of resolved){
    const voice=voices.find(voice=>voice.id===item.voice)
    if(!voice)continue
    ticks=Math.max(ticks,item.tick+item.ticks)
    if(voice.muted)continue
    item.tones.forEach((tone,index)=>{
      const key=`${item.note.id}:${index}`,prior=incoming.get(key),chain=prior?byTone.get(prior):undefined
      if(chain){chain.ticks+=item.ticks;byTone.set(key,chain)}
      else{const event={voice:item.voice,tick:item.tick,ticks:item.ticks,midi:tone.midi};chains.push(event);byTone.set(key,event)}
    })
  }
  const groups=new Map<string,{start:number;beats:number;midi:number[]}>()
  for(const chain of chains){
    const key=`${chain.voice}:${chain.tick}:${chain.ticks}`,event=groups.get(key)
    if(event)event.midi.push(chain.midi)
    else groups.set(key,{start:chain.tick/TICKS_PER_BEAT,beats:chain.ticks/TICKS_PER_BEAT,midi:[chain.midi]})
  }
  const events=[...groups.values()].sort((a,b)=>a.start-b.start)
  return {events,beats:ticks/TICKS_PER_BEAT}
}

export interface MeasureCheck { voice:number; number:number; ticks:number; expected:number; status:'complete'|'short'|'over'; lastId:string }
/** Derive bar boundaries without changing the editable source or splitting sustained notes. */
export function scoreMeasures(score:ScoreDocument):MeasureCheck[] {
  const expected=score.beats*4/score.beatUnit*TICKS_PER_BEAT, result:MeasureCheck[]=[]
  for(const voice of scoreVoices(score)) {
    let ticks=0,number=1,lastId=''
    const close=()=>{if(!ticks)return;result.push({voice:voice.id,number:number++,ticks,expected,status:ticks===expected?'complete':ticks<expected?'short':'over',lastId});ticks=0}
    for(const note of voiceNotes(score,voice.id)) {
      if(note.kind==='bar'){close();continue}
      if(note.kind==='break')continue
      ticks+=Math.round(noteBeats(note)*TICKS_PER_BEAT);lastId=note.id
      if(ticks>=expected)close()
    }
    close()
  }
  return result
}
export function withAutomaticBars(score:ScoreDocument):ScoreDocument {
  const boundaries=new Map(scoreMeasures(score).map(measure=>[measure.lastId,measure]))
  const nextInVoice=new Map<string,ScoreNote|undefined>()
  for(const voice of scoreVoices(score)) {
    const notes=voiceNotes(score,voice.id).filter(note=>note.kind!=='break')
    notes.forEach((note,index)=>nextInVoice.set(note.id,notes[index+1]))
  }
  return {...score,notes:score.notes.flatMap(note=>{
    if(!boundaries.has(note.id)||nextInVoice.get(note.id)?.kind==='bar')return [note]
    return [note,{...note,id:`auto-bar:${note.id}`,kind:'bar' as const,bar:'single' as const,chord:undefined,tieTo:undefined,lyric:'',mark:'',slur:undefined,tuplet:undefined}]
  })}
}
