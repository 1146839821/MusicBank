import { describe, expect, it } from 'vitest'
import { emptyScore, newNote, parseScore, noteBeats, transposeNotes, pitchMidi } from '../src/notation/score'
import { layoutScore, renderScore } from '../src/notation/render'

describe('editable music scores', () => {
  it('round trips notation source with 64th notes, dots, lyrics and groups', () => {
    const score = emptyScore()
    score.notes = [newNote(0,64),newNote(1,64),newNote(2,64)]
    score.notes.forEach(n => Object.assign(n,{dots:2,lyric:'音乐',slur:'s',tuplet:'t'}))
    expect(parseScore(JSON.stringify(score))).toEqual(score)
    expect(noteBeats(score.notes[0])).toBeCloseTo(4/64*1.75*2/3)
  })
  it('rejects unsupported or malformed source and duplicate note identities', () => {
    const score = emptyScore(), note = newNote(0)
    for(const value of [null,{}, {...score,version:2},{...score,notes:[note,note]},{...score,notes:[{...note,pitch:NaN}]},{...score,notes:[{...note,duration:128}]}]) {
      expect(()=>parseScore(JSON.stringify(value))).toThrow()
    }
  })
  it('transposes only pitched notes and keeps the allowed range', () => {
    expect(transposeNotes([newNote(28),newNote(0,4,'rest')],7).map(n=>n.pitch)).toEqual([28,0])
    expect(pitchMidi(newNote(3),'G')).toBe(66)
    expect(pitchMidi({...newNote(3),accidental:'n'},'G')).toBe(65)
  })
  it('wraps long scores and retains interactive targets only on the editor surface', () => {
    const score = emptyScore()
    score.notes = Array.from({length:60},(_,i)=>newNote(i%7,64))
    const layout = layoutScore(score)
    expect(layout.rows).toBeGreaterThan(3)
    expect(layout.positions).toHaveLength(60)
    expect(renderScore(score,[],0,true)).toContain('data-note-id=')
    expect(renderScore(score)).not.toContain('data-note-id=')
    score.view='staff'
    expect(renderScore(score)).toContain('<ellipse')
    expect(score.notes).toHaveLength(60)
  })
  it('leaves room for ledger notes at both ends of the pitch range', () => {
    const score=emptyScore();score.view='staff';score.notes=[newNote(28),newNote(-14)]
    const layout=layoutScore(score)
    expect(layout.top+60-28*6).toBeGreaterThan(125)
    expect(layout.rowHeight).toBeGreaterThan(300)
  })
  it('escapes imported text so source cannot inject SVG elements', () => {
    const score = emptyScore()
    score.title='<script>alert(1)</script>'
    score.notes=[{...newNote(0),lyric:'<image href="x"/>',mark:'a&b'}]
    const svg=renderScore(score)
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<image')
    expect(svg).toContain('a&amp;b')
  })
})
