import type {PaperRecord, QuestionRecord, QuestionType} from '../electron/types'

const scores: Record<QuestionType, number> = {
  '选择题': 2,
  '判断题': 2,
  '填空题': 3,
  '简答题': 10,
}

/** Build a quick exam only when no saved or configured paper is loaded. */
export function quickExam(questions: QuestionRecord[]): Pick<PaperRecord, 'name' | 'grade' | 'totalScore' | 'durationMinutes' | 'items'> | null {
  const selected = questions.filter(question => question.status === '已发布').slice(0, 10)
  if (!selected.length) return null
  const grades = new Set(selected.map(question => question.grade))
  const grade = grades.size === 1 ? selected[0].grade : '全部年级'
  const items = selected.map((question, index) => ({
    position: index + 1,
    questionId: question.id,
    score: scores[question.type],
    snapshot: JSON.parse(JSON.stringify(question)) as QuestionRecord,
  }))
  return {
    name: `${grades.size === 1 ? grade : '混合年级'}音乐综合模拟卷`,
    grade,
    totalScore: items.reduce((sum, item) => sum + item.score, 0),
    durationMinutes: 40,
    items,
  }
}
