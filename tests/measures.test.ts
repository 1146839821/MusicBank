import {describe,it,expect} from 'vitest'
import {emptyScore,newNote,scoreMeasures,withAutomaticBars,resolvedScore,addScoreVoice,replaceVoiceNotes} from '../src/notation/score'
import {layoutScore,renderScore,staffHeaderLayout} from '../src/notation/render'
describe('automatic measures and compact staff signatures',()=>{
  it('divides seven quarter notes into four beats and an incomplete final measure without changing source',()=>{
    const score=emptyScore();score.view='staff';score.notes=Array.from({length:7},()=>newNote(0))
    expect(scoreMeasures(score).map(m=>[m.ticks/192,m.status])).toEqual([[4,'complete'],[3,'short']])
    const layout=layoutScore(score)
    expect(layout.bars).toHaveLength(2);expect(layout.positions).toHaveLength(7)
    expect(layout.bars[0].x).toBeGreaterThan(layout.positions[3].x);expect(layout.bars[0].x).toBeLessThan(layout.positions[4].x)
    expect(score.notes).toHaveLength(7);expect(renderScore(score)).toContain('automatic-bar');expect(renderScore(score)).not.toContain('data-note-id')
  })
  it('counts dotted notes, triplets, rests and chords by sounding duration',()=>{
    const score=emptyScore();score.beats=6;score.beatUnit=8
    score.notes=[{...newNote(0),dots:1},{...newNote(0,4,'rest'),dots:1}]
    expect(scoreMeasures(score).map(m=>m.status)).toEqual(['complete'])
    score.beats=1;score.beatUnit=4;score.notes=Array.from({length:3},()=>({...newNote(0,8),tuplet:'t'}))
    expect(scoreMeasures(score)[0].status).toBe('complete')
    score.notes=[{...newNote(0),chord:[{pitch:2,accidental:''}]}]
    expect(scoreMeasures(score)[0].ticks).toBe(192)
  })
  it('preserves manual bar types, ignores visual line breaks and flags overfull notes',()=>{
    const score=emptyScore(),end={...newNote(0,4,'bar'),bar:'end' as const}
    score.notes=[newNote(0,1),newNote(0,4,'break'),end]
    expect(withAutomaticBars(score).notes.filter(n=>n.kind==='bar')).toEqual([end])
    score.notes=[{...newNote(0,1),dots:1}]
    expect(scoreMeasures(score)[0].status).toBe('over')
    score.notes=[newNote(0),end,newNote(1)]
    expect(scoreMeasures(score).map(m=>m.status)).toEqual(['short','short'])
  })
  it('resets measure accidentals at generated barlines for playback',()=>{
    const score=emptyScore();score.notes=[{...newNote(0),accidental:'#'},...Array.from({length:4},()=>newNote(0))]
    expect(resolvedScore(score).filter(n=>n.note.kind==='note').map(n=>n.tones[0].midi)).toEqual([61,61,61,61,60])
  })
  it('sizes the header for the selected key and keeps voices aligned at boundaries',()=>{
    let score=emptyScore();score.view='staff'
    expect(staffHeaderLayout(score).timeX).toBeLessThan(140)
    const c=staffHeaderLayout(score);score.key='Eb';expect(staffHeaderLayout(score).timeX).toBeGreaterThan(c.timeX)
    score=addScoreVoice(score);score=replaceVoiceNotes(score,1,Array.from({length:8},()=>newNote(0)));score=replaceVoiceNotes(score,2,Array.from({length:4},()=>newNote(0,2)))
    const layout=layoutScore(score),upper=layout.positions.filter(p=>p.voice===1),lower=layout.positions.filter(p=>p.voice===2)
    expect(upper[4].x).toBe(lower[2].x);expect(layout.bars).toHaveLength(4)
    expect(renderScore(score)).toContain('class="system-bar"')
  })
  it('closes both voices on the previous system when a shared measure boundary wraps',()=>{
    for(const view of ['jianpu','staff'] as const){
      let score=addScoreVoice({...emptyScore(),view})
      score=replaceVoiceNotes(score,1,Array.from({length:24},()=>newNote(0)))
      score=replaceVoiceNotes(score,2,Array.from({length:24},()=>newNote(2)))
      const layout=layoutScore(score)
      expect(layout.staves.map(stave=>stave.measureNumber)).toEqual([1,1,4,4])
      for(const voice of [1,2]){
        const last=layout.positions.filter(position=>position.voice===voice&&position.row===0).slice(-1)[0]
        const closing=layout.bars.find(position=>position.note.id===`auto-bar:${last.note.id}`)!
        expect(closing.row).toBe(0)
        expect(closing.x).toBeGreaterThan(last.x)
        expect(closing.x).toBeLessThanOrEqual(944)
      }
    }
  })

})
