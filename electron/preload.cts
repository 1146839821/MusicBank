import { contextBridge, ipcRenderer } from 'electron'
import type { ExamAnswerRecord, ExamAttemptRecord, PaperRecord, PracticeRecord, QuestionRecord, UserProfile } from './types.js'

contextBridge.exposeInMainWorld('musicBank', {
  questions: {
    list: (): Promise<QuestionRecord[]> => ipcRenderer.invoke('questions:list'),
    save: (question: QuestionRecord): Promise<QuestionRecord> => ipcRenderer.invoke('questions:save', question),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('questions:delete', id),
  },
  papers: {
    save: (paper: PaperRecord): Promise<string> => ipcRenderer.invoke('papers:save', paper),
    list: (): Promise<PaperRecord[]> => ipcRenderer.invoke('papers:list'),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('papers:delete', id),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    import: (payload: {name:string;bytes:ArrayBuffer}) => ipcRenderer.invoke('templates:import',payload),
    delete: (id:string) => ipcRenderer.invoke('templates:delete',id),
  },
  documents: {
    build: (paperId:string,kind:'paper'|'answers') => ipcRenderer.invoke('documents:build',paperId,kind),
    saveWord: (paperId:string,kind:'paper'|'answers') => ipcRenderer.invoke('documents:save-word',paperId,kind),
    package: (payload:{paperId:string;paperHtml:string;answersHtml:string}) => ipcRenderer.invoke('documents:package',payload),
    output: (payload:{name:string;html:string;format:'pdf'|'print';pageWidth:number;pageHeight:number}) => ipcRenderer.invoke('documents:output',payload),
  },
  exams: {
    start: (attempt: ExamAttemptRecord) => ipcRenderer.invoke('exams:start', attempt),
    answer: (answer: ExamAnswerRecord) => ipcRenderer.invoke('exams:answer', answer),
    finish: (attempt: ExamAttemptRecord) => ipcRenderer.invoke('exams:finish', attempt),
  },
  practice: {
    record: (record: PracticeRecord) => ipcRenderer.invoke('practice:record', record),
  },
  wrong: {
    list: (): Promise<string[]> => ipcRenderer.invoke('wrong:list'),
    upsert: (questionId: string) => ipcRenderer.invoke('wrong:upsert', questionId),
    remove: (questionId: string) => ipcRenderer.invoke('wrong:remove', questionId),
  },
  assets: {
    import: (payload: { assetType: 'audio' | 'image'; name: string; mimeType: string; bytes: ArrayBuffer; durationMs?: number }) => ipcRenderer.invoke('assets:import', payload),
    url: (id: string) => `musicbank-asset://${encodeURIComponent(id)}`,
    updateDuration: (id: string, durationMs: number) => ipcRenderer.invoke('assets:update-duration', id, durationMs),
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: (password: string) => ipcRenderer.invoke('backup:import', password),
  },
  system: {
    isDesktop: true,
    profile: (): Promise<UserProfile | null> => ipcRenderer.invoke('system:profile'),
    createUser: (payload: { username: string; nickname: string; password: string }): Promise<UserProfile> => ipcRenderer.invoke('system:create-user', payload),
    updateProfile: (changes: Pick<UserProfile, 'nickname' | 'userCode'>): Promise<UserProfile> => ipcRenderer.invoke('system:update-profile', changes),
    verifyPassword: (password: string): Promise<boolean> => ipcRenderer.invoke('system:verify-password', password),
    changePassword: (payload: { currentPassword: string; nextPassword: string }): Promise<boolean> => ipcRenderer.invoke('system:change-password', payload),
    resetPassword: (payload: { userCode: string; nextPassword: string }): Promise<boolean> => ipcRenderer.invoke('system:reset-password', payload),
    paths: (): Promise<{ dataRoot: string; databasePath: string; assetsPath: string }> => ipcRenderer.invoke('system:paths'),
  },
})
