import Database from 'better-sqlite3'
import { questionAttachments } from './question-assets.js'
import { musicCategories } from './music-categories.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { BackupPayload, AssetRecord, ExamAnswerRecord, ExamAttemptRecord, PaperRecord, PracticeRecord, QuestionRecord, UserProfile, PaperTemplateRecord } from './types.js'

type QuestionRow = Omit<QuestionRecord, 'updated' | 'hasAudio' | 'hasImage' | 'options' | 'correctAnswer' | 'fillAnswers' | 'referenceAnswer' | 'audioName' | 'audioDuration' | 'audioAssetId' | 'imageAssetId'> & {
  updated_at: string
  options_json?: string
  correct_answer?: string
  fill_answers_json?: string
  reference_answer?: string
  audio_name?: string
  audio_duration?: string
  audio_asset_id?: string
  image_asset_id?: string
  attachments_json?: string
  title_runs_json?: string
  notation_json?: string
  answer_mode?: 'single' | 'multiple'
  has_audio?: number
  has_image?: number
}

export class MusicBankDatabase {
  readonly root: string
  readonly databasePath: string
  readonly assetsPath: string
  readonly audioPath: string
  readonly imagePath: string
  private readonly db: Database.Database

  constructor(userDataPath: string) {
    this.root = join(userDataPath, 'data')
    this.databasePath = join(this.root, 'database', 'music_questions.db')
    this.assetsPath = join(this.root, 'assets')
    this.audioPath = join(this.assetsPath, 'audio')
    this.imagePath = join(this.assetsPath, 'images')
    mkdirSync(join(this.root, 'database'), { recursive: true })
    mkdirSync(this.audioPath, { recursive: true })
    mkdirSync(this.imagePath, { recursive: true })
    this.db = new Database(this.databasePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS grades (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, UNIQUE(parent_id, name));
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, grade TEXT NOT NULL, category TEXT NOT NULL, subcategory TEXT,
        type TEXT NOT NULL CHECK(type IN ('选择题','填空题','判断题','简答题')), status TEXT NOT NULL CHECK(status IN ('已发布','草稿')),
        difficulty TEXT NOT NULL, source TEXT, options_json TEXT, correct_answer TEXT, fill_answers_json TEXT,
        reference_answer TEXT, explanation TEXT, audio_name TEXT, audio_duration TEXT, audio_asset_id TEXT, answer_mode TEXT,
        image_asset_id TEXT, notation_json TEXT, has_audio INTEGER NOT NULL DEFAULT 0, has_image INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_questions_filters ON questions(status, grade, category, type);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, asset_type TEXT NOT NULL CHECK(asset_type IN ('audio','image')), original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT,
        duration_ms INTEGER, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS question_asset_refs (
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
        role TEXT NOT NULL, PRIMARY KEY(question_id, asset_id, role)
      );
      CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY, name TEXT NOT NULL, grade TEXT, total_score REAL NOT NULL, duration_minutes INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS paper_items (paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE, position INTEGER NOT NULL, question_id TEXT, score REAL NOT NULL, snapshot_json TEXT NOT NULL, PRIMARY KEY(paper_id, position));
      CREATE TABLE IF NOT EXISTS paper_asset_refs (paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT, PRIMARY KEY(paper_id, asset_id));
      CREATE TABLE IF NOT EXISTS exam_attempts (id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id), status TEXT NOT NULL, started_at TEXT NOT NULL, submitted_at TEXT, remaining_seconds INTEGER);
      CREATE TABLE IF NOT EXISTS exam_answers (attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE, position INTEGER NOT NULL, answer_json TEXT, score REAL, review_status TEXT, comment TEXT, PRIMARY KEY(attempt_id, position));
      CREATE TABLE IF NOT EXISTS practice_records (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id TEXT NOT NULL REFERENCES questions(id), answer_json TEXT, result TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wrong_questions (question_id TEXT PRIMARY KEY REFERENCES questions(id), wrong_count INTEGER NOT NULL DEFAULT 1, mastered INTEGER NOT NULL DEFAULT 0, last_wrong_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS paper_templates (id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL, bytes BLOB NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    `)
    for (const statement of ['ALTER TABLE questions ADD COLUMN attachments_json TEXT', 'ALTER TABLE questions ADD COLUMN title_runs_json TEXT', 'ALTER TABLE questions ADD COLUMN notation_json TEXT', 'ALTER TABLE questions ADD COLUMN has_audio INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE questions ADD COLUMN has_image INTEGER NOT NULL DEFAULT 0', "ALTER TABLE questions ADD COLUMN answer_mode TEXT NOT NULL DEFAULT 'single'"]) {
      try { this.db.exec(statement) } catch { /* existing database already has the column */ }
    }
    // Rebuild with foreign keys disabled outside the transaction, retaining all dependent rows.
    const schema = (this.db.prepare("SELECT sql FROM sqlite_master WHERE name='questions'").get() as {sql:string}).sql
    if (!schema.includes("'判断题'")) {
      this.db.pragma('foreign_keys = OFF')
      try {
        this.db.transaction(() => {
          this.db.exec(schema.replace(/^CREATE TABLE\s+(?:"questions"|questions)/i, 'CREATE TABLE questions_next').replace("'填空题','简答题'", "'填空题','判断题','简答题'"))
          this.db.exec('INSERT INTO questions_next SELECT * FROM questions; DROP TABLE questions; ALTER TABLE questions_next RENAME TO questions; CREATE INDEX idx_questions_filters ON questions(status,grade,category,type);')
          if ((this.db.pragma('foreign_key_check') as unknown[]).length) throw new Error('题型升级校验失败')
        })()
      } finally { this.db.pragma('foreign_keys = ON') }
    }
    this.seedReferenceData()
  }

  private seedReferenceData() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM grades').get() as { count: number }
    if (!count.count) {
      const insert = this.db.prepare('INSERT INTO grades(name) VALUES (?)')
      this.db.transaction(() => ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'].forEach((grade) => insert.run(grade)))()
    }
    this.db.transaction(() => {
      const find = this.db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL')
      const insert = this.db.prepare('INSERT INTO categories(parent_id,name) VALUES (?,?)')
      const findChild = this.db.prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?')
      for (const [name, children] of Object.entries(musicCategories)) {
        const existing = find.get(name) as { id: number } | undefined
        const id = existing?.id ?? Number(insert.run(null, name).lastInsertRowid)
        for (const child of children) if (!findChild.get(id, child)) insert.run(id, child)
      }
    })()
  }


  getUserProfile(): UserProfile | null {
    const profile = this.getSetting<UserProfile>('user.profile')
    return profile && profile.username && profile.nickname && profile.userCode ? profile : null
  }

  createUser(username: string, nickname: string, password: string): UserProfile {
    if (this.getUserProfile()) throw new Error('用户已初始化')
    const profile: UserProfile = { username, nickname, userCode: `MB-${randomBytes(3).toString('hex').toUpperCase()}` }
    this.setSetting('user.profile', profile)
    this.setPassword(password)
    return profile
  }

  updateUserProfile(changes: Pick<UserProfile, 'nickname' | 'userCode'>): UserProfile {
    const profile = this.getUserProfile()
    if (!profile) throw new Error('请先建立用户')
    const updated = { ...profile, ...changes }
    this.setSetting('user.profile', updated)
    return updated
  }

  changePassword(currentPassword: string, nextPassword: string) {
    if (!this.verifyPassword(currentPassword)) throw new Error('当前密码不正确')
    this.setPassword(nextPassword)
  }

  resetPassword(userCode: string, nextPassword: string) {
    const profile = this.getUserProfile()
    if (!profile || profile.userCode !== userCode) throw new Error('用户编码不正确')
    this.setPassword(nextPassword)
  }

  verifyPassword(password: string) {
    const stored = this.getSetting<{ salt: string; hash: string }>('user.password')
    if (!stored?.salt || !stored.hash) return false
    const actual = scryptSync(password, Buffer.from(stored.salt, 'base64'), 32)
    const expected = Buffer.from(stored.hash, 'base64')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  private setPassword(password: string) {
    const salt = randomBytes(16)
    const hash = scryptSync(password, salt, 32)
    this.setSetting('user.password', { salt: salt.toString('base64'), hash: hash.toString('base64') })
  }

  private getSetting<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value_json AS valueJson FROM system_settings WHERE key = ?').get(key) as { valueJson?: string } | undefined
    if (!row?.valueJson) return null
    try { return JSON.parse(row.valueJson) as T } catch { return null }
  }

  private setSetting(key: string, value: unknown) {
    this.db.prepare('INSERT INTO system_settings(key,value_json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key, JSON.stringify(value))
  }

  listQuestions(): QuestionRecord[] {
    const rows = this.db.prepare('SELECT * FROM questions ORDER BY updated_at DESC').all() as QuestionRow[]
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      attachments: row.attachments_json ? JSON.parse(row.attachments_json) : undefined,
      titleRuns: row.title_runs_json ? JSON.parse(row.title_runs_json) : undefined,
      grade: row.grade,
      category: row.category,
      subcategory: row.subcategory,
      type: row.type,
      status: row.status,
      hasAudio: Boolean(row.has_audio || row.audio_asset_id),
      hasImage: Boolean(row.has_image || row.image_asset_id),
      updated: formatUpdated(row.updated_at),
      difficulty: row.difficulty,
      source: row.source,
      options: row.options_json ? JSON.parse(row.options_json) : undefined,
      correctAnswer: row.correct_answer,
      answerMode: row.answer_mode === 'multiple' ? 'multiple' : 'single',
      fillAnswers: row.fill_answers_json ? JSON.parse(row.fill_answers_json) : undefined,
      referenceAnswer: row.reference_answer,
      explanation: row.explanation,
      audioName: row.audio_name,
      audioDuration: row.audio_duration,
      audioAssetId: row.audio_asset_id,
      imageAssetId: row.image_asset_id,
      notationDocument: row.notation_json,
    }))
  }

  saveQuestion(question: QuestionRecord) {
    if (question.type === '判断题' && !['true','false'].includes(question.correctAnswer || '')) throw new Error('判断题必须选择正确或错误作为标准答案')
    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO questions (id,title,attachments_json,title_runs_json,grade,category,subcategory,type,status,difficulty,source,options_json,correct_answer,answer_mode,fill_answers_json,reference_answer,explanation,audio_name,audio_duration,audio_asset_id,image_asset_id,notation_json,has_audio,has_image,created_at,updated_at)
        VALUES (@id,@title,@attachments_json,@title_runs_json,@grade,@category,@subcategory,@type,@status,@difficulty,@source,@options_json,@correct_answer,@answer_mode,@fill_answers_json,@reference_answer,@explanation,@audio_name,@audio_duration,@audio_asset_id,@image_asset_id,@notation_json,@has_audio,@has_image,COALESCE((SELECT created_at FROM questions WHERE id=@id),@now),@now)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,attachments_json=excluded.attachments_json,title_runs_json=excluded.title_runs_json,grade=excluded.grade,category=excluded.category,subcategory=excluded.subcategory,type=excluded.type,status=excluded.status,difficulty=excluded.difficulty,source=excluded.source,options_json=excluded.options_json,correct_answer=excluded.correct_answer,answer_mode=excluded.answer_mode,fill_answers_json=excluded.fill_answers_json,reference_answer=excluded.reference_answer,explanation=excluded.explanation,audio_name=excluded.audio_name,audio_duration=excluded.audio_duration,audio_asset_id=excluded.audio_asset_id,image_asset_id=excluded.image_asset_id,notation_json=excluded.notation_json,has_audio=excluded.has_audio,has_image=excluded.has_image,updated_at=excluded.updated_at`).run({
        ...question,
        attachments_json: question.attachments ? JSON.stringify(question.attachments) : null,
        title_runs_json: question.titleRuns ? JSON.stringify(question.titleRuns) : null,
        subcategory: question.subcategory || null,
        source: question.source || null,
        options_json: question.options ? JSON.stringify(question.options) : null,
        fill_answers_json: question.fillAnswers ? JSON.stringify(question.fillAnswers) : null,
        correct_answer: question.correctAnswer || null,
        answer_mode: question.answerMode || 'single',
        reference_answer: question.referenceAnswer || null,
        explanation: question.explanation || null,
        audio_name: question.audioName || null,
        audio_duration: question.audioDuration || null,
        audio_asset_id: question.audioAssetId || null,
        image_asset_id: question.imageAssetId || null,
        notation_json: question.notationDocument || null,
        has_audio: question.hasAudio ? 1 : 0,
        has_image: question.hasImage ? 1 : 0,
        now,
      })
      this.db.prepare('DELETE FROM question_asset_refs WHERE question_id = ?').run(question.id)
      const addRef = this.db.prepare('INSERT OR IGNORE INTO question_asset_refs(question_id, asset_id, role) VALUES (?, ?, ?)')
      for (const item of questionAttachments(question)) addRef.run(question.id, item.id, item.assetType === 'audio' ? 'question-audio' : 'question-image')
    })
    tx()
    return question
  }

