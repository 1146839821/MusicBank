import {describe,expect,it} from 'vitest'
import {questionAnswerComplete} from '../src/question-answers'
import {matchingAnswer} from '../electron/matching'
import type {MatchingData} from '../electron/types'
const matching:MatchingData={version:1,scoring:'per-pair',sources:[0,1].map(order=>({id:`s${order}`,order,contentType:'text',text:'图片'})),targets:[0,1].map(order=>({id:`t${order}`,order,contentType:'text',text:'名称'})),pairs:[{sourceId:'s0',targetId:'t0'},{sourceId:'s1',targetId:'t1'}]}
describe('exam input completeness',()=>{
 it('requires every fill blank without conflating completeness and correctness',()=>{
  const q={type:'填空题' as const,fillAnswers:['四分音符','一拍']}
  for(const answer of [undefined,'','\n','四分音符\n','\n一拍','四分音符\n \t','四分音符\n一拍\n多余'])expect(questionAnswerComplete(q,answer)).toBe(false)
  expect(questionAnswerComplete(q,'错误名称\n错误拍数')).toBe(true)
  expect(questionAnswerComplete(q,'♩\r\n一拍')).toBe(true)
 })
 it('keeps legacy single-blank questions usable and recognizes judgment values',()=>{
  expect(questionAnswerComplete({type:'填空题'},'中强')).toBe(true)
  for(const answer of ['true','false'])expect(questionAnswerComplete({type:'判断题'},answer)).toBe(true)
  for(const answer of [undefined,'','yes'])expect(questionAnswerComplete({type:'判断题'},answer)).toBe(false)
 })
 it('requires complete one-to-one connections independent of the scoring rule',()=>{
  const q={type:'连线题' as const,matching}
  expect(questionAnswerComplete(q,matchingAnswer(matching.pairs.slice(0,1)))).toBe(false)
  expect(questionAnswerComplete(q,matchingAnswer([{sourceId:'s0',targetId:'t1'},{sourceId:'s1',targetId:'t0'}]))).toBe(true)
  expect(questionAnswerComplete(q,matchingAnswer([matching.pairs[0],matching.pairs[0]]))).toBe(false)
  expect(questionAnswerComplete({type:'连线题'},'{}')).toBe(false)
 })
 it('counts selected choices and nonempty short answers without grading them',()=>{
  for(const type of ['选择题','简答题'] as const){
   expect(questionAnswerComplete({type},'  ')).toBe(false)
   expect(questionAnswerComplete({type},'A,C')).toBe(true)
  }
 })
})
