import type {ExamAnswerRecord, ExamAttemptRecord, ExamSessionRecord, PaperRecord} from '../electron/types'
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
  if(window.musicBank) return window.musicBank.exams.start(attempt)
  const sessions=localSessions(),existing=sessions.find(session=>session.attempt.id===attempt.id)
  if(existing?.attempt.status==='已交卷') throw new Error('该考试已经交卷')
  if(existing) existing.attempt=attempt
  else sessions.unshift({attempt,answers:[],paper:JSON.parse(JSON.stringify(paper))})
  write(sessions)
}
export async function saveExamResponse(answer:ExamAnswerRecord) {
  if(window.musicBank) return window.musicBank.exams.answer(answer)
  const sessions=localSessions(),session=sessions.find(session=>session.attempt.id===answer.attemptId)
  if(!session || session.attempt.status!=='进行中') throw new Error('考试不可作答')
  session.answers=session.answers.filter(item=>item.position!==answer.position).concat(answer)
  write(sessions)
}
export async function finishExam(attempt:ExamAttemptRecord,answers:ExamAnswerRecord[]) {
  if(window.musicBank) return window.musicBank.exams.finish(attempt,answers)
  const sessions=localSessions(),session=sessions.find(session=>session.attempt.id===attempt.id)
  if(!session || session.attempt.status!=='进行中') throw new Error('考试不存在或已经交卷')
  session.attempt=attempt;session.answers=answers;write(sessions)
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
