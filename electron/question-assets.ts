import type { QuestionAttachment, QuestionRecord } from './types.js'
/** An explicitly empty list means all media were removed; absent lists retain old single-file questions. */
export function questionAttachments(question: Pick<QuestionRecord,'attachments'|'audioAssetId'|'imageAssetId'|'audioName'|'audioDuration'|'notationDocument'>): QuestionAttachment[] {
  if (question.attachments) return question.attachments
  const result: QuestionAttachment[] = []
  if (question.imageAssetId) result.push({id:question.imageAssetId,assetType:'image',name:'题目图片',notationDocument:question.notationDocument})
  if (question.audioAssetId) result.push({id:question.audioAssetId,assetType:'audio',name:question.audioName || '音乐片段',duration:question.audioDuration})
  return result
}

/** All resource references, including structured nodes; keep standalone media display separate. */
export function questionAssets(question:QuestionRecord):QuestionAttachment[]{
  const refs=questionAttachments(question).map(item=>({...item}))
  for(const grid of question.imageGrids||[])for(const item of grid.items)refs.push({id:item.assetId,assetType:'image',name:item.caption||'图文图片'})
  for(const item of [...question.matching?.sources||[],...question.matching?.targets||[]])if(item.assetId)refs.push({id:item.assetId,assetType:'image',name:item.text||'连线图片'})
  return [...new Map(refs.map(item=>[item.id,item])).values()]
}
