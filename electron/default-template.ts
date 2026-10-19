import { inspectTemplate } from './paper-documents.js'
import type { PaperTemplateRecord } from './types.js'
export const DEFAULT_TEMPLATE_ID = 'musicbank-default-exam-template-v1'
export const DEFAULT_TEMPLATE_NAME = '试卷模板.docx'
export async function createDefaultTemplate(bytes: Uint8Array): Promise<PaperTemplateRecord> {
  return { id: DEFAULT_TEMPLATE_ID, name: DEFAULT_TEMPLATE_NAME, importedAt: new Date().toISOString(), fileSize: bytes.byteLength, summary: await inspectTemplate(bytes) }
}
export async function ensureDefaultTemplate(store: {
  listTemplates(includeArchived: boolean): PaperTemplateRecord[]
  saveTemplate(record: PaperTemplateRecord, bytes: Uint8Array): unknown
}, load: () => Uint8Array) {
  if (store.listTemplates(true).some(record => record.id === DEFAULT_TEMPLATE_ID)) return
  const bytes = load()
  store.saveTemplate(await createDefaultTemplate(bytes), bytes)
}