  deleteQuestion(id: string) {
    this.db.prepare('DELETE FROM questions WHERE id = ?').run(id)
  }

  savePaper(paper: PaperRecord) {
    const tx = this.db.transaction(() => {
      this.db.prepare('INSERT INTO papers(id,name,grade,total_score,duration_minutes,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,grade=excluded.grade,total_score=excluded.total_score,duration_minutes=excluded.duration_minutes,snapshot_json=excluded.snapshot_json').run(paper.id, paper.name, paper.grade, paper.totalScore, paper.durationMinutes, JSON.stringify({ seed: paper.seed, items: paper.items, templateId: paper.templateId, templateSummary: paper.templateSummary, examInfo: paper.examInfo }), new Date().toISOString())
      this.db.prepare('DELETE FROM paper_items WHERE paper_id = ?').run(paper.id)
      const insert = this.db.prepare('INSERT INTO paper_items(paper_id,position,question_id,score,snapshot_json) VALUES (?,?,?,?,?)')
      for (const item of paper.items) insert.run(paper.id, item.position, item.questionId, item.score, JSON.stringify(item.snapshot))
    })
    tx()
    return paper.id
  }

  listPapers(): PaperRecord[] {
    const rows = this.db.prepare('SELECT id,name,grade,total_score AS totalScore,duration_minutes AS durationMinutes,snapshot_json AS snapshotJson FROM papers ORDER BY created_at DESC').all() as Array<{ id: string; name: string; grade: string; totalScore: number; durationMinutes: number; snapshotJson: string }>
    return rows.map((row) => {
      const snapshot = JSON.parse(row.snapshotJson) as Pick<PaperRecord, 'seed' | 'items' | 'templateId' | 'templateSummary' | 'examInfo'>
      return { id: row.id, name: row.name, grade: row.grade, totalScore: row.totalScore, durationMinutes: row.durationMinutes, seed: snapshot.seed, items: snapshot.items, templateId: snapshot.templateId, templateSummary: snapshot.templateSummary, examInfo: snapshot.examInfo }
    })
  }

