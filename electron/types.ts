export type QuestionType = '选择题' | '填空题' | '简答题'

export interface UserProfile {
  username: string
  nickname: string
  userCode: string
}

export interface QuestionRecord {
  id: string
  title: string
  grade: string
  category: string
  subcategory?: string
  type: QuestionType
  status: '已发布' | '草稿'
  hasAudio: boolean
  hasImage: boolean
  updated: string
  difficulty: string
  source?: string
  options?: string[]
  correctAnswer?: string
  fillAnswers?: string[]
  referenceAnswer?: string
  explanation?: string
  audioName?: string
  audioDuration?: string
  audioAssetId?: string
  imageAssetId?: string
}

export interface AssetRecord {
  id: string
  assetType: 'audio' | 'image'
  originalName: string
  storedName: string
  mimeType: string
  fileSize: number
  sha256?: string
  durationMs?: number
}

export interface PaperRecord {
  id: string
  name: string
  grade: string
  totalScore: number
  durationMinutes: number
  seed?: string
  items: Array<{ position: number; questionId: string; score: number; snapshot: QuestionRecord }>
}

export interface ExamAttemptRecord {
  id: string
  paperId: string
  status: '进行中' | '已交卷'
  startedAt: string
  submittedAt?: string
  remainingSeconds: number
}

export interface ExamAnswerRecord {
  attemptId: string
  position: number
  answer?: string
  score?: number
  reviewStatus?: '已评分' | '待批阅'
  comment?: string
}

export interface PracticeRecord {
  questionId: string
  answer: string
  result: 'correct' | 'wrong' | 'pending'
}

export interface BackupPayload {
  format: 'musicbank-backup'
  version: 1
  exportedAt: string
  questions: QuestionRecord[]
  papers: PaperRecord[]
  wrongQuestionIds: string[]
  assets: Array<{ record: AssetRecord; bytesBase64: string }>
}
