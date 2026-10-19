import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MusicBankDatabase } from '../electron/db'
import { musicCategories } from '../electron/music-categories'

it('initializes all 13 categories and their children without duplicating them on restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'musicbank-categories-'))
  try {
    const first = new MusicBankDatabase(root)
    const databasePath = first.databasePath
    expect(first.listQuestions()).toEqual([])
    first.close()
    const second = new MusicBankDatabase(root)
    second.close()
    const raw = new Database(databasePath, { readonly: true })
    try {
      const parents = raw.prepare('SELECT id, name FROM categories WHERE parent_id IS NULL').all() as { id: number; name: string }[]
      expect(parents).toHaveLength(13)
      expect(parents.map((category) => category.name).sort()).toEqual(Object.keys(musicCategories).sort())
      for (const category of parents) {
        const children = raw.prepare('SELECT name FROM categories WHERE parent_id = ?').all(category.id) as { name: string }[]
        expect(children.map((child) => child.name).sort()).toEqual([...musicCategories[category.name]].sort())
      }
    } finally { raw.close() }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