  saveTemplate(record: PaperTemplateRecord, bytes: Uint8Array) {
    if (!record.id || record.fileSize !== bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error('无效的试卷模板')
    this.db.prepare('INSERT INTO paper_templates(id,metadata_json,bytes,archived) VALUES (?,?,?,?)').run(record.id, JSON.stringify(record), Buffer.from(bytes), record.archived ? 1 : 0)
    return record
  }
  listTemplates(includeArchived = false): PaperTemplateRecord[] {
    return (this.db.prepare(`SELECT metadata_json,archived FROM paper_templates ${includeArchived ? '' : 'WHERE archived=0'} ORDER BY rowid DESC`).all() as {metadata_json:string;archived:number}[]).map(row => ({...JSON.parse(row.metadata_json),archived:Boolean(row.archived)}))
  }
  templateBytes(id: string): Buffer {
    const row = this.db.prepare('SELECT bytes FROM paper_templates WHERE id=?').get(id) as {bytes:Buffer}|undefined
    if (!row) throw new Error('试卷模板不存在，请重新选择模板')
    return row.bytes
  }
  archiveTemplate(id: string) { this.db.prepare('UPDATE paper_templates SET archived=1 WHERE id=?').run(id) }

  listAssets(): AssetRecord[] {
    return this.db.prepare('SELECT id, asset_type AS assetType, original_name AS originalName, stored_name AS storedName, mime_type AS mimeType, file_size AS fileSize, sha256, duration_ms AS durationMs FROM assets ORDER BY created_at').all() as AssetRecord[]
  }

  restoreBackupRecords(payload: BackupPayload) {
    this.db.transaction(() => {
      this.clearAllData()
      for (const item of payload.templates || []) this.saveTemplate(item.record, Buffer.from(item.bytesBase64, 'base64'))
      for (const item of payload.assets) this.saveAsset(item.record)
      for (const question of payload.questions) this.saveQuestion(question)
      for (const paper of payload.papers) this.savePaper(paper)
      for (const id of payload.wrongQuestionIds) this.upsertWrongQuestion(id)
    })()
  }

  clearAllData() {
    const tx = this.db.transaction(() => {
      this.db.exec('DELETE FROM exam_answers; DELETE FROM exam_attempts; DELETE FROM practice_records; DELETE FROM wrong_questions; DELETE FROM paper_asset_refs; DELETE FROM paper_items; DELETE FROM papers; DELETE FROM question_asset_refs; DELETE FROM questions; DELETE FROM assets; DELETE FROM paper_templates;')
    })
    tx()
  }

  deletePaper(id: string) {
    this.db.prepare('DELETE FROM papers WHERE id = ?').run(id)
  }

  saveExamAttempt(attempt: ExamAttemptRecord) {
    this.db.prepare(`INSERT INTO exam_attempts(id,paper_id,status,started_at,submitted_at,remaining_seconds)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,submitted_at=excluded.submitted_at,remaining_seconds=excluded.remaining_seconds`)
      .run(attempt.id, attempt.paperId, attempt.status, attempt.startedAt, attempt.submittedAt || null, attempt.remainingSeconds)
    return attempt
  }

  saveExamAnswer(answer: ExamAnswerRecord) {
    this.db.prepare(`INSERT INTO exam_answers(attempt_id,position,answer_json,score,review_status,comment)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(attempt_id,position) DO UPDATE SET answer_json=excluded.answer_json,score=excluded.score,review_status=excluded.review_status,comment=excluded.comment`)
      .run(answer.attemptId, answer.position, answer.answer == null ? null : JSON.stringify(answer.answer), answer.score ?? null, answer.reviewStatus || null, answer.comment || null)
    return answer
  }

  savePracticeRecord(record: PracticeRecord) {
    this.db.prepare('INSERT INTO practice_records(question_id,answer_json,result,created_at) VALUES (?,?,?,?)')
      .run(record.questionId, JSON.stringify(record.answer), record.result, new Date().toISOString())
  }

  upsertWrongQuestion(questionId: string) {
    this.db.prepare(`INSERT INTO wrong_questions(question_id,wrong_count,mastered,last_wrong_at)
      VALUES (?,1,0,?)
      ON CONFLICT(question_id) DO UPDATE SET wrong_count=wrong_count+1,mastered=0,last_wrong_at=excluded.last_wrong_at`)
      .run(questionId, new Date().toISOString())
  }

  removeWrongQuestion(questionId: string) {
    this.db.prepare('DELETE FROM wrong_questions WHERE question_id = ?').run(questionId)
  }

  listWrongQuestionIds() {
    return (this.db.prepare('SELECT question_id AS questionId FROM wrong_questions WHERE mastered = 0 ORDER BY last_wrong_at DESC').all() as Array<{ questionId: string }>).map((row) => row.questionId)
  }

  updateAssetDuration(id: string, durationMs: number) {
    this.db.prepare('UPDATE assets SET duration_ms = ? WHERE id = ?').run(durationMs, id)
  }

  findAsset(id: string): AssetRecord | undefined {
    return this.db.prepare('SELECT id, asset_type AS assetType, original_name AS originalName, stored_name AS storedName, mime_type AS mimeType, file_size AS fileSize, duration_ms AS durationMs FROM assets WHERE id = ?').get(id) as AssetRecord | undefined
  }

  saveAsset(record: AssetRecord) {
    this.db.prepare('INSERT INTO assets(id,asset_type,original_name,stored_name,mime_type,file_size,sha256,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(record.id, record.assetType, record.originalName, record.storedName, record.mimeType, record.fileSize, record.sha256 || null, record.durationMs || null, new Date().toISOString())
    return record
  }

  close() { this.db.close() }
}

function formatUpdated(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function createAssetRecord(assetType: AssetRecord['assetType'], originalName: string, mimeType: string, fileSize: number, durationMs?: number): AssetRecord {
  const id = randomUUID()
  const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase() : ''
  return { id, assetType, originalName, storedName: `${id}${extension}`, mimeType, fileSize, durationMs }
}
