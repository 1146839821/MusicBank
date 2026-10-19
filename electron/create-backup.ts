import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import type {MusicBankDatabase} from './db.js'
import type {BackupPayload} from './types.js'
import {verifyBackupAssetBytes} from './backup-validation.js'
import {validateLearningBackup} from './learning-backup.js'

export function createBackup(database:MusicBankDatabase):BackupPayload {
  const assets=database.listAssets().map(record=>{
    const folder=record.assetType==='audio'?database.audioPath:database.imagePath
    let bytes:Buffer
    try{bytes=readFileSync(join(folder,record.storedName))}
    catch{throw new Error(`素材文件缺失，备份已取消：${record.originalName}`)}
    verifyBackupAssetBytes(record,bytes)
    return {record,bytesBase64:bytes.toString('base64')}
  })
  const payload:BackupPayload={
    format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questionSequence:database.questionSequence(),
    categories:database.listCategories(),questions:database.listQuestions(),papers:database.listPapers(),wrongQuestionIds:database.listWrongQuestionIds(),assets,
    templates:database.listTemplates(true).map(record=>({record,bytesBase64:database.templateBytes(record.id).toString('base64')})),
    exams:database.listExamSessions().map(({attempt,answers})=>({attempt,answers})),
    practiceRecords:database.listPracticeRecords(),wrongRecords:database.listWrongQuestionRecords(),
  }
  validateLearningBackup(payload)
  return payload
}
