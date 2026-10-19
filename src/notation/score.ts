export type ScoreView = 'jianpu' | 'staff'
export type Duration = 1 | 2 | 4 | 8 | 16 | 32 | 64
export interface ScoreNote {
  id: string
  kind: 'note' | 'rest' | 'bar' | 'break'
  pitch: number // Diatonic steps from middle C (C4).
  duration: Duration
  dots: number
  accidental: '' | '#' | 'b' | 'n'
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
  const ids = new Set<string>()
  for (const note of value.notes) {
    if (!note || typeof note.id !== 'string' || ids.has(note.id) || !['note','rest','bar','break'].includes(note.kind)
      || !Number.isInteger(note.pitch) || note.pitch < -14 || note.pitch > 28 || !durations.includes(note.duration)
      || ![0,1,2].includes(note.dots) || !['','#','b','n'].includes(note.accidental)
      || typeof note.lyric !== 'string' || typeof note.mark !== 'string'
      || (note.slur !== undefined && typeof note.slur !== 'string') || (note.tuplet !== undefined && typeof note.tuplet !== 'string')
      || (note.bar !== undefined && !['single','double','end','repeatStart','repeatEnd'].includes(note.bar))) throw new Error('无效的乐谱音符')
    ids.add(note.id)
  }
  return value
}
export function noteBeats(note: ScoreNote) {
  return note.kind === 'bar' || note.kind === 'break' ? 0 : 4 / note.duration * (note.dots === 2 ? 1.75 : note.dots === 1 ? 1.5 : 1) * (note.tuplet ? 2 / 3 : 1)
}
export function transposeNotes(notes: ScoreNote[], amount: number): ScoreNote[] {
  return notes.map((note) => note.kind === 'note' ? { ...note, pitch: Math.max(-14, Math.min(28, note.pitch + amount)) } : { ...note })
}
export function noteName(pitch: number) {
  const index = ((pitch % 7) + 7) % 7
  return `${['C','D','E','F','G','A','B'][index]}${4 + Math.floor(pitch / 7)}`
}
export function pitchMidi(note: ScoreNote, key = 'C') {
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
