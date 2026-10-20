<script setup lang="ts">
import {formatFillAnswers} from '../../electron/fill-answers'
import {onMounted,ref} from 'vue'
import type {ExamSessionRecord,ExamAnswerRecord} from '../../electron/types'
import {listExamSessions,reviewExamAnswer} from '../exam-store'
import QuestionText from './QuestionText.vue'
import QuestionMedia from './QuestionMedia.vue'
import {questionAttachments} from '../../electron/question-assets'
import {judgmentLabel} from '../question-answers'
const emit=defineEmits<{resume:[session:ExamSessionRecord]}>()
const sessions=ref<ExamSessionRecord[]>([]),selected=ref<ExamSessionRecord|null>(null),error=ref(''),busy=ref(false),notice=ref('')
const scores=ref<Record<number,string|number>>({}),comments=ref<Record<number,string>>({})
function total(session:ExamSessionRecord){return session.answers.reduce((sum,answer)=>sum+(answer.score||0),0)}
function pending(session:ExamSessionRecord){return session.answers.filter(answer=>answer.reviewStatus==='待批阅').length}
async function load(){busy.value=true;error.value='';try{sessions.value=await listExamSessions()}catch(e){error.value=`读取失败：${String(e)}`}finally{busy.value=false}}
function open(session:ExamSessionRecord){selected.value=session;notice.value='';scores.value={};comments.value={};for(const answer of session.answers){scores.value[answer.position]=answer.score==null?'':String(answer.score);comments.value[answer.position]=answer.comment||''}}
function answer(position:number):ExamAnswerRecord|undefined{return selected.value?.answers.find(answer=>answer.position===position)}
async function grade(position:number){
  if(!selected.value || busy.value)return
  if(!String(scores.value[position]??'').trim()){error.value='请输入分数';return}
  busy.value=true;error.value='';notice.value=''
  try{const id=selected.value.attempt.id;await reviewExamAnswer({attemptId:id,position,score:Number(scores.value[position]),comment:comments.value[position]||''});sessions.value=await listExamSessions();open(sessions.value.find(session=>session.attempt.id===id)!);notice.value='评分已保存'}catch(e){error.value=String(e)}finally{busy.value=false}
}
onMounted(load)
</script>
<template>
<section class="view history-view">
  <div class="history-heading"><div><div class="eyebrow">学习与考试</div><h1>考试记录</h1><p>继续未完成的考试，查看成绩与批阅简答题。</p></div><button class="secondary-button" :disabled="busy" @click="load">刷新记录</button></div>
  <p v-if="error" role="alert" class="history-error">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <template v-if="selected">
    <button class="ghost-button" @click="selected=null">← 返回记录</button>
    <div class="history-summary"><h2>{{selected.paper.name}}</h2><p>考生：{{selected.attempt.candidateName||'未填写姓名'}}</p><p>已评分得分 {{total(selected)}} / {{selected.paper.totalScore}} 分 · {{pending(selected)}} 道待批阅</p></div>
    <article v-for="item in selected.paper.items" :key="item.position" class="history-question">
      <h3>{{item.position}}. <QuestionText :text="item.snapshot.title" :runs="item.snapshot.titleRuns" /></h3>
      <QuestionMedia :attachments="questionAttachments(item.snapshot)" />
      <p v-for="(option,index) in item.snapshot.type==='选择题'?(item.snapshot.options||[]):[]" :key="index">{{String.fromCharCode(65+index)}}. {{option}}</p>
      <p>学生答案：{{!answer(item.position)?.answer?'未作答':item.snapshot.type==='判断题'?judgmentLabel(answer(item.position)?.answer):answer(item.position)?.answer}}</p>
      <p class="history-reference">参考答案：{{item.snapshot.type==='判断题'?judgmentLabel(item.snapshot.correctAnswer):item.snapshot.type==='填空题'?formatFillAnswers(item.snapshot.fillAnswers):item.snapshot.correctAnswer || item.snapshot.referenceAnswer || '未设置'}}</p>
      <p v-if="item.snapshot.explanation">解析：{{item.snapshot.explanation}}</p>
      <div v-if="item.snapshot.type==='简答题'" class="history-grading"><label>评分（满分 {{item.score}}）<input v-model="scores[item.position]" type="number" min="0" :max="item.score" step="0.5" /></label><label>评语<input v-model="comments[item.position]" placeholder="选填" /></label><button class="primary-button" :disabled="busy" @click="grade(item.position)">保存评分</button></div>
      <p v-else>得分：{{answer(item.position)?.score??0}} / {{item.score}}</p>
    </article>
  </template>
  <template v-else>
    <p v-if="!busy&&!sessions.length" class="history-summary">暂无考试记录。在模拟考试中开始一份试卷后，答题进度会自动保存。</p>
    <article v-for="session in sessions" :key="session.attempt.id" class="history-record">
      <div><h3>{{session.paper.name}}</h3><p>考生：{{session.attempt.candidateName||'未填写姓名'}}</p><p>{{new Date(session.attempt.startedAt).toLocaleString('zh-CN')}} · {{session.attempt.status}}</p><p v-if="session.attempt.status==='已交卷'">{{total(session)}} / {{session.paper.totalScore}} 分 · {{pending(session)}} 道待批阅</p><p v-else>已答 {{session.answers.filter(answer=>answer.answer?.trim()).length}} / {{session.paper.items.length}} 题 · 剩余 {{Math.floor(session.attempt.remainingSeconds/60)}} 分 {{session.attempt.remainingSeconds%60}} 秒</p></div>
      <button v-if="session.attempt.status==='进行中'" class="primary-button" :disabled="busy" @click="emit('resume',session)">继续考试</button><button v-else class="secondary-button" @click="open(session)">查看与批阅</button>
    </article>
  </template>
</section>
</template>
<style scoped>
.history-heading,.history-record{display:flex;align-items:center;justify-content:space-between;gap:24px}.history-heading{margin-bottom:28px}.history-heading p,.history-record p{color:var(--text-secondary,#747b86);margin:8px 0}.history-record,.history-summary,.history-question{background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:24px;margin:16px 0}.history-record>div{min-width:0}.history-record p,.history-summary p{overflow-wrap:anywhere}.history-record h3,.history-question h3{margin:0 0 12px}.history-error{color:#c53737}.history-reference{color:var(--text-secondary,#747b86)}.history-grading{display:flex;align-items:end;gap:16px;flex-wrap:wrap}.history-grading label{display:grid;gap:8px}.history-grading label:nth-child(2){flex:1}.history-grading input{border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:10px;min-width:100px;width:100%}.history-grading label:first-child{width:140px}@media(max-width:760px){.history-heading,.history-record{align-items:start;flex-direction:column}}
</style>
