import { effectScope, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { usePracticeDrafts } from '../src/practice-drafts'
import { summarizePractice } from '../src/practice'

function session() {
  const scope = effectScope()
  const answer = ref('')
  const drafts = scope.run(() => usePracticeDrafts(answer))!
  return { answer, drafts, scope }
}

describe('practice drafts', () => {
  it('restores partial matching answers through repeated question switches without submitting', () => {
    const { answer, drafts, scope } = session()
    const partial = JSON.stringify({ version: 1, pairs: [{ sourceId: 'erhu', targetId: 'name-erhu' }] })
    drafts.load('matching')
    answer.value = partial
    drafts.load('choice')
    expect(answer.value).toBe('')
    answer.value = 'A,C'
    drafts.load('matching')
    expect(answer.value).toBe(partial)
    drafts.load('choice')
    expect(answer.value).toBe('A,C')
    expect(summarizePractice([{ id: 'matching' }, { id: 'choice' }], {})).toEqual({ completed: 0, accuracy: null })
    scope.stop()
  })

  it('keeps cleared answers empty and gives submitted results priority', () => {
    const { answer, drafts, scope } = session()
    drafts.load('one')
    answer.value = 'A'
    answer.value = ''
    drafts.load('two')
    drafts.load('one')
    expect(answer.value).toBe('')
    drafts.load('one', 'B')
    expect(answer.value).toBe('B')
    scope.stop()
  })

  it('isolates session resets, removed drafts, and empty filtered pools', () => {
    const { answer, drafts, scope } = session()
    drafts.load('one')
    answer.value = '填空答案'
    drafts.load()
    expect(answer.value).toBe('')
    drafts.load('one')
    expect(answer.value).toBe('填空答案')
    drafts.remove('one')
    drafts.load('one')
    expect(answer.value).toBe('')
    answer.value = '新答案'
    drafts.clear()
    drafts.load('one')
    expect(answer.value).toBe('')
    scope.stop()
  })
})
