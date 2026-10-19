import { describe, expect, it } from 'vitest'
import { emptyScore, newNote, noteTones, withChordTone, updateTone, removeTone, parseScore, transposeNotes, scorePlayback } from '../src/notation/score'
import { layoutScore, renderScore } from '../src/notation/render'

function triad() {
  return withChordTone(withChordTone(newNote(0),{pitch:2,accidental:''}),{pitch:4,accidental:''})
}
describe('editable chords', () => {
  it('round trips independent accidentals and keeps older single notes readable', () => {
    const score=emptyScore();score.notes=[updateTone(triad(),1,{accidental:'b'}),newNote(7)]
    const restored=parseScore(JSON.stringify(score))
    expect(noteTones(restored.notes[0])).toEqual([{pitch:0,accidental:''},{pitch:2,accidental:'b'},{pitch:4,accidental:''}])
    expect(restored.notes[1].chord).toBeUndefined()
  })
  it('rejects duplicate, out of range and excessive chord tones without mutating the source', () => {
    const note=triad()
    expect(()=>withChordTone(note,{pitch:2,accidental:'#'})).toThrow()
    expect(()=>updateTone(note,1,{pitch:4})).toThrow()
    expect(()=>updateTone(note,1,{pitch:29})).toThrow()
    expect(noteTones(note).map(t=>t.pitch)).toEqual([0,2,4])
    const score=emptyScore()
    for (const chord of [null,{},[{pitch:2,accidental:'x'}],[{pitch:0,accidental:''}],Array.from({length:8},(_,i)=>({pitch:i+1,accidental:''}))]) {
      expect(()=>parseScore(JSON.stringify({...score,notes:[{...newNote(0),chord}]}))).toThrow()
    }
  })
  it('transposes a chord as a unit and preserves intervals at pitch boundaries', () => {
    const upper={...triad(),pitch:24,chord:[{pitch:26,accidental:'' as const},{pitch:28,accidental:'' as const}]}
    expect(noteTones(transposeNotes([upper],7)[0]).map(t=>t.pitch)).toEqual([24,26,28])
    expect(noteTones(transposeNotes([triad()],7)[0]).map(t=>t.pitch)).toEqual([7,9,11])
  })
  it('promotes another tone when the primary tone is removed, then returns to a single note', () => {
    const two=removeTone(triad(),0)
    expect(noteTones(two).map(t=>t.pitch)).toEqual([2,4])
    const one=removeTone(two,1)
    expect(one.pitch).toBe(2)
    expect(one.chord).toBeUndefined()
    expect(removeTone(one,0)).toEqual(one)
  })
  it('schedules all chord pitches at the same onset without lengthening the beat', () => {
    const score=emptyScore();score.notes=[triad(),newNote(0,4,'rest'),newNote(7,2)]
    const playback=scorePlayback(score)
    expect(playback.events).toEqual([{start:0,beats:1,midi:[60,64,67]},{start:2,beats:2,midi:[72]}])
    expect(playback.beats).toBe(4)
  })
  it('renders three staff noteheads on one stem and keeps editing hit targets out of export', () => {
    const score=emptyScore();score.view='staff';score.notes=[triad()]
    const exported=renderScore(score)
    expect(exported.match(/<ellipse /g)).toHaveLength(3)
    expect(exported.match(/stroke-width="1.5"/g)).toHaveLength(1)
    expect(exported).not.toContain('data-tone-index')
    expect(renderScore(score,[],0,true)).toContain('data-tone-index="2"')
  })
  it('reserves vertical space for jianpu chord stacks across rows', () => {
    const single=emptyScore(), score=emptyScore()
    single.notes=[newNote(0)]
    score.notes=[triad(),newNote(0,4,'break'),triad()]
    const layout=layoutScore(score)
    expect(layout.top).toBeGreaterThan(layoutScore(single).top)
    expect(layout.rowHeight).toBeGreaterThan(layoutScore(single).rowHeight)
    expect(layout.positions[2].y-layout.positions[0].y).toBe(layout.rowHeight)
    expect(renderScore(score,[],0,true)).toContain('和弦 C4 E4 G4')
  })
})
