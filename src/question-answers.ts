import type {QuestionRecord} from '../electron/types'
import {matchingComplete} from '../electron/matching'

export function judgmentLabel(value?:string){return value==='true'?'正确（√）':value==='false'?'错误（×）':'未设置'}
export function judgmentCorrect(answer:string|undefined,expected:string|undefined){return (expected==='true'||expected==='false')&&answer===expected}

/** Completion describes input coverage, never correctness. */
export function questionAnswerComplete(question: Pick<QuestionRecord, 'type' | 'matching' | 'fillAnswers'>, answer?: string): boolean {
  if (question.type === '连线题') return Boolean(question.matching && matchingComplete(answer, question.matching))
  if (question.type === '填空题') {
    const values = (answer ?? '').split(/\r?\n/)
    return values.length === Math.max(1, question.fillAnswers?.length || 1) && values.every(value => Boolean(value.trim()))
  }
  if (question.type === '判断题') return answer === 'true' || answer === 'false'
  return Boolean(answer?.trim())
}
