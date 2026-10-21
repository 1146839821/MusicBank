// Run by the shipped Electron executable with ELECTRON_RUN_AS_NODE=1.
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const archive = resolve(process.argv[2])
  const { MusicBankDatabase } = await import(pathToFileURL(join(archive, 'dist-electron/db.js')).href)
  const root = mkdtempSync(join(tmpdir(), 'musicbank-package-smoke-'))
  let db
  try {
    db = new MusicBankDatabase(root)
    if (db.listQuestions().length || db.listPapers().length || db.listExamSessions().length) {
      throw Error('Fresh application database must not contain sample questions or exams')
    }
    const matching = {
      version: 1, scoring: 'per-pair',
      sources: [0, 1].map(order => ({ id: `s${order}`, order, contentType: 'text', text: `Instrument ${order}` })),
      targets: [0, 1].map(order => ({ id: `t${order}`, order, contentType: 'text', text: `Name ${order}` })),
      pairs: [{ sourceId: 's0', targetId: 't0' }, { sourceId: 's1', targetId: 't1' }],
      targetOrder: ['t1', 't0'],
    }
    const question = { id: 'smoke', title: 'Packaged matching smoke test', type: '连线题', grade: '三年级', category: '乐器', status: '已发布', difficulty: '基础', updated: '刚刚', hasAudio: false, hasImage: false, matching }
    db.saveQuestion(question)
    db.savePaper({ id: 'paper', name: 'Package smoke', grade: '三年级', totalScore: 2, durationMinutes: 10, items: [{ position: 1, questionId: question.id, score: 2, snapshot: question }] })
    const attempt = { id: 'attempt', paperId: 'paper', status: '进行中', startedAt: new Date().toISOString(), remainingSeconds: 600 }
    db.saveExamAttempt(attempt)
    db.finishExam(attempt, [{ attemptId: attempt.id, position: 1, answer: JSON.stringify({ version: 1, pairs: matching.pairs.slice(0, 1) }), score: 2 }])
    db.deleteQuestion(question.id)
    db.close()
    db = new MusicBankDatabase(root)
    const [session] = db.listExamSessions()
    if (db.listQuestions().length || session?.answers[0]?.score !== 1 || session.attempt.status !== '已交卷'
      || JSON.stringify(session.paper.items[0].snapshot.matching) !== JSON.stringify(matching)) {
      throw Error('Packaged database migration, matching score or historical snapshot round trip failed')
    }
    console.log('musicbank-application-db-ok')
  } finally {
    try { db?.close() } finally { rmSync(root, { recursive: true, force: true }) }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
