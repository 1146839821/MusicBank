export interface PracticeResponse {
  answer: string
  result: 'correct' | 'wrong' | 'pending'
}

export function summarizePractice(questions: readonly { id: string }[], responses: Readonly<Record<string, PracticeResponse>>) {
  let completed = 0
  let graded = 0
  let correct = 0
  for (const question of questions) {
    const response = responses[question.id]
    if (!response) continue
    completed += 1
    if (response.result === 'pending') continue
    graded += 1
    if (response.result === 'correct') correct += 1
  }
  return { completed, accuracy: graded ? Math.round(correct / graded * 100) : null }
}
