import JSZip from 'jszip'
import { questionAttachments } from './question-assets.js'
import type { AssetRecord, PaperRecord } from './types.js'

export async function buildPaperPackage(paper: PaperRecord, documents: {
  paperWord: Uint8Array; answersWord: Uint8Array; paperPdf: Uint8Array; answersPdf: Uint8Array
}, resolveAudio: (id: string) => Promise<{ record: AssetRecord; bytes: Uint8Array }>) {
  const zip = new JSZip()
  for (const [name, bytes] of Object.entries({
    '试题.docx': documents.paperWord, '参考答案.docx': documents.answersWord,
    '试题.pdf': documents.paperPdf, '参考答案.pdf': documents.answersPdf,
  })) {
    if (!bytes.length) throw new Error(`导出文档为空：${name}`)
    zip.file(name, bytes)
  }
  const stored = new Map<string, string>()
  const manifest: Array<{ questionNumber: number; questionId: string; audioNumber: string; name: string; file: string }> = []
  for (const item of paper.items) {
    const audio = questionAttachments(item.snapshot).filter(asset => asset.assetType === 'audio')
    if (item.snapshot.hasAudio && !audio.length) throw new Error(`第 ${item.position} 题缺少音频，请重新插入后组卷`)
    for (const [index, attachment] of audio.entries()) {
      let file = stored.get(attachment.id)
      if (!file) {
        const { record, bytes } = await resolveAudio(attachment.id)
        const extension = /\.(mp3|wav)$/i.exec(record.originalName)?.[1].toLowerCase()
        if (record.assetType !== 'audio' || !extension || !bytes.length || bytes.length !== record.fileSize) throw new Error(`音频文件无效：${attachment.name}`)
        file = `audio/music_${String(stored.size + 1).padStart(3, '0')}.${extension}`
        zip.file(file, bytes)
        stored.set(attachment.id, file)
      }
      manifest.push({ questionNumber: item.position, questionId: item.questionId,
        audioNumber: `${item.position}-${index + 1}`, name: attachment.name, file })
    }
  }
  zip.file('音频清单.json', JSON.stringify({ version: 1, paperId: paper.id, paperName: paper.name, audio: manifest }, null, 2))
  zip.file('使用说明.txt', `MusicBank 离线试卷资源包\n\n试题与参考答案分别提供 Word 和 PDF。\n文档中的听音材料编号与“音频清单.json”的 audioNumber 对应。\n请按清单打开 audio 文件夹中的原始音频，由监考教师统一播放。\n同一音频被多题引用时仅保存一份，清单保留全部题目对应关系。\n所有内容均可离线使用，Word/PDF 本身不包含可播放的音频。\n`)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
