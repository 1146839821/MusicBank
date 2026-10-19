import type { QuestionAttachment, QuestionRecord } from './types.js'
/** An explicitly empty list means all media were removed; absent lists retain old single-file questions. */
export function questionAttachments(question: Pick<QuestionRecord,'attachments'|'audioAssetId'|'imageAssetId'|'audioName'|'audioDuration'|'notationDocument'>): QuestionAttachment[] {
  if (question.attachments) return question.attachments
  const result: QuestionAttachment[] = []
  if (question.imageAssetId) result.push({id:question.imageAssetId,assetType:'image',name:'题目图片',notationDocument:question.notationDocument})
  if (question.audioAssetId) result.push({id:question.audioAssetId,assetType:'audio',name:question.audioName || '音乐片段',duration:question.audioDuration})
  return result
}
