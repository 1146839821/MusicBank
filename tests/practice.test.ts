import { describe, expect, it } from 'vitest'
import { summarizePractice } from '../src/practice'

describe('practice session statistics', () => {
  const questions = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]

  it('counts actual submissions when the learner skips ahead', () => {
    expect(summarizePractice(questions, { C: { answer: 'B', result: 'wrong' } }))
      .toEqual({ completed: 1, accuracy: 0 })
  })

  it('computes accuracy across all automatically graded submissions', () => {
    expect(summarizePractice(questions, {
      A: { answer: 'A', result: 'correct' },
      B: { answer: 'B', result: 'wrong' },
      C: { answer: 'A,C', result: 'correct' },
    })).toEqual({ completed: 3, accuracy: 67 })
  })

  it('counts pending short answers as complete without lowering accuracy', () => {
    expect(summarizePractice(questions, {
      A: { answer: 'A', result: 'correct' },
      B: { answer: '参考回答', result: 'pending' },
    })).toEqual({ completed: 2, accuracy: 100 })
  })

  it('has no score before an objective answer is graded', () => {
    expect(summarizePractice(questions, {})).toEqual({ completed: 0, accuracy: null })
    expect(summarizePractice(questions, { A: { answer: '参考回答', result: 'pending' } }))
      .toEqual({ completed: 1, accuracy: null })
  })

  it('excludes submissions outside the active practice pool', () => {
    expect(summarizePractice(questions, { removed: { answer: 'A', result: 'correct' } }))
      .toEqual({ completed: 0, accuracy: null })
  })
})
