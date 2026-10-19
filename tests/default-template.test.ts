import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MusicBankDatabase } from '../electron/db'
import { ensureDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../electron/default-template'
it('installs the shipped Word template in the normal template store once without test questions or resurrecting removed templates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'musicbank-default-'))
  const db = new MusicBankDatabase(root)
  try {
    const bytes = readFileSync(new URL('../public/templates/试卷模板.docx', import.meta.url))
    let reads = 0
    const load = () => { reads++; return bytes }
    await ensureDefaultTemplate(db, load)
    await ensureDefaultTemplate(db, load)
    expect(reads).toBe(1)
    expect(db.listTemplates()).toHaveLength(1)
    expect(db.listTemplates()[0].summary.sectionOrder).toEqual(['填空题','选择题','判断题','简答题'])
    expect(db.templateBytes(DEFAULT_TEMPLATE_ID)).toEqual(bytes)
    expect(db.listQuestions()).toEqual([])
    db.archiveTemplate(DEFAULT_TEMPLATE_ID)
    await ensureDefaultTemplate(db, load)
    expect(reads).toBe(1)
    expect(db.listTemplates()).toEqual([])
    expect(db.listTemplates(true)).toHaveLength(1)
  } finally { db.close(); rmSync(root, {recursive:true,force:true}) }
})
