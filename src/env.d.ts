import type { ExamAnswerRecord, ExamAttemptRecord, PaperRecord, PracticeRecord, QuestionRecord, UserProfile, PaperTemplateRecord, DocumentKind } from '../electron/types'

declare global {
  interface Window {
    musicBank?: {
      questions: {
        list: () => Promise<QuestionRecord[]>
        save: (question: QuestionRecord) => Promise<QuestionRecord>
        delete: (id: string) => Promise<void>
      }
      papers: {
        save: (paper: PaperRecord) => Promise<string>
        list: () => Promise<PaperRecord[]>
        delete: (id: string) => Promise<void>
      }
      templates: {
        list: () => Promise<PaperTemplateRecord[]>
        import: (payload:{name:string;bytes:ArrayBuffer}) => Promise<PaperTemplateRecord>
        delete: (id:string) => Promise<void>
      }
      documents: {
        build: (paperId:string,kind:DocumentKind) => Promise<Uint8Array>
        saveWord: (paperId:string,kind:DocumentKind) => Promise<{canceled:boolean;filePath?:string}>
        output: (payload:{name:string;html:string;format:'pdf'|'print';pageWidth:number;pageHeight:number}) => Promise<{canceled:boolean;filePath?:string}>
      }
      exams: {
        start: (attempt: ExamAttemptRecord) => Promise<ExamAttemptRecord>
        answer: (answer: ExamAnswerRecord) => Promise<ExamAnswerRecord>
        finish: (attempt: ExamAttemptRecord) => Promise<ExamAttemptRecord>
      }
      practice: {
        record: (record: PracticeRecord) => Promise<void>
      }
      wrong: {
        list: () => Promise<string[]>
        upsert: (questionId: string) => Promise<void>
        remove: (questionId: string) => Promise<void>
      }
      assets: {
        import: (payload: { assetType: 'audio' | 'image'; name: string; mimeType: string; bytes: ArrayBuffer; durationMs?: number }) => Promise<{ id: string; url: string; name?: string; durationMs?: number }>
        url: (id: string) => string
        updateDuration: (id: string, durationMs: number) => Promise<void>
      }
      backup: {
        export: () => Promise<{ canceled: boolean; filePath?: string; questionCount?: number; paperCount?: number; assetCount?: number }>
        import: (password: string) => Promise<{ canceled: boolean; filePath?: string; questionCount?: number; paperCount?: number; assetCount?: number }>
      }
      system: {
        isDesktop: boolean
        profile: () => Promise<UserProfile | null>
        createUser: (payload: { username: string; nickname: string; password: string }) => Promise<UserProfile>
        updateProfile: (changes: Pick<UserProfile, 'nickname' | 'userCode'>) => Promise<UserProfile>
        verifyPassword: (password: string) => Promise<boolean>
        changePassword: (payload: { currentPassword: string; nextPassword: string }) => Promise<boolean>
        resetPassword: (payload: { userCode: string; nextPassword: string }) => Promise<boolean>
        paths: () => Promise<{ dataRoot: string; databasePath: string; assetsPath: string }>
      }
    }
  }
}

export {}
