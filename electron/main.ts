import { app, BrowserWindow, dialog, ipcMain, net, protocol, session } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isBackupAssetFilename } from './backup-validation.js'
import { MusicBankDatabase, createAssetRecord } from './db.js'
import type { AssetRecord, BackupPayload, ExamAnswerRecord, ExamAttemptRecord, PaperRecord, PracticeRecord, QuestionRecord, UserProfile } from './types.js'

protocol.registerSchemesAsPrivileged([{ scheme: 'musicbank-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

let database: MusicBankDatabase
const electronDir = dirname(fileURLToPath(import.meta.url))

function appIconPath() {
  return app.isPackaged ? join(process.resourcesPath, 'musicbank.png') : join(electronDir, '../build/icons/musicbank.png')
}

function createWindow() {
  const icon = appIconPath()
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: 'MusicBank · 乐测题库',
    icon,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(electronDir, 'preload.cjs') },
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) window.loadURL(devUrl)
  else window.loadFile(join(electronDir, '../dist/index.html'))
  return window
}

app.whenReady().then(() => {
  database = new MusicBankDatabase(app.getPath('userData'))
  protocol.handle('musicbank-asset', async (request) => {
    const id = decodeURIComponent(new URL(request.url).hostname || new URL(request.url).pathname.replace(/^\//, ''))
    const asset = database.findAsset(id)
    if (!asset) return new Response('Asset not found', { status: 404 })
    const folder = asset.assetType === 'audio' ? database.audioPath : database.imagePath
    return net.fetch(pathToFileURL(join(folder, basename(asset.storedName))).toString())
  })
  ipcMain.handle('questions:list', () => database.listQuestions())
  ipcMain.handle('questions:save', (_event, question: QuestionRecord) => database.saveQuestion(question))
  ipcMain.handle('questions:delete', (_event, id: string) => database.deleteQuestion(id))
  ipcMain.handle('papers:save', (_event, paper: PaperRecord) => database.savePaper(paper))
  ipcMain.handle('papers:list', () => database.listPapers())
  ipcMain.handle('papers:delete', (_event, id: string) => database.deletePaper(id))
  ipcMain.handle('exams:start', (_event, attempt: ExamAttemptRecord) => database.saveExamAttempt(attempt))
  ipcMain.handle('exams:answer', (_event, answer: ExamAnswerRecord) => database.saveExamAnswer(answer))
  ipcMain.handle('exams:finish', (_event, attempt: ExamAttemptRecord) => database.saveExamAttempt(attempt))
  ipcMain.handle('practice:record', (_event, record: PracticeRecord) => database.savePracticeRecord(record))
  ipcMain.handle('wrong:list', () => database.listWrongQuestionIds())
  ipcMain.handle('wrong:upsert', (_event, questionId: string) => database.upsertWrongQuestion(questionId))
  ipcMain.handle('wrong:remove', (_event, questionId: string) => database.removeWrongQuestion(questionId))
  ipcMain.handle('assets:update-duration', (_event, id: string, durationMs: number) => database.updateAssetDuration(id, durationMs))
  ipcMain.handle('backup:export', async () => {
    const result = await dialog.showSaveDialog({ title: '导出 MusicBank 备份', defaultPath: join(app.getPath('documents'), `MusicBank-备份-${new Date().toISOString().slice(0, 10)}.musicbank.json`), filters: [{ name: 'MusicBank 备份', extensions: ['musicbank.json'] }] })
    if (result.canceled || !result.filePath) return { canceled: true }
    const assets = database.listAssets().map((record) => {
      const folder = record.assetType === 'audio' ? database.audioPath : database.imagePath
      const filePath = join(folder, record.storedName)
      return { record, bytesBase64: existsSync(filePath) ? readFileSync(filePath).toString('base64') : '' }
    })
    const payload: BackupPayload = { format: 'musicbank-backup', version: 1, exportedAt: new Date().toISOString(), questions: database.listQuestions(), papers: database.listPapers(), wrongQuestionIds: database.listWrongQuestionIds(), assets }
    writeFileSync(result.filePath, JSON.stringify(payload), 'utf8')
    return { canceled: false, filePath: result.filePath, questionCount: payload.questions.length, paperCount: payload.papers.length, assetCount: payload.assets.length }
  })
  ipcMain.handle('backup:import', async (_event, password: string) => {
    if (!database.verifyPassword(String(password || ''))) throw new Error('账户密码不正确，已取消恢复')
    const result = await dialog.showOpenDialog({ title: '恢复 MusicBank 备份', properties: ['openFile'], filters: [{ name: 'MusicBank 备份', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const payload = JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as BackupPayload
    if (payload.format !== 'musicbank-backup' || payload.version !== 1 || !Array.isArray(payload.questions) || !Array.isArray(payload.papers) || !Array.isArray(payload.assets)) throw new Error('备份文件格式不受支持')
    if (!Array.isArray(payload.wrongQuestionIds) || payload.assets.some((item) => {
      const record = item?.record
      return !record || (record.assetType !== 'audio' && record.assetType !== 'image') || !isBackupAssetFilename(record.storedName) || typeof item.bytesBase64 !== 'string' || (item.bytesBase64.length % 4 !== 0) || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.bytesBase64)
    })) throw new Error('备份文件包含无效的资源数据')
    database.clearAllData()
    for (const folder of [database.audioPath, database.imagePath]) {
      for (const name of readdirSync(folder)) unlinkSync(join(folder, name))
    }
    for (const item of payload.assets) {
      const record = item.record as AssetRecord
      const folder = record.assetType === 'audio' ? database.audioPath : database.imagePath
      const storedName = basename(record.storedName)
      if (!storedName || storedName !== record.storedName) throw new Error('备份文件包含无效的资源文件名')
      if (item.bytesBase64) writeFileSync(join(folder, storedName), Buffer.from(item.bytesBase64, 'base64'))
      database.saveAsset(record)
    }
    for (const question of payload.questions) database.saveQuestion(question as QuestionRecord)
    for (const paper of payload.papers) database.savePaper(paper as PaperRecord)
    for (const questionId of payload.wrongQuestionIds || []) database.upsertWrongQuestion(questionId)
    return { canceled: false, filePath: result.filePaths[0], questionCount: payload.questions.length, paperCount: payload.papers.length, assetCount: payload.assets.length }
  })

  ipcMain.handle('system:profile', () => database.getUserProfile())
  ipcMain.handle('system:create-user', (_event, payload: { username: string; nickname: string; password: string }) => {
    const username = String(payload?.username || '').trim()
    const nickname = String(payload?.nickname || '').trim()
    const password = String(payload?.password || '')
    if (username.length < 2 || username.length > 32) throw new Error('用户名长度需为 2 至 32 个字符')
    if (nickname.length < 1 || nickname.length > 32) throw new Error('昵称长度需为 1 至 32 个字符')
    if (password.length < 6) throw new Error('密码至少需要 6 位')
    return database.createUser(username, nickname, password)
  })
  ipcMain.handle('system:update-profile', (_event, changes: Pick<UserProfile, 'nickname' | 'userCode'>) => {
    const nickname = String(changes?.nickname || '').trim()
    const userCode = String(changes?.userCode || '').trim()
    if (nickname.length < 1 || nickname.length > 32) throw new Error('昵称长度需为 1 至 32 个字符')
    if (userCode.length < 2 || userCode.length > 32) throw new Error('用户编码长度需为 2 至 32 个字符')
    return database.updateUserProfile({ nickname, userCode })
  })
  ipcMain.handle('system:verify-password', (_event, password: string) => database.verifyPassword(String(password || '')))
  ipcMain.handle('system:change-password', (_event, payload: { currentPassword: string; nextPassword: string }) => {
    const nextPassword = String(payload?.nextPassword || '')
    if (nextPassword.length < 6) throw new Error('新密码至少需要 6 位')
    database.changePassword(String(payload?.currentPassword || ''), nextPassword)
    return true
  })
  ipcMain.handle('system:reset-password', (_event, payload: { userCode: string; nextPassword: string }) => {
    const nextPassword = String(payload?.nextPassword || '')
    if (nextPassword.length < 6) throw new Error('新密码至少需要 6 位')
    database.resetPassword(String(payload?.userCode || '').trim(), nextPassword)
    return true
  })
  ipcMain.handle('system:paths', () => ({ dataRoot: database.root, databasePath: database.databasePath, assetsPath: database.assetsPath }))
  ipcMain.handle('assets:import', (_event, payload: { assetType: 'audio' | 'image'; name: string; mimeType: string; bytes: ArrayBuffer; durationMs?: number }) => {
    const bytes = Buffer.from(payload.bytes)
    const record = createAssetRecord(payload.assetType, payload.name, payload.mimeType, bytes.byteLength, payload.durationMs)
    const digest = createHash('sha256').update(bytes).digest('hex')
    const folder = record.assetType === 'audio' ? database.audioPath : database.imagePath
    writeFileSync(join(folder, record.storedName), bytes, { flag: 'wx' })
    const persistedRecord = { ...record, sha256: digest }
    database.saveAsset(persistedRecord)
    return { ...persistedRecord, url: `musicbank-asset://${encodeURIComponent(record.id)}` }
  })
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self' musicbank-asset:; img-src 'self' data: blob: musicbank-asset:; media-src 'self' blob: musicbank-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'"], } }))
  if (process.platform === 'darwin' && app.dock && existsSync(appIconPath())) app.dock.setIcon(appIconPath())
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => database?.close())
