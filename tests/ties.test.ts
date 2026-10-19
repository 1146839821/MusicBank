import { describe, expect, it } from 'vitest'
import { emptyScore, newNote, toggleTies, tieLinks, scorePlayback, resolvedScore, normalizeTies, duplicateNotes, parseScore, withChordTone, removeTone, addScoreVoice, replaceVoiceNotes } from '../src/notation/score'
import { renderScore } from '../src/notation/render'

function pair() { const score=emptyScore(); score.notes=[newNote(0),newNote(0)]; return score }
describe('notation ties and accidental scope',()=>{
  it('joins and toggles sustained sounds without retriggering',()=>{
    const score=pair(),ids=score.notes.map(n=>n.id),tied=toggleTies(score,ids)
    expect(tieLinks(tied)).toHaveLength(1)
    expect(scorePlayback(tied).events).toEqual([{start:0,beats:2,midi:[60]}])
    expect(scorePlayback(toggleTies(tied,ids)).events).toHaveLength(2)
    expect(parseScore(JSON.stringify(tied))).toEqual(tied)
  })
  it('carries accidentals within a measure and exact octave, across layout breaks only',()=>{
    const score=emptyScore();score.key='G'
    score.notes=[{...newNote(3),accidental:'n'},newNote(3),newNote(10),newNote(0,4,'break'),newNote(3),newNote(0,4,'bar'),newNote(3)]
    expect(resolvedScore(score).flatMap(n=>n.tones.map(t=>t.midi))).toEqual([65,65,78,65,66])
  })
  it('extends a sharp across a bar without changing subsequent untied notes',()=>{
    const score=pair();score.notes[0].accidental='#';score.notes.splice(1,0,newNote(0,4,'bar'));score.notes.push(newNote(0))
    const tied=toggleTies(score,[score.notes[0].id,score.notes[2].id])
    expect(scorePlayback(tied).events).toEqual([{start:0,beats:2,midi:[61]},{start:2,beats:1,midi:[60]}])
  })
  it('propagates a chain across bars and explicit matching accidentals',()=>{
    const score=pair();score.notes[0].accidental='#';score.notes.splice(1,0,newNote(0,4,'bar'));score.notes.push({...newNote(0),accidental:'#'})
    const tied=toggleTies(score,score.notes.filter(n=>n.kind==='note').map(n=>n.id))
    expect(tieLinks(tied)).toHaveLength(2)
    expect(scorePlayback(tied).events).toEqual([{start:0,beats:3,midi:[61]}])
  })
  it('rejects gaps, rests, conflicting pitches and cross voice selections',()=>{
    const score=pair();score.notes[1].pitch=1
    expect(()=>toggleTies(score,score.notes.map(n=>n.id))).toThrow()
    score.notes[1].pitch=0;score.notes.splice(1,0,newNote(0,4,'rest'))
    expect(()=>toggleTies(score,[score.notes[0].id,score.notes[2].id])).toThrow()
    const duet=replaceVoiceNotes(addScoreVoice(pair()),2,[newNote(0)])
    expect(()=>toggleTies(duet,[duet.notes[0].id,duet.notes[2].id])).toThrow()
    const conflict=pair();conflict.notes[0].accidental='#';conflict.notes[1].accidental='n'
    expect(()=>toggleTies(conflict,conflict.notes.map(n=>n.id))).toThrow()
  })
  it('sustains shared chord tones independently of other pitches',()=>{
    const score=pair();score.notes[0]=withChordTone(score.notes[0],{pitch:2,accidental:''});score.notes[1]=withChordTone(score.notes[1],{pitch:4,accidental:''})
    const tied=toggleTies(score,score.notes.map(n=>n.id))
    expect(scorePlayback(tied).events).toEqual([{start:0,beats:2,midi:[60]},{start:0,beats:1,midi:[64]},{start:1,beats:1,midi:[67]}])
    expect(removeTone(tied.notes[0],0).tieTo).toBeUndefined()
  })
  it('removes dangling links and rejects malformed source',()=>{
    const score=pair(),tied=toggleTies(score,score.notes.map(n=>n.id))
    const deleted={...tied,notes:tied.notes.slice(0,1)}
    expect(normalizeTies(deleted).notes[0].tieTo).toBeUndefined()
    expect(()=>parseScore(JSON.stringify(deleted))).toThrow()
    for(const tieTo of ['',42,'missing'])expect(()=>parseScore(JSON.stringify({...score,notes:[{...score.notes[0],tieTo},score.notes[1]]}))).toThrow()
    const changed=structuredClone(tied);changed.notes[1].pitch=2
    expect(tieLinks(normalizeTies(changed))).toHaveLength(0)
  })
  it('duplicates internal links and drops links outside the selection',()=>{
    const score=pair(),tied=toggleTies(score,score.notes.map(n=>n.id)),copy=duplicateNotes(tied.notes)
    expect(copy[0].tieTo).toBe(copy[1].id)
    expect(copy[0].id).not.toBe(tied.notes[0].id)
    expect(duplicateNotes(tied.notes.slice(0,1))[0].tieTo).toBeUndefined()
  })
  it('keeps accidental registers independent between voices',()=>{
    let score=addScoreVoice(emptyScore());score=replaceVoiceNotes(score,1,[{...newNote(0),accidental:'#'},newNote(0)]);score=replaceVoiceNotes(score,2,[newNote(0)])
    expect(resolvedScore(score).flatMap(n=>n.tones.map(t=>t.midi))).toEqual([61,61,60])
  })
  it('exports visible ties in both notation views',()=>{
    const score=pair(),tied=toggleTies(score,score.notes.map(n=>n.id))
    for(const view of ['staff','jianpu'] as const){const svg=renderScore({...tied,view});expect(svg).toContain('class="notation-tie"');expect(svg).not.toContain('data-note-id')}
    const wrapped={...tied,notes:[tied.notes[0],newNote(0,4,'break'),tied.notes[1]]}
    expect(renderScore(wrapped).match(/class="notation-tie"/g)).toHaveLength(2)
  })
})
