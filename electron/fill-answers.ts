/** Each saved entry is one blank. A teacher may explicitly separate alternatives with |. */
export function fillAnswerGroups(answers: string[] = []): string[][] {
  return answers.map(answer => answer.split('|').map(value => value.trim()).filter(Boolean))
}

export function parseFillAnswers(text: string): string[] {
  const lines = text.trim().split(/\r?\n/)
  if (!text.trim() || lines.some(line => line.split('|').some(value => !value.trim()))) {
    throw new Error('每个空都需填写标准答案，分隔符两侧的答案不能为空。')
  }
  return lines.map(line => [...new Set(line.split('|').map(value => value.trim()))].join(' | '))
}

function normalized(value: string): string {
  // Preserve meaningful music symbols and decimal punctuation (1.5 must not equal 15).
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

export function fillAnswersCorrect(response: string, answers: string[] = []): boolean {
  const groups = fillAnswerGroups(answers)
  const responses = response.split(/\r?\n/)
  return groups.length > 0 && responses.length === groups.length && groups.every((group, index) =>
    normalized(responses[index] || '') !== '' && group.some(expected => normalized(expected) === normalized(responses[index])),
  )
}

export function formatFillAnswers(answers: string[] = []): string {
  const groups = fillAnswerGroups(answers)
  return groups.map((group, index) => `${groups.length > 1 ? `第${index + 1}空：` : ''}${group.join(' / ')}`).join('；') || '未设置答案'
}
