import { describe, expect, it } from 'vitest'
import { emptyScore, newNote, addScoreVoice, removeScoreVoice, replaceVoiceNotes, voiceNotes, scoreVoices, scoreTimeline, scorePlayback, parseScore, withChordTone } from '../src/notation/score'
import { layoutScore, renderScore } from '../src/notation/render'

function duet() {
  let score=addScoreVoice(emptyScore())
  score=replaceVoiceNotes(score,1,[newNote(0,2),newNote(2,2)])
  score=replaceVoiceNotes(score,2,[newNote(4),newNote(5),newNote(6),newNote(7)])
  return score
}
describe('independent score voices', () => {
  it('keeps legacy single voice sources compatible and round trips new voice settings', () => {
    const legacy=emptyScore();legacy.notes=[newNote(0)]
    expect(voiceNotes(parseScore(JSON.stringify(legacy)),1)).toHaveLength(1)
    const score=duet();score.voices![1]={id:2,name:'低音声部',muted:true}
    expect(parseScore(JSON.stringify(score))).toEqual(score)
  })
  it('rejects invalid voice metadata and orphaned notes', () => {
    const score=duet()
    for(const voices of [[],[{id:1,name:''}],[{id:1,name:'一'},{id:1,name:'二'}],[{id:5,name:'五'}],[{id:1,name:'一',muted:'yes'}]]) {
      expect(()=>parseScore(JSON.stringify({...score,voices}))).toThrow()
    }
    for(const voice of [0,5,null,1.5]) expect(()=>parseScore(JSON.stringify({...emptyScore(),notes:[{...newNote(0),voice}]}))).toThrow()
  })
  it('adds up to four voices and removes only the selected voice', () => {
    let score=duet()
    score=addScoreVoice(addScoreVoice(score))
    expect(()=>addScoreVoice(score)).toThrow()
    const kept=voiceNotes(score,2)
    score=removeScoreVoice(score,1)
    expect(voiceNotes(score,2)).toEqual(kept)
    expect(voiceNotes(score,1)).toHaveLength(0)
    score=addScoreVoice(score)
    expect(scoreVoices(score).map(v=>v.id)).toContain(1)
    expect(()=>removeScoreVoice(emptyScore(),1)).toThrow()
  })
  it('edits one voice without replacing another voice or its chord', () => {
    const score=duet(), other=voiceNotes(score,1)
    const replacement=withChordTone(newNote(7),{pitch:9,accidental:'b'})
    const edited=replaceVoiceNotes(score,2,[replacement])
    expect(voiceNotes(edited,1)).toEqual(other)
    expect(voiceNotes(edited,2)[0].chord).toEqual(replacement.chord)
    expect(voiceNotes(score,2)).toHaveLength(4)
  })
  it('starts each voice at beat zero and uses the longest voice as the total duration', () => {
    const score=duet(), timeline=scoreTimeline(score)
    expect(timeline.filter(item=>item.voice===1).map(item=>item.tick/192)).toEqual([0,2])
    expect(timeline.filter(item=>item.voice===2).map(item=>item.tick/192)).toEqual([0,1,2,3])
    const playback=scorePlayback(score)
    expect(playback.beats).toBe(4)
    expect(playback.events.filter(event=>event.start===0)).toHaveLength(2)
    expect(scorePlayback(score,1).events).toHaveLength(2)
    score.voices![1].muted=true
    expect(scorePlayback(score).events).toHaveLength(2)
    expect(scorePlayback(score,2).events).toHaveLength(0)
  })
  it('aligns equal beats on different staves despite different durations', () => {
    const score=duet(),layout=layoutScore(score)
    const upper=layout.positions.filter(pos=>pos.voice===1),lower=layout.positions.filter(pos=>pos.voice===2)
    expect(upper[0].x).toBe(lower[0].x)
    expect(upper[1].x).toBe(lower[2].x)
    expect(upper[0].y).not.toBe(lower[0].y)
    expect(layout.staves).toHaveLength(2)
  })
  it('wraps all voices together and keeps an empty voice editable', () => {
    let score=duet()
    score=replaceVoiceNotes(score,1,Array.from({length:32},(_,i)=>newNote(i%7)))
    score=replaceVoiceNotes(score,2,Array.from({length:16},(_,i)=>newNote(i%7,2)))
    const layout=layoutScore(score)
    expect(layout.rows).toBeGreaterThan(1)
    const timeline=scoreTimeline(score)
    for(const item of timeline.filter(item=>item.voice===2)) {
      const peer=timeline.find(peer=>peer.voice===1&&peer.tick===item.tick)!
      const a=layout.positions.find(pos=>pos.note.id===item.note.id)!,b=layout.positions.find(pos=>pos.note.id===peer.note.id)!
      expect([a.x,a.row]).toEqual([b.x,b.row])
    }
    score=replaceVoiceNotes(score,2,[])
    expect(renderScore(score,[],0,true,2)).toContain('点击谱面放置光标')
    expect(renderScore(score)).not.toContain('data-voice')
  })
  it('keeps dotted triplet beats aligned without floating point drift', () => {
    let score=duet()
    const triplets=Array.from({length:48},()=>({...newNote(0,64),dots:2,tuplet:'group'}))
    score=replaceVoiceNotes(score,1,triplets)
    score=replaceVoiceNotes(score,2,triplets.map(note=>({...note,id:crypto.randomUUID()})))
    const timeline=scoreTimeline(score)
    expect(timeline.filter(item=>item.voice===1).map(item=>item.tick)).toEqual(timeline.filter(item=>item.voice===2).map(item=>item.tick))
    expect(timeline.every(item=>Number.isInteger(item.tick))).toBe(true)
  })
})
