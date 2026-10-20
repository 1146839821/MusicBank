import {matchingScore,validateMatchingAnswer} from '../electron/matching'
import type {ExamAnswerRecord, ExamAttemptRecord, ExamSessionRecord, PaperRecord} from '../electron/types'
import {candidateName} from '../electron/exam-identity'
const key='musicbank.exam-sessions'
function localSessions():ExamSessionRecord[] {
  const raw=localStorage.getItem(key)
  if (!raw) return []
  const value=JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error('考试记录格式错误')
  return value
}
function write(sessions:ExamSessionRecord[]) {localStorage.setItem(key,JSON.stringify(sessions))}
export async function listExamSessions() {return window.musicBank ? window.musicBank.exams.list() : localSessions()}
export async function saveExamProgress(attempt:ExamAttemptRecord,paper:PaperRecord) {
  attempt={...attempt,candidateName:candidateName(attempt.candidateName)}
  if(window.musicBank) return window.musicBank.exams.start(attempt)
  const sessions=localSessions(),existing=sessions.find(session=>session.attempt.id===attempt.id)
  if(existing?.attempt.status==='已交卷') throw new Error('该考试已经交卷')
  if(existing&&(existing.attempt.paperId!==attempt.paperId||existing.attempt.startedAt!==attempt.startedAt||candidateName(existing.attempt.candidateName)!==attempt.candidateName))throw new Error('考试身份与原始记录不一致')
  if(existing) existing.attempt=attempt
  else sessions.unshift({attempt,answers:[],paper:JSON.parse(JSON.stringify(paper))})
  write(sessions)
}
export async function saveExamResponse(answer:ExamAnswerRecord) {
  if(window.musicBank) return window.musicBank.exams.answer(answer)
  const sessions=localSessions(),session=sessions.find(session=>session.attempt.id===answer.attemptId)
  if(!session || session.attempt.status!=='进行中') throw new Error('考试不可作答')
  const item=session.paper.items.find(item=>item.position===answer.position)
  if(!item)throw new Error('答卷题号无效')
  if(item.snapshot.type==='连线题'&&item.snapshot.matching)validateMatchingAnswer(answer.answer,item.snapshot.matching)
  session.answers=session.answers.filter(item=>item.position!==answer.position).concat(answer)
  write(sessions)
}
export async function finishExam(attempt:ExamAttemptRecord,answers:ExamAnswerRecord[]) {
  if(window.musicBank) return window.musicBank.exams.finish(attempt,answers)
  const sessions=localSessions(),session=sessions.find(session=>session.attempt.id===attempt.id)
  if(!session || session.attempt.status!=='进行中') throw new Error('考试不存在或已经交卷')
  if(answers.length!==session.paper.items.length || answers.some((answer,index)=>answer.attemptId!==attempt.id || answer.position!==index+1)) throw new Error('答卷不完整')
  answers=answers.map(answer=>{
    const item=session.paper.items.find(item=>item.position===answer.position)
    if(!item)throw new Error('答卷题号无效')
    if(item.snapshot.type==='连线题'&&item.snapshot.matching){
      validateMatchingAnswer(answer.answer,item.snapshot.matching)
      return {...answer,score:matchingScore(answer.answer,item.snapshot.matching,item.score),reviewStatus:'已评分'}
    }
    return answer
  })
  session.attempt={...session.attempt,status:'已交卷',submittedAt:attempt.submittedAt,remainingSeconds:attempt.remainingSeconds};session.answers=answers;write(sessions)
}
export async function reviewExamAnswer(input:{attemptId:string;position:number;score:number;comment:string}) {
  if(window.musicBank) return window.musicBank.exams.review(input)
  const sessions=localSessions(),session=sessions.find(session=>session.attempt.id===input.attemptId)
  const item=session?.paper.items.find(item=>item.position===input.position)
  const answer=session?.answers.find(answer=>answer.position===input.position)
  if(!session || session.attempt.status!=='已交卷' || !item || item.snapshot.type!=='简答题' || !answer) throw new Error('只能批阅已交卷的简答题')
  if(!Number.isFinite(input.score)||input.score<0||input.score>item.score) throw new Error(`分数应在 0 至 ${item.score} 之间`)
  Object.assign(answer,{score:input.score,comment:input.comment,reviewStatus:'已评分'});write(sessions)
}
