export interface TextRun { text: string; bold?: boolean; italic?: boolean }
export type QuestionType = '选择题' | '填空题' | '判断题' | '简答题' | '连线题'
export type ChoiceMode = 'single' | 'multiple'

export interface UserProfile {
  username: string
  nickname: string
  userCode: string
}

export interface QuestionAttachment { id: string; assetType: 'image' | 'audio'; name: string; duration?: string; notationDocument?: string }

export interface MatchingItem { id:string; contentType:'text'|'image'; text:string; assetId?:string; order:number }
export interface MatchingPair { sourceId:string; targetId:string }
export interface MatchingData { version:1; sources:MatchingItem[]; targets:MatchingItem[]; pairs:MatchingPair[]; scoring:'per-pair'|'all-or-nothing'; targetOrder?:string[] }
export interface ImageGridItem { id:string; assetId:string; caption:string }
export interface ImageGridBlock { id:string; kind:'image-grid'; columns:2|3|4; imageHeight:number; fit:'contain'|'cover'; gap:number; align:'start'|'center'|'end'; items:ImageGridItem[] }
export interface QuestionRecord {
  imageGrids?:ImageGridBlock[]
  matching?:MatchingData
  attachments?: QuestionAttachment[]
  id: string
  title: string
  titleRuns?: TextRun[]
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
  optionIds?: string[]
  correctOptionIds?: string[]
  correctAnswer?: string
  answerMode?: ChoiceMode
  fillAnswers?: string[]
  referenceAnswer?: string
  explanation?: string
  audioName?: string
  audioDuration?: string
  audioAssetId?: string
  imageAssetId?: string
  notationDocument?: string
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
  templateSummary?: TemplateSummary
  templateId?: string
  examInfo?: ExamInfo
  items: Array<{ position: number; questionId: string; score: number; snapshot: QuestionRecord }>
}

export interface ExamAttemptRecord {
  candidateName?: string
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

export interface ExamSessionRecord {
  attempt: ExamAttemptRecord
  answers: ExamAnswerRecord[]
  paper: PaperRecord
}

export interface PracticeRecord {
  questionId: string
  answer: string
  result: 'correct' | 'wrong' | 'pending'
}

export interface PracticeHistoryRecord extends PracticeRecord { createdAt: string }
export interface WrongQuestionRecord { questionId: string; wrongCount: number; mastered: boolean; lastWrongAt: string }
export interface CategoryRecord { id:number; parentId:number|null; name:string; sortOrder:number }
export interface BackupPayload {
  categories?:CategoryRecord[]
  exams?: Array<Pick<ExamSessionRecord, 'attempt' | 'answers'>>
  practiceRecords?: PracticeHistoryRecord[]
  wrongRecords?: WrongQuestionRecord[]
  questionSequence?: number
  format: 'musicbank-backup'
  version: 1
  exportedAt: string
  questions: QuestionRecord[]
  papers: PaperRecord[]
  wrongQuestionIds: string[]
  assets: Array<{ record: AssetRecord; bytesBase64: string }>
  templates?: Array<{ record: PaperTemplateRecord; bytesBase64: string }>
}

export interface ExamInfo {
  school: string
  schoolYear: string
  term: string
  subject: string
  examDate: string
  instructions: string
}
export interface TemplateSummary {
  sectionOrder: QuestionType[]
  mode: 'sections' | 'placeholder'
  pageWidth: number
  pageHeight: number
  warnings: string[]
}
export interface PaperTemplateRecord {
  id: string
  name: string
  importedAt: string
  fileSize: number
  summary: TemplateSummary
  archived?: boolean
}
export type DocumentKind = 'paper' | 'answers'
