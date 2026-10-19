import type { QuestionRecord } from '../electron/types'

/** A copied draft owns its editable data; media references intentionally reuse stored assets. */
export function copyQuestion(question: QuestionRecord, id: string): QuestionRecord {
  const copy: QuestionRecord = JSON.parse(JSON.stringify(question))
  const suffix = '（副本）'
  copy.id = id
  copy.title += suffix
  if (copy.titleRuns?.map(run => run.text).join('') === question.title) copy.titleRuns.push({text:suffix})
  else delete copy.titleRuns
  copy.status = '草稿'
  copy.updated = '刚刚'
  return copy
}
