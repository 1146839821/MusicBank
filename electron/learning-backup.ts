import {candidateName} from './exam-identity.js'
import {validateCategories} from './category-catalog.js'
import type {BackupPayload} from './types.js'

/** Optional extensions keep older version-1 backups importable. Reject broken links before replacing data. */
export function validateLearningBackup(payload:BackupPayload) {
  if(payload.categories!==undefined)validateCategories(payload.categories)
  const invalid=(message:string):never=>{throw new Error(`备份学习记录无效：${message}`)}
  const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))
  const text=(value:unknown)=>typeof value==='string'&&value.length>0
  if(payload.questions.some(question=>!question||!text(question.id)) || new Set(payload.questions.map(question=>question.id)).size!==payload.questions.length)invalid('试题编号缺失或重复')
  if(payload.papers.some(paper=>!paper||!text(paper.id)) || new Set(payload.papers.map(paper=>paper.id)).size!==payload.papers.length)invalid('试卷编号缺失或重复')
  const questionIds=new Set(payload.questions.map(question=>question.id))
  const papers=new Map(payload.papers.map(paper=>[paper.id,paper]))
  if(payload.exams!==undefined){
    if(!Array.isArray(payload.exams))invalid('考试列表')
    const ids=new Set<string>()
    for(const session of payload.exams){
      const attempt=session?.attempt
      if(!attempt||!text(attempt.id)||ids.has(attempt.id))invalid('考试编号缺失或重复')
      candidateName(attempt.candidateName)
      ids.add(attempt.id)
      const paper=papers.get(attempt.paperId)
      if(!paper)invalid('考试关联的试卷不存在')
      if(!['进行中','已交卷'].includes(attempt.status)||!date(attempt.startedAt)||!Number.isSafeInteger(attempt.remainingSeconds)||attempt.remainingSeconds<0)invalid('考试状态或时间')
      if(attempt.status==='已交卷'&&!date(attempt.submittedAt))invalid('交卷时间')
      if(!Array.isArray(session.answers))invalid('答卷列表')
      const positions=new Set<number>()
      for(const answer of session.answers){
        const item=paper!.items.find(item=>item.position===answer?.position)
        if(!answer||answer.attemptId!==attempt.id||!Number.isSafeInteger(answer.position)||!item||positions.has(answer.position))invalid('答卷题号或关联')
        positions.add(answer.position)
        if(answer.answer!==undefined&&typeof answer.answer!=='string')invalid('学生答案')
        if(answer.comment!==undefined&&typeof answer.comment!=='string')invalid('评语')
        if(answer.reviewStatus!==undefined&&!['已评分','待批阅'].includes(answer.reviewStatus))invalid('批阅状态')
        if(answer.score!==undefined&&(!Number.isFinite(answer.score)||answer.score<0||answer.score>item!.score))invalid('题目得分')
        if(answer.reviewStatus==='已评分'&&answer.score===undefined)invalid('评分缺失')
      }
      if(attempt.status==='已交卷'&&positions.size!==paper!.items.length)invalid('已交卷答卷不完整')
    }
  }
  if(payload.practiceRecords!==undefined){
    if(!Array.isArray(payload.practiceRecords))invalid('练习列表')
    for(const record of payload.practiceRecords){
      if(!record||!questionIds.has(record.questionId)||typeof record.answer!=='string'||!['correct','wrong','pending'].includes(record.result)||!date(record.createdAt))invalid('练习内容或关联')
    }
  }
  if(payload.wrongRecords!==undefined){
    if(!Array.isArray(payload.wrongRecords))invalid('错题列表')
    const ids=new Set<string>()
    for(const record of payload.wrongRecords){
      if(!record||!questionIds.has(record.questionId)||ids.has(record.questionId)||!Number.isSafeInteger(record.wrongCount)||record.wrongCount<1||typeof record.mastered!=='boolean'||!date(record.lastWrongAt))invalid('错题统计或关联')
      ids.add(record.questionId)
    }
    const active=payload.wrongRecords.filter(record=>!record.mastered).map(record=>record.questionId)
    if(active.length!==payload.wrongQuestionIds.length||payload.wrongQuestionIds.some(id=>!active.includes(id)))invalid('错题列表与统计不一致')
  }
}
