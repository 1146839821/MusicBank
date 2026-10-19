<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import ExamHistory from './components/ExamHistory.vue'
import {saveExamProgress,saveExamResponse,finishExam} from './exam-store'
import type {ExamAttemptRecord,ExamAnswerRecord,ExamSessionRecord,PaperRecord} from '../electron/types'
import PromptEditor from './components/PromptEditor.vue'
import QuestionText from './components/QuestionText.vue'
import QuestionMedia from './components/QuestionMedia.vue'
import { importMedia } from './media-store'
import { questionAttachments } from '../electron/question-assets'
import type { QuestionAttachment, TextRun } from '../electron/types'
import PaperWorkspace from './components/PaperWorkspace.vue'
import { copyQuestion } from './question-copy'
import { judgmentLabel, judgmentCorrect } from './question-answers'
import NotationEditor from './components/NotationEditor.vue'
import { musicCategories } from '../electron/music-categories'
import { summarizePractice, type PracticeResponse } from './practice'

type View = 'dashboard' | 'library' | 'add' | 'papers' | 'practice' | 'exam' | 'exam-history' | 'wrong' | 'backup' | 'settings'
type QuestionType = '选择题' | '填空题' | '判断题' | '简答题'
type ChoiceMode = 'single' | 'multiple'

interface Question {
  attachments?: QuestionAttachment[]
  id: string
  title: string
  titleRuns?: TextRun[]
  grade: string
  category: string
  type: QuestionType
  status: '已发布' | '草稿'
  hasAudio: boolean
  hasImage: boolean
  updated: string
  difficulty: string
  options?: string[]
  correctAnswer?: string
  answerMode?: ChoiceMode
  fillAnswers?: string[]
  referenceAnswer?: string
  explanation?: string
  source?: string
  subcategory?: string
  audioName?: string
  audioDuration?: string
  audioAssetId?: string
  imageAssetId?: string
  notationDocument?: string
}
interface PaperItem { question: Question; score: number }
interface SavedPaper { id: string; name: string; grade: string; totalScore: number; durationMinutes: number; seed?: string; items: Array<{ position: number; questionId: string; score: number; snapshot: Question }> }
interface UserProfile { username: string; nickname: string; userCode: string }

const hasDemoData = import.meta.env.DEV || import.meta.env.VITE_DEMO_DATA === 'true'

const activeView = ref<View>('dashboard')
const activeNavLabel = ref('数据首页')
const isDark = ref(false)
const currentTime = ref(new Date())
const clockTimer = ref<number | null>(null)
const userProfile = ref<UserProfile | null>(null)
const setupRequired = ref(false)
const setupBusy = ref(false)
const setupError = ref('')
const setupForm = reactive({ username: '', nickname: '', password: '', confirmPassword: '' })
const profileForm = reactive({ nickname: '', userCode: '' })
const passwordForm = reactive({ currentPassword: '', nextPassword: '', confirmPassword: '' })
const resetPasswordForm = reactive({ userCode: '', nextPassword: '', confirmPassword: '' })
const accountBusy = ref(false)
const search = ref('')
const libraryFilter = ref('全部题型')
const libraryGrade = ref('全部年级')
const libraryCategory = ref('全部分类')
const libraryAssetFilter = ref('全部试题')
const showLibraryFilters = ref(false)
const addStep = ref(1)
const questionType = ref<QuestionType>('选择题')
const judgmentAnswer = ref('')
const choiceMode = ref<ChoiceMode>('single')
const selectedAnswers = ref<string[]>([])
const isPlaying = ref(false)
const toast = ref('')
const showMore = ref(false)
const showQuestionPreview = ref(false)
const formError = ref('')
const currentSavedId = ref<string | null>(null)
const promptRuns = ref<TextRun[]>([])
const form = reactive({ grade: '', category: '', subcategory: '', difficulty: '基础', source: '', prompt: '', explanation: '', fillAnswer: '', shortAnswer: '' })
const optionTexts = ref(['', '', '', '', '', ''])
const audioInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const attachments = ref<QuestionAttachment[]>([])
const mediaImportBusy = ref(0)
let audioImportRevision = 0
let imageImportRevision = 0
const practiceIndex = ref(0)
const studyMode = ref<'sequence' | 'special'>('sequence')
const categoryNames = Object.keys(musicCategories)
const subcategoryNames = computed(() => musicCategories[form.category] || [])
watch(() => form.category, () => { form.subcategory = '' }, { flush: 'sync' })
const practiceGrade = ref('全部年级')
const practiceCategory = ref('全部分类')
const practiceAudioOnly = ref(false)
const practiceCategories = computed(() => [...new Set(questions.value.filter((question) => question.status === '已发布').map((question) => question.category))])
const practiceAnswer = ref('')
const practiceChoiceAnswers = ref<string[]>([])
const practiceSubmitted = ref(false)
const practiceResult = ref<'correct' | 'wrong' | 'pending' | null>(null)
const paperConfig = reactive({ name: '六年级音乐阶段模拟卷', grade: '六年级', totalScore: 100, duration: 40, seed: '' })
const generatedPaper = ref<PaperItem[]>([])
const activePaperId = ref<string | null>(null)
const savedPapers = ref<SavedPaper[]>([])
const backupBusy = ref(false)
const dataRootPath = ref('桌面版应用数据目录')
const examIndex = ref(0)
const examAnswers = reactive<Record<string, string>>({})
const examSubmitted = ref(false)
const examRemaining = ref(0)
const examTimer = ref<number | null>(null)
const activeExamAttemptId = ref<string | null>(null)
const examStartedAt = ref<string | null>(null)

const wrongQuestionIds = ref<string[]>([])
const paperError = ref('')
const showNotationPanel = ref(false)
const notationDocument = ref('')
const notationImageSource = ref('')
const notationExportBusy = ref(false)
function openNotationEditor() { showNotationPanel.value = true }
function closeNotationEditor() { showNotationPanel.value = false }

function openQuestionPreview() {
  showQuestionPreview.value = true
}

function closeQuestionPreview() {
  showQuestionPreview.value = false
}

async function exportNotationImage(svg: string) {
  if (notationExportBusy.value) return
  notationExportBusy.value = true
  const exportedSource = notationDocument.value
  const revision = ++imageImportRevision
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = svgUrl
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('谱面预览生成失败')) })
    const canvas = document.createElement('canvas')
    const scale = 2
    canvas.width = image.width * scale
    canvas.height = image.height * scale
    if (canvas.width * canvas.height > 40_000_000 || canvas.height > 32767) throw new Error('乐谱过长，请拆分为多道题目后生成图片')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备不支持谱面导出')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pngBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 导出失败')), 'image/png'))
    const bytes = await pngBlob.arrayBuffer()
    if (revision !== imageImportRevision) return
    const imported = await importMedia(new File([bytes], `MusicBank-谱面-${Date.now()}.png`, {type:'image/png'}), 'image')
    if (revision !== imageImportRevision) return
    attachments.value = [...attachments.value, {...imported, notationDocument:exportedSource}]
    notationImageSource.value = exportedSource
    showNotationPanel.value = false
    notify('谱面已生成图片并加入当前题目')
  } catch (error) {
    if (revision !== imageImportRevision) return
    notify(error instanceof Error ? error.message : '谱面导出失败')
  } finally {
    URL.revokeObjectURL(svgUrl)
    notationExportBusy.value = false
  }
}


const navGroups = [
  { label: '题库管理', items: [{ id: 'dashboard', icon: 'grid', label: '数据首页' }, { id: 'library', icon: 'book', label: '试题管理' }, { id: 'add', icon: 'plus', label: '新增试题', accent: true }, { id: 'papers', icon: 'layers', label: '试卷管理' }, { id: 'papers', icon: 'book', label: '试卷模板' }] },
  { label: '学习与考试', items: [{ id: 'practice', icon: 'play', label: '顺序练习' }, { id: 'practice', icon: 'spark', label: '专项练习' }, { id: 'papers', icon: 'shuffle', label: '随机组卷' }, { id: 'exam', icon: 'clock', label: '模拟考试' }, { id: 'exam-history', icon: 'clock', label: '考试记录' }, { id: 'wrong', icon: 'bookmark', label: '我的错题' }] },
  { label: '系统', items: [{ id: 'backup', icon: 'archive', label: '数据备份' }, { id: 'settings', icon: 'settings', label: '系统设置' }] },
]

const demoQuestions: Question[] = [
  { id: 'MUS-000128', title: '聆听《春节序曲》片段，判断其演奏形式。', grade: '六年级', category: '音乐体裁', type: '选择题', status: '已发布', hasAudio: true, hasImage: false, updated: '今天 09:42', difficulty: '中等' },
  { id: 'MUS-000127', title: '在乐谱中，\"mf\"表示的力度是______。', grade: '四年级', category: '音乐记号', type: '填空题', status: '已发布', hasAudio: false, hasImage: true, updated: '昨天 16:20', difficulty: '基础' },
  { id: 'MUS-000126', title: '请简述二胡与小提琴在音色上的主要区别。', grade: '五年级', category: '民族、西洋乐器', type: '简答题', status: '草稿', hasAudio: false, hasImage: false, updated: '10月 18日', difficulty: '进阶' },
  { id: 'MUS-000125', title: '下列哪一项属于维吾尔族民歌的典型节奏？', grade: '三年级', category: '音乐风格', type: '选择题', status: '已发布', hasAudio: true, hasImage: false, updated: '10月 17日', difficulty: '中等' },
  { id: 'MUS-000124', title: '节奏记号“♩”代表的音符是？', grade: '三年级', category: '音乐记号', type: '选择题', status: '已发布', hasAudio: false, hasImage: false, updated: '10月 16日', difficulty: '基础', options: ['全音符', '二分音符', '四分音符', '八分音符'], correctAnswer: 'C', explanation: '♩是四分音符，通常占一拍。' },
  { id: 'MUS-000123', title: '请简述旋律与节奏在音乐表现中的作用。', grade: '六年级', category: '音乐要素', type: '简答题', status: '已发布', hasAudio: false, hasImage: false, updated: '10月 15日', difficulty: '进阶', referenceAnswer: '旋律组织音高，节奏组织时值与强弱，两者共同形成音乐的基本表现力。' },
]
const questions = ref<Question[]>(hasDemoData ? demoQuestions.map((question) => ({ ...question })) : [])

function answerLetters(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? value.split(/[+,、，\s]+/).map((answer) => answer.trim()).filter(Boolean) : []
}

function choiceAnswersEqual(answer: string | string[] | undefined, correct: string | string[] | undefined) {
  const actual = answerLetters(answer).sort().join(',')
  const expected = answerLetters(correct).sort().join(',')
  return Boolean(actual) && actual === expected
}

function formatChoiceAnswer(value: string | string[] | undefined) {
  return answerLetters(value).join('、')
}

const storedSequence=Number(window.localStorage.getItem('musicbank.question-sequence'))
const questionSequence = ref(Number.isSafeInteger(storedSequence)&&storedSequence>=0?storedSequence:0)
watch(questions, value => {
  const highest=value.reduce((max,question)=>{const id=Number(/^MUS-(\d+)$/.exec(question.id)?.[1]||0);return Number.isSafeInteger(id)?Math.max(max,id):max},questionSequence.value)
  questionSequence.value=highest
  const persist=()=>{
    const stored=Number(window.localStorage.getItem('musicbank.question-sequence'))
    const value=Math.max(highest,Number.isSafeInteger(stored)&&stored>=0?stored:0)
    window.localStorage.setItem('musicbank.question-sequence',String(value))
    questionSequence.value=Math.max(questionSequence.value,value)
  }
  if(!window.musicBank&&navigator.locks)void navigator.locks.request('musicbank-question-id',persist)
  else persist()
},{deep:true,immediate:true})
const nextQuestionId = computed(() => `MUS-${String(questionSequence.value+1).padStart(6,'0')}`)
async function reserveQuestionId() {
  const reserveBrowser=()=>{
    const stored=Number(window.localStorage.getItem('musicbank.question-sequence'))
    const next=Math.max(questionSequence.value,Number.isSafeInteger(stored)&&stored>=0?stored:0)+1
    if(!Number.isSafeInteger(next))throw new Error('题号已达到上限')
    window.localStorage.setItem('musicbank.question-sequence',String(next))
    return `MUS-${String(next).padStart(6,'0')}`
  }
  const id=window.musicBank?await window.musicBank.questions.reserveId():navigator.locks?await navigator.locks.request('musicbank-question-id',reserveBrowser):reserveBrowser()
  questionSequence.value=Math.max(questionSequence.value,Number(id.slice(4)))
  return id
}

const practiceQuestions = computed(() => questions.value.filter((question) => question.status === '已发布' && (studyMode.value === 'sequence' || ((practiceGrade.value === '全部年级' || question.grade === practiceGrade.value) && (practiceCategory.value === '全部分类' || question.category === practiceCategory.value) && (!practiceAudioOnly.value || question.hasAudio)))))
const practiceCurrent = computed(() => practiceQuestions.value[practiceIndex.value] || practiceQuestions.value[0])
const examCurrent = computed(() => generatedPaper.value[examIndex.value]?.question)
const examScore = computed(() => generatedPaper.value.reduce((score, item) => {
  const answer = examAnswers[item.question.id]
  if (item.question.type === '简答题') return score
  const correct = item.question.type === '判断题' ? judgmentCorrect(answer, item.question.correctAnswer) : item.question.type === '选择题' ? choiceAnswersEqual(answer, item.question.correctAnswer) : (item.question.fillAnswers || []).some((expected) => normalizeAnswer(answer) === normalizeAnswer(expected))
  return score + (correct ? item.score : 0)
}, 0))
const wrongQuestions = computed(() => questions.value.filter((question) => wrongQuestionIds.value.includes(question.id)))
const practiceAttachments = computed(() => practiceCurrent.value ? questionAttachments(practiceCurrent.value) : [])
const examAttachments = computed(() => examCurrent.value ? questionAttachments(examCurrent.value) : [])
const publishedQuestionCount = computed(() => questions.value.filter((question) => question.status === '已发布').length)
const draftQuestionCount = computed(() => questions.value.filter((question) => question.status === '草稿').length)
const audioQuestionCount = computed(() => questions.value.filter((question) => question.hasAudio).length)
const recentQuestionCount = computed(() => questions.value.filter((question) => question.updated === '刚刚' || question.updated.includes('今天') || question.updated.includes('昨天')).length)
const questionTypeCounts = computed(() => ({ choice: questions.value.filter((question) => question.type === '选择题').length, fill: questions.value.filter((question) => question.type === '填空题').length, judgment: questions.value.filter((question) => question.type === '判断题').length, short: questions.value.filter((question) => question.type === '简答题').length }))
const questionDonutStyle = computed(() => {
  if (!questions.value.length) return 'conic-gradient(#e8ebf1 0 100%)'
  const total = questions.value.length
  const choiceEnd = questionTypeCounts.value.choice / total * 100
  const fillEnd = choiceEnd + questionTypeCounts.value.fill / total * 100
  const judgmentEnd = fillEnd + questionTypeCounts.value.judgment / total * 100
  return `conic-gradient(#8870e8 0 ${choiceEnd}%, #5a8bf1 ${choiceEnd}% ${fillEnd}%, #48ae7d ${fillEnd}% ${judgmentEnd}%, #f2a367 ${judgmentEnd}% 100%)`
})
const greetingText = computed(() => {
  const hour = currentTime.value.getHours()
  if (hour >= 5 && hour < 11) return '早上好'
  if (hour >= 11 && hour < 13) return '中午好'
  if (hour >= 13 && hour < 18) return '下午好'
  return '晚上好'
})
const greetingDate = computed(() => {
  const date = currentTime.value
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${weekdays[date.getDay()]} · ${date.getMonth() + 1}月 ${date.getDate()}日`
})
const greetingName = computed(() => userProfile.value?.nickname || '老师')

onMounted(() => {
  clockTimer.value = window.setInterval(() => { currentTime.value = new Date() }, 60_000)
  const savedQuestions = window.localStorage.getItem('musicbank.questions')
  const savedTheme = window.localStorage.getItem('musicbank.theme')
  if (savedQuestions && hasDemoData) {
    try { questions.value = JSON.parse(savedQuestions) as Question[] } catch { /* keep demo data */ }
  }
  if (savedTheme === 'dark') isDark.value = true
  const savedWrong = window.localStorage.getItem('musicbank.wrong')
  if (savedWrong && hasDemoData) {
    try { wrongQuestionIds.value = JSON.parse(savedWrong) as string[] } catch { wrongQuestionIds.value = [] }
  }
  if (window.musicBank) {
    window.musicBank.system.paths().then((paths) => { dataRootPath.value = paths.dataRoot }).catch(() => { /* keep generic label */ })
    window.musicBank.system.profile().then((profile) => {
      userProfile.value = profile as UserProfile | null
      if (profile) {
        profileForm.nickname = profile.nickname
        profileForm.userCode = profile.userCode
      } else setupRequired.value = true
    }).catch(() => { setupRequired.value = true })
    window.musicBank.questions.sequence().then(sequence=>{questionSequence.value=Math.max(questionSequence.value,sequence)}).catch(()=>{ /* allocation still remains authoritative in SQLite */ })
    window.musicBank.questions.list().then((storedQuestions) => {
      questions.value = storedQuestions as Question[]
      if (!storedQuestions.length && hasDemoData) questions.value = demoQuestions.map((question) => ({ ...question }))
      if (!storedQuestions.length && hasDemoData) questions.value.forEach((question) => { void window.musicBank?.questions.save(question) })
    }).catch(() => notify('本地数据库暂时不可用，已使用浏览器缓存'))
    window.musicBank.wrong.list().then((ids) => { wrongQuestionIds.value = ids }).catch(() => { /* keep local cache */ })
    window.musicBank.papers.list().then((papers) => { savedPapers.value = papers as SavedPaper[] }).catch(() => { /* keep local cache */ })
  }
  window.addEventListener('keydown', handleShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
  if (clockTimer.value !== null) window.clearInterval(clockTimer.value)
  stopExamTimer()
})

watch(practiceIndex, () => {
  isPlaying.value = false
})

watch(questions, (value) => {
  if (!window.musicBank) window.localStorage.setItem('musicbank.questions', JSON.stringify(value))
}, { deep: true })
watch(isDark, (value) => window.localStorage.setItem('musicbank.theme', value ? 'dark' : 'light'))
watch(wrongQuestionIds, (value) => window.localStorage.setItem('musicbank.wrong', JSON.stringify(value)), { deep: true })

const filteredQuestions = computed(() => questions.value.filter((q) => {
  const matchesSearch = !search.value || `${q.id}${q.title}${q.category}`.toLowerCase().includes(search.value.toLowerCase())
  const matchesType = libraryFilter.value === '全部题型' || q.type === libraryFilter.value
  const matchesGrade = libraryGrade.value === '全部年级' || q.grade === libraryGrade.value
  const matchesCategory = libraryCategory.value === '全部分类' || q.category === libraryCategory.value
  const matchesAsset = libraryAssetFilter.value === '全部试题' || (libraryAssetFilter.value === '仅含音频' ? q.hasAudio : q.hasImage)
  return matchesSearch && matchesType && matchesGrade && matchesCategory && matchesAsset
}))

const pageTitle = computed(() => activeView.value === 'papers' || activeView.value === 'exam' ? activeNavLabel.value : ({ dashboard: '数据首页', library: '试题管理', add: '新增试题', practice: activeNavLabel.value, 'exam-history':'考试记录', wrong: '我的错题', backup: '数据备份', settings: '系统设置' }[activeView.value]))

function go(view: View, navLabel?: string) {
  const previousView = activeView.value
  if (previousView === 'exam' && view !== 'exam') { stopExamTimer(); if(!examSubmitted.value) void checkpointExam().catch(()=>{}) }
  activeView.value = view
  activeNavLabel.value = navLabel || (view === 'add' ? '新增试题' : view === 'library' ? '试题管理' : view === 'practice' ? '顺序练习' : view === 'exam-history' ? '考试记录' : view === 'wrong' ? '我的错题' : view === 'papers' ? '试卷管理' : view === 'backup' ? '数据备份' : view === 'settings' ? '系统设置' : '数据首页')
  if (view === 'add' && previousView !== 'add') { resetForm(); addStep.value = 1 }
  if (view === 'practice') { studyMode.value = navLabel === '专项练习' ? 'special' : 'sequence'; Object.keys(practiceResponses).forEach((id) => delete practiceResponses[id]); practiceIndex.value = 0; resetPractice() }
  if (view === 'exam') startExam()
}

async function createInitialUser() {
  setupError.value = ''
  if (!setupForm.username.trim() || !setupForm.nickname.trim()) { setupError.value = '请输入用户名和昵称'; return }
  if (setupForm.password.length < 6) { setupError.value = '密码至少需要 6 位'; return }
  if (setupForm.password !== setupForm.confirmPassword) { setupError.value = '两次输入的密码不一致'; return }
  if (!window.musicBank) { setupError.value = '请使用桌面版完成用户初始化'; return }
  setupBusy.value = true
  try {
    const profile = await window.musicBank.system.createUser({ username: setupForm.username.trim(), nickname: setupForm.nickname.trim(), password: setupForm.password })
    userProfile.value = profile
    profileForm.nickname = profile.nickname
    profileForm.userCode = profile.userCode
    setupRequired.value = false
    notify('用户已建立，请妥善保管密码')
  } catch (error) { setupError.value = error instanceof Error ? error.message : '用户建立失败，请稍后重试' }
  finally { setupBusy.value = false }
}

async function saveUserProfile() {
  if (!window.musicBank || !userProfile.value) return
  if (!profileForm.nickname.trim() || !profileForm.userCode.trim()) { notify('昵称和用户编码不能为空'); return }
  accountBusy.value = true
  try {
    userProfile.value = await window.musicBank.system.updateProfile({ nickname: profileForm.nickname.trim(), userCode: profileForm.userCode.trim() })
    notify('用户资料已保存')
  } catch (error) { notify(error instanceof Error ? error.message : '用户资料保存失败') }
  finally { accountBusy.value = false }
}

async function changeUserPassword() {
  if (!window.musicBank) return
  if (passwordForm.nextPassword.length < 6) { notify('新密码至少需要 6 位'); return }
  if (passwordForm.nextPassword !== passwordForm.confirmPassword) { notify('两次输入的新密码不一致'); return }
  accountBusy.value = true
  try {
    await window.musicBank.system.changePassword({ currentPassword: passwordForm.currentPassword, nextPassword: passwordForm.nextPassword })
    passwordForm.currentPassword = ''; passwordForm.nextPassword = ''; passwordForm.confirmPassword = ''
    notify('密码已修改')
  } catch (error) { notify(error instanceof Error ? error.message : '密码修改失败') }
  finally { accountBusy.value = false }
}

async function resetUserPassword() {
  if (!window.musicBank || !userProfile.value) return
  if (resetPasswordForm.userCode.trim() !== userProfile.value.userCode) { notify('用户编码不正确'); return }
  if (resetPasswordForm.nextPassword.length < 6) { notify('新密码至少需要 6 位'); return }
  if (resetPasswordForm.nextPassword !== resetPasswordForm.confirmPassword) { notify('两次输入的新密码不一致'); return }
  accountBusy.value = true
  try {
    await window.musicBank.system.resetPassword({ userCode: resetPasswordForm.userCode.trim(), nextPassword: resetPasswordForm.nextPassword })
    resetPasswordForm.userCode = ''; resetPasswordForm.nextPassword = ''; resetPasswordForm.confirmPassword = ''
    notify('密码已重置，请牢记新密码')
  } catch (error) { notify(error instanceof Error ? error.message : '密码重置失败') }
  finally { accountBusy.value = false }
}

async function confirmDestructive(target: string) {
  if (!window.confirm(`这是不可逆操作，将删除“${target}”。是否继续？`)) return false
  if (!window.musicBank) return window.prompt(`请输入“${target}”确认删除：`) === target
  const password = window.prompt('为防止误删，请输入账户密码：')
  if (password === null) return false
  const verified = await window.musicBank.system.verifyPassword(password)
  if (!verified) notify('密码不正确，已取消删除')
  return verified
}

function notify(message: string) {
  toast.value = message
  window.setTimeout(() => (toast.value = ''), 2200)
}

function resetForm() {
  audioImportRevision += 1
  imageImportRevision += 1
  form.grade = ''
  form.category = ''
  form.subcategory = ''
  form.difficulty = '基础'
  form.source = ''
  form.prompt = ''
  promptRuns.value = []
  form.explanation = ''
  form.fillAnswer = ''
  form.shortAnswer = ''
  optionTexts.value = ['', '', '', '', '', '']
  questionType.value = '选择题'
  judgmentAnswer.value = ''
  choiceMode.value = 'single'
  selectedAnswers.value = []
  showMore.value = false
  currentSavedId.value = null
  formError.value = ''
  attachments.value = []
  notationDocument.value = ''
  notationImageSource.value = ''
  showNotationPanel.value = false
  isPlaying.value = false
}

function editQuestion(question: Question) {
  notationDocument.value = question.notationDocument || ''
  notationImageSource.value = notationDocument.value
  audioImportRevision += 1
  imageImportRevision += 1
  currentSavedId.value = question.id
  form.grade = question.grade
  form.category = question.category
  form.subcategory = question.subcategory || ''
  form.difficulty = question.difficulty
  form.source = question.source || ''
  form.prompt = question.title
  promptRuns.value = question.titleRuns || []
  form.explanation = question.explanation || ''
  form.fillAnswer = (question.fillAnswers || []).join('\n')
  form.shortAnswer = question.referenceAnswer || ''
  questionType.value = question.type
  judgmentAnswer.value = question.type === '判断题' ? question.correctAnswer || '' : ''
  optionTexts.value = [...(question.options || ['','','','']), '', ''].slice(0, 6)
  choiceMode.value = question.answerMode || (answerLetters(question.correctAnswer).length > 1 ? 'multiple' : 'single')
  selectedAnswers.value = answerLetters(question.correctAnswer || 'A')
  showMore.value = (question.options?.length || 4) > 4
  attachments.value = questionAttachments(question).map(item => ({...item}))
  formError.value = ''
  addStep.value = 2
  activeView.value = 'add'
  activeNavLabel.value = '新增试题'
  notify(`已打开 ${question.id}，可继续编辑`)
}

function toggleChoiceAnswer(letter: string) {
  if (choiceMode.value === 'multiple') {
    selectedAnswers.value = selectedAnswers.value.includes(letter)
      ? selectedAnswers.value.filter((answer) => answer !== letter)
      : [...selectedAnswers.value, letter].sort()
  } else {
    selectedAnswers.value = [letter]
  }
}

function setChoiceMode(mode: ChoiceMode) {
  choiceMode.value = mode
  if (mode === 'single' && selectedAnswers.value.length > 1) selectedAnswers.value = [selectedAnswers.value[0]]
}

function collapseOptions() {
  showMore.value = false
  selectedAnswers.value = selectedAnswers.value.filter((answer) => ['A', 'B', 'C', 'D'].includes(answer))
  if (!selectedAnswers.value.length) selectedAnswers.value = ['A']
}

const libraryMutationBusy = ref(false)

async function duplicateQuestion(question: Question) {
  if (libraryMutationBusy.value) return
  libraryMutationBusy.value = true
  try {
    const copy = copyQuestion(question, await reserveQuestionId())
    if (window.musicBank) await window.musicBank.questions.save(copy)
    questions.value.unshift(copy)
    notify(`已复制为 ${copy.id}，请继续完善后发布`)
  } catch {
    notify('复制失败，请重试')
  } finally {
    libraryMutationBusy.value = false
  }
}

async function deleteQuestion(question: Question) {
  if (libraryMutationBusy.value) return
  libraryMutationBusy.value = true
  try {
    if (!await confirmDestructive(question.id)) { notify('已取消删除'); return }
    if (window.musicBank) await window.musicBank.questions.delete(question.id)
    questions.value = questions.value.filter((item) => item.id !== question.id)
    if (currentSavedId.value === question.id) resetForm()
    notify(`已删除 ${question.id}`)
  } catch {
    notify('删除失败，题目已保留，请重试')
  } finally {
    libraryMutationBusy.value = false
  }
}

async function toggleQuestionStatus(question: Question) {
  if (libraryMutationBusy.value) return
  libraryMutationBusy.value = true
  const updated: Question = { ...question, status: question.status === '已发布' ? '草稿' : '已发布', updated: '刚刚' }
  try {
    if (window.musicBank) await window.musicBank.questions.save(updated)
    Object.assign(question, updated)
    notify(updated.status === '已发布' ? `已发布 ${question.id}` : `已撤回 ${question.id}`)
  } catch {
    notify('状态更新失败，请重试')
  } finally {
    libraryMutationBusy.value = false
  }
}

function openAudioPicker() { audioInput.value?.click() }
function openImagePicker() { imageInput.value?.click() }
async function insertMedia(event: Event, assetType: 'image' | 'audio') {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const revision = assetType === 'audio' ? audioImportRevision : imageImportRevision
  mediaImportBusy.value++
  const errors: string[] = []
  try {
    for (const file of files) {
      try {
        const imported = await importMedia(file, assetType)
        if (revision !== (assetType === 'audio' ? audioImportRevision : imageImportRevision)) return
        attachments.value = [...attachments.value, imported]
      } catch (error) { errors.push(`${file.name}：${(error as Error).message}`) }
    }
    if (errors.length) notify(errors.join('；'))
    else if (files.length) notify(`已保存并加入 ${files.length} 份素材`)
  } finally { mediaImportBusy.value-- }
}
function handleAudioChange(event: Event) { return insertMedia(event, 'audio') }
function handleImageChange(event: Event) { return insertMedia(event, 'image') }
function removeAttachment(id: string) {
  const item=attachments.value.find(item=>item.id===id)
  attachments.value=attachments.value.filter(item=>item.id!==id)
  if(item?.notationDocument===notationImageSource.value){notationDocument.value='';notationImageSource.value=''}
}
function syncAudioDuration(id: string, duration: string) {
  const item=attachments.value.find(item=>item.id===id)
  if(item)item.duration=duration
}

function validateForm() {
  if (notationDocument.value && notationDocument.value !== notationImageSource.value) {
    formError.value = '乐谱有未生成的修改，请打开乐谱编辑器并点击“生成题目图片”后保存。'
    return false
  }
  if (mediaImportBusy.value || notationExportBusy.value) { formError.value = '素材正在保存，请稍候再保存题目。'; return false }
  if (!form.grade || !form.category) {
    formError.value = '请先选择年级和一级分类。'
    addStep.value = 1
    return false
  }
  if (!form.prompt.trim()) {
    formError.value = '题目内容不能为空。'
    return false
  }
  if (questionType.value === '选择题' && (optionTexts.value.slice(0, showMore.value ? 6 : 4).filter((option) => option.trim()).length < 2 || !selectedAnswers.value.length)) {
    formError.value = '请至少填写两个选项，并选择正确答案。'
    return false
  }
  if (questionType.value === '选择题' && selectedAnswers.value.some((letter) => !optionTexts.value[letter.charCodeAt(0) - 65]?.trim())) {
    formError.value = '正确答案对应的选项不能为空。'
    return false
  }
  if (questionType.value === '判断题' && !['true','false'].includes(judgmentAnswer.value)) { formError.value = '请选择判断题的正确答案。'; return false }
  if (questionType.value === '填空题' && !form.fillAnswer.split('\n').some((answer) => answer.trim())) {
    formError.value = '请至少填写一个标准答案。'
    return false
  }
  if (questionType.value === '简答题' && !form.shortAnswer.trim()) {
    formError.value = '请填写参考答案，便于练习和阅卷。'
    return false
  }
  formError.value = ''
  return true
}

const questionSaving = ref(false)

async function persistQuestion(status: Question['status']) {
  if (questionSaving.value || !validateForm()) return false
  questionSaving.value = true
  try {
    const id = currentSavedId.value || await reserveQuestionId()
    const existingIndex = questions.value.findIndex((item) => item.id === id)
    const item: Question = { id, title: form.prompt, titleRuns: JSON.parse(JSON.stringify(promptRuns.value)), grade: form.grade, category: form.category, subcategory: form.subcategory, source: form.source, type: questionType.value, status, attachments: JSON.parse(JSON.stringify(attachments.value)), hasAudio: attachments.value.some(item=>item.assetType==='audio'), hasImage: attachments.value.some(item=>item.assetType==='image'), notationDocument: notationDocument.value || undefined, updated: '刚刚', difficulty: form.difficulty, options: optionTexts.value.slice(0, showMore.value ? 6 : 4), correctAnswer: questionType.value === '判断题' ? judgmentAnswer.value : questionType.value === '选择题' ? [...selectedAnswers.value].sort().join(',') : undefined, answerMode: questionType.value === '选择题' ? choiceMode.value : undefined, fillAnswers: form.fillAnswer.split('\n').map((answer) => answer.trim()).filter(Boolean), referenceAnswer: form.shortAnswer, explanation: form.explanation }
    if (window.musicBank) await window.musicBank.questions.save(item)
    if (existingIndex >= 0) questions.value[existingIndex] = item
    else questions.value.unshift(item)
    currentSavedId.value = id
    return true
  } catch {
    formError.value = '保存失败，录入内容已保留，请重试。'
    return false
  } finally {
    questionSaving.value = false
  }
}

async function saveQuestion(next = false) {
  if (!await persistQuestion('草稿')) return
  notify(next ? '已保存，正在准备下一题' : '草稿已保存到本地题库')
  if (next) { resetForm(); addStep.value = 1 }
}

async function publishQuestion() {
  if (!await persistQuestion('已发布')) return
  notify('试题已发布，可在试题管理中查看')
  activeView.value = 'library'
  activeNavLabel.value = '试题管理'
}

const practiceResponses = reactive<Record<string, PracticeResponse>>({})
const practiceSummary = computed(() => summarizePractice(practiceQuestions.value, practiceResponses))
const practiceCompletedCount = computed(() => practiceSummary.value.completed)
const practiceAccuracy = computed(() => practiceSummary.value.accuracy === null ? '待评分' : `${practiceSummary.value.accuracy}%`)

function resetPractice() {
  const response = practiceCurrent.value ? practiceResponses[practiceCurrent.value.id] : undefined
  practiceAnswer.value = response?.answer || ''
  practiceChoiceAnswers.value = practiceCurrent.value?.type === '选择题' ? answerLetters(response?.answer) : []
  practiceSubmitted.value = Boolean(response)
  practiceResult.value = response?.result || null
}
function togglePracticeChoice(letter: string) {
  const current = practiceCurrent.value
  if (!current || practiceSubmitted.value) return
  const multiple = current.answerMode === 'multiple' || answerLetters(current.correctAnswer).length > 1
  const next = multiple
    ? (practiceChoiceAnswers.value.includes(letter) ? practiceChoiceAnswers.value.filter((answer) => answer !== letter) : [...practiceChoiceAnswers.value, letter].sort())
    : [letter]
  practiceChoiceAnswers.value = next
  practiceAnswer.value = next.join(',')
}
function submitPractice() {
  if (practiceSubmitted.value) return
  const current = practiceCurrent.value
  if (!current || !practiceAnswer.value.trim()) {
    notify('请先完成作答')
    return
  }
  practiceSubmitted.value = true
  if (current.type === '简答题') practiceResult.value = 'pending'
  else if (current.type === '判断题') practiceResult.value = judgmentCorrect(practiceAnswer.value,current.correctAnswer) ? 'correct' : 'wrong'
  else if (current.type === '填空题') {
    const expectedAnswers = current.fillAnswers?.length ? current.fillAnswers : ['四分音符']
    practiceResult.value = expectedAnswers.some((expected) => normalizeAnswer(practiceAnswer.value) === normalizeAnswer(expected)) ? 'correct' : 'wrong'
  } else practiceResult.value = choiceAnswersEqual(practiceAnswer.value, current.correctAnswer || 'B') ? 'correct' : 'wrong'
  practiceResponses[current.id] = { answer: practiceAnswer.value, result: practiceResult.value }
  if (window.musicBank) void window.musicBank.practice.record({ questionId: current.id, answer: practiceAnswer.value, result: practiceResult.value })
  if (practiceResult.value === 'wrong') {
    if (!wrongQuestionIds.value.includes(current.id)) wrongQuestionIds.value.push(current.id)
    if (window.musicBank) void window.musicBank.wrong.upsert(current.id)
  }
}
function nextPractice() {
  if (practiceIndex.value < practiceQuestions.value.length - 1) { practiceIndex.value += 1; resetPractice() }
  else notify('已经是最后一道已发布试题')
}
function previousPractice() {
  if (practiceIndex.value > 0) { practiceIndex.value -= 1; resetPractice() }
}

function normalizeAnswer(value = '') {
  return value.replace(/[\s，。、“”‘’！？!?,.；;:：]/g, '').toLowerCase()
}

const examSaving=ref(false)
let examAttemptPaperId:string|null=null
let examWriteQueue:Promise<unknown>=Promise.resolve()
function enqueueExamWrite<T>(action:()=>Promise<T>):Promise<T> {
  const task=examWriteQueue.then(action)
  examWriteQueue=task.catch(()=>{})
  return task
}
function currentAttempt():ExamAttemptRecord|null {
  return activeExamAttemptId.value&&activePaperId.value ? {id:activeExamAttemptId.value,paperId:activePaperId.value,status:examSubmitted.value?'已交卷':'进行中',startedAt:examStartedAt.value!,remainingSeconds:Math.max(0,examRemaining.value)} : null
}
function currentExamPaper():PaperRecord {
  return {id:activePaperId.value!,name:paperConfig.name,grade:paperConfig.grade,totalScore:generatedPaper.value.reduce((sum,item)=>sum+item.score,0),durationMinutes:paperConfig.duration,items:generatedPaper.value.map((item,index)=>({position:index+1,questionId:item.question.id,score:item.score,snapshot:JSON.parse(JSON.stringify(item.question))}))}
}
async function checkpointExam() {
  const attempt=currentAttempt()
  if(!attempt || examSubmitted.value || !generatedPaper.value.length)return
  const paper=currentExamPaper()
  try {await enqueueExamWrite(()=>saveExamProgress(attempt,paper))}
  catch(error){notify(`考试进度保存失败：${String(error)}`);throw error}
}
function runExamTimer(){
  stopExamTimer()
  examTimer.value=window.setInterval(()=>{
    if(examSubmitted.value || examSaving.value)return
    examRemaining.value=Math.max(0,examRemaining.value-1)
    if(examRemaining.value===0) void submitExam(true)
    else void checkpointExam().catch(()=>{})
  },1000)
}
async function startExam() {
  if(examSaving.value)return
  stopExamTimer()
  if (!generatedPaper.value.length) {
    generatedPaper.value = questions.value.filter((question) => question.status === '已发布').slice(0, 10).map((question) => ({ question, score: question.type === '选择题' ? 2 : question.type === '填空题' ? 3 : 10 }))
    activePaperId.value=null
  }
  if(!generatedPaper.value.length)return
  examSaving.value=true
  try {
    if(!activePaperId.value) await persistCurrentPaper()
    // Navigation to an active exam keeps its answers; a new attempt is explicit after submission.
    if(activeExamAttemptId.value && !examSubmitted.value && examAttemptPaperId===activePaperId.value){runExamTimer();return}
    examIndex.value=0;examSubmitted.value=false
    Object.keys(examAnswers).forEach(key=>delete examAnswers[key])
    examRemaining.value=Math.max(1,paperConfig.duration)*60
    activeExamAttemptId.value=`ATTEMPT-${crypto.randomUUID()}`
    examAttemptPaperId=activePaperId.value
    examStartedAt.value=new Date().toISOString()
    await checkpointExam()
    runExamTimer()
  }catch(error){activeExamAttemptId.value=null;notify(`无法开始考试：${String(error)}`)}
  finally{examSaving.value=false}
}
async function resumeExam(session:ExamSessionRecord){
  if(examSaving.value)return
  stopExamTimer()
  openSavedPaper(session.paper as SavedPaper)
  activeExamAttemptId.value=session.attempt.id;examAttemptPaperId=session.attempt.paperId;examStartedAt.value=session.attempt.startedAt
  examRemaining.value=session.attempt.remainingSeconds;examSubmitted.value=false
  Object.keys(examAnswers).forEach(key=>delete examAnswers[key])
  for(const answer of session.answers){const item=generatedPaper.value[answer.position-1];if(item&&answer.answer!=null)examAnswers[item.question.id]=answer.answer}
  const unanswered=generatedPaper.value.findIndex(item=>!examAnswers[item.question.id])
  examIndex.value=unanswered<0?0:unanswered
  activeView.value='exam';activeNavLabel.value='模拟考试'
  if(examRemaining.value<=0)await submitExam(true)
  else runExamTimer()
}

function stopExamTimer() {
  if (examTimer.value !== null) {
    window.clearInterval(examTimer.value)
    examTimer.value = null
  }
  document.querySelectorAll('audio').forEach(audio => audio.pause())
  isPlaying.value = false
}

function formatExamTime(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function answerExam(value: string) {
  if (!examCurrent.value || examSubmitted.value || examSaving.value || !activeExamAttemptId.value) return
  examAnswers[examCurrent.value.id] = value
  const position = examIndex.value + 1
  const response:ExamAnswerRecord={attemptId:activeExamAttemptId.value,position,answer:value,reviewStatus:examCurrent.value.type==='简答题'?'待批阅':undefined}
  void enqueueExamWrite(()=>saveExamResponse(response)).catch(error=>notify(`答案保存失败：${String(error)}`))
}

function toggleExamChoice(letter: string) {
  if (!examCurrent.value || examSubmitted.value || examSaving.value || !activeExamAttemptId.value) return
  const multiple = examCurrent.value.answerMode === 'multiple' || answerLetters(examCurrent.value.correctAnswer).length > 1
  const current = answerLetters(examAnswers[examCurrent.value.id])
  const next = multiple
    ? (current.includes(letter) ? current.filter((answer) => answer !== letter) : [...current, letter].sort())
    : [letter]
  answerExam(next.join(','))
}

async function submitExam(timeout = false) {
  if(examSubmitted.value || examSaving.value || !activeExamAttemptId.value)return
  examSaving.value=true;stopExamTimer()
  try {
    await examWriteQueue
    const answers:ExamAnswerRecord[]=generatedPaper.value.map((item,index)=>{
      const answer=examAnswers[item.question.id]||''
      const correct=item.question.type==='判断题'?judgmentCorrect(answer,item.question.correctAnswer):item.question.type==='选择题'?choiceAnswersEqual(answer,item.question.correctAnswer):item.question.type==='填空题'?(item.question.fillAnswers||[]).some(expected=>normalizeAnswer(answer)===normalizeAnswer(expected)):false
      return {attemptId:activeExamAttemptId.value!,position:index+1,answer,score:item.question.type==='简答题'?undefined:correct?item.score:0,reviewStatus:item.question.type==='简答题'?'待批阅':'已评分'}
    })
    await finishExam({...currentAttempt()!,status:'已交卷',submittedAt:new Date().toISOString()},answers)
    examSubmitted.value=true
    notify(timeout?'考试时间到，系统已自动交卷':'已交卷，成绩与答卷已保存到考试记录')
  }catch(error){notify(`交卷未保存，请重试：${String(error)}`);if(examRemaining.value>0)runExamTimer()}
  finally{examSaving.value=false}
}

function nextExamQuestion() {
  if (examIndex.value < generatedPaper.value.length - 1) examIndex.value += 1
  else notify('已经是最后一道试题')
}

function previousExamQuestion() {
  if (examIndex.value > 0) examIndex.value -= 1
}

async function removeWrong(question: Question) {
  if (!await confirmDestructive(question.id)) { notify('已取消移出'); return }
  wrongQuestionIds.value = wrongQuestionIds.value.filter((id) => id !== question.id)
  if (window.musicBank) void window.musicBank.wrong.remove(question.id)
  notify(`已将 ${question.id} 移出错题本`)
}

function reviewWrong(question: Question) {
  studyMode.value = 'special'
  practiceGrade.value = '全部年级'
  practiceCategory.value = '全部分类'
  practiceAudioOnly.value = false
  const index = practiceQuestions.value.findIndex((item) => item.id === question.id)
  if (index >= 0) {
    delete practiceResponses[question.id]
    practiceIndex.value = index
    resetPractice()
    activeView.value = 'practice'
    activeNavLabel.value = '专项练习'
  } else notify('该题尚未发布，请先在题库中发布后练习')
}

watch([practiceGrade, practiceCategory, practiceAudioOnly], () => {
  practiceIndex.value = 0
  resetPractice()
}, { flush: 'sync' })

function clearPaper() { generatedPaper.value=[];activePaperId.value=null;paperError.value='' }

function openSavedPaper(paper: SavedPaper) {
  stopExamTimer()
  activeExamAttemptId.value=null
  activePaperId.value = paper.id
  paperConfig.name = paper.name
  paperConfig.grade = paper.grade
  paperConfig.totalScore = paper.totalScore
  paperConfig.duration = paper.durationMinutes
  paperConfig.seed = paper.seed || ''
  generatedPaper.value = paper.items.map((item) => ({ question: item.snapshot, score: item.score }))
  notify(`已载入 ${paper.name}，可以开始模拟考试`)
}

async function persistCurrentPaper() {
  const paper = {
    id: activePaperId.value || `PAPER-${Date.now()}`,
    name: paperConfig.name,
    grade: paperConfig.grade,
    totalScore: generatedPaper.value.reduce((sum, item) => sum + item.score, 0),
    durationMinutes: paperConfig.duration,
    seed: paperConfig.seed || undefined,
    items: generatedPaper.value.map((item, index) => ({ position: index + 1, questionId: item.question.id, score: item.score, snapshot: item.question })),
  }
  if (window.musicBank) await window.musicBank.papers.save(JSON.parse(JSON.stringify(paper)))
  else window.localStorage.setItem(`musicbank.paper.${paper.id}`, JSON.stringify(paper))
  activePaperId.value = paper.id
  if (window.musicBank) savedPapers.value = await window.musicBank.papers.list() as SavedPaper[]
  else savedPapers.value = [paper as SavedPaper, ...savedPapers.value.filter((item) => item.id !== paper.id)]
  return paper.id
}

async function exportBackup() {
  if (!window.musicBank?.backup) {
    notify('浏览器预览模式暂不支持文件备份，请使用桌面版 MusicBank')
    return
  }
  backupBusy.value = true
  try {
    const result = await window.musicBank.backup.export()
    if (!result.canceled) notify(`备份已导出：${result.questionCount || 0} 道试题，${result.assetCount || 0} 个素材`)
  } catch {
    notify('备份导出失败，请稍后重试')
  } finally {
    backupBusy.value = false
  }
}

async function importBackup() {
  if (!window.musicBank?.backup) {
    notify('浏览器预览模式暂不支持恢复，请使用桌面版 MusicBank')
    return
  }
  if (!window.confirm('恢复备份会替换当前本地题库、试卷、错题和素材，是否继续？')) return
  const password = window.prompt('为防止误恢复，请输入账户密码：')
  if (password === null) return
  backupBusy.value = true
  try {
    const result = await window.musicBank.backup.import(password)
    if (result.canceled) return
    questions.value = await window.musicBank.questions.list()
    savedPapers.value = await window.musicBank.papers.list()
    wrongQuestionIds.value = await window.musicBank.wrong.list()
    clearPaper()
    notify(`备份已恢复：${result.questionCount || 0} 道试题，${result.assetCount || 0} 个素材`)
  } catch {
    notify('备份恢复失败，文件可能已损坏或版本不兼容')
  } finally {
    backupBusy.value = false
  }
}

function handleShortcut(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (activeView.value === 'add' && addStep.value === 2) saveQuestion()
  }
  if (modifier && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    go('add')
  }
}

</script>

<template>
  <div class="app-shell" :class="{ 'dark-mode': isDark }">
    <aside class="sidebar">
      <div class="brand-lockup">
        <div class="brand-mark"><span></span><span></span><span></span></div>
        <div><div class="brand-name">MusicBank</div><div class="brand-subtitle">乐测题库</div></div>
      </div>
      <div class="workspace-switcher"><span class="workspace-dot"></span><span>小学音乐 · 主题库</span><svg-icon name="chevrons" /></div>
      <nav class="nav-scroll">
        <div v-for="group in navGroups" :key="group.label" class="nav-group">
          <div class="nav-label">{{ group.label }}</div>
          <button v-for="item in group.items" :key="item.label" class="nav-item" :class="{ active: activeNavLabel === item.label, accent: item.accent }" @click="go(item.id as View, item.label)">
            <svg-icon :name="item.icon" /><span>{{ item.label }}</span><span v-if="item.label === '我的错题'" class="nav-count">{{ wrongQuestions.length }}</span>
          </button>
        </div>
      </nav>
      <div class="sidebar-foot"><div class="sync-row"><span class="status-dot"></span><span>本地数据已同步</span><span class="sync-time">刚刚</span></div><div class="profile"><div class="avatar">{{ (userProfile?.nickname || '林').slice(0, 1) }}</div><div><strong>{{ userProfile?.nickname || '林老师' }}</strong><span>{{ userProfile?.userCode || '音乐教研组' }}</span></div><svg-icon name="more" /></div></div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumb"><span>MusicBank</span><svg-icon name="chevron" /><strong>{{ pageTitle }}</strong></div>
        <div class="topbar-actions"><div class="global-search"><svg-icon name="search" /><input v-model="search" placeholder="搜索试题、题号或知识点" /><kbd>⌘ K</kbd></div><button class="icon-button" aria-label="切换主题" @click="isDark = !isDark"><svg-icon :name="isDark ? 'sun' : 'moon'" /></button><button class="icon-button notification" aria-label="通知"><svg-icon name="bell" /><i></i></button></div>
      </header>

      <div class="page-content">
        <section v-if="activeView === 'dashboard'" class="view dashboard-view">
          <div class="hero-row"><div><div class="eyebrow">{{ greetingDate }}</div><h1>{{ greetingText }}，{{ greetingName }} <span class="wave">✦</span></h1><p>今天也来为孩子们准备一些好题吧。</p></div><button class="primary-button" @click="go('add')"><svg-icon name="plus" />新增试题 <span class="shortcut">⌘ N</span></button></div>
          <div class="stat-grid"><div class="stat-card featured"><div class="stat-top"><span class="stat-label">题库总量</span><span class="stat-icon violet"><svg-icon name="book" /></span></div><div class="stat-number">{{ questions.length.toLocaleString() }}</div><div class="stat-footer"><span class="positive">{{ publishedQuestionCount }} 道已发布</span><span>本地题库</span></div><div class="sparkline"><i v-for="h in [16,23,19,30,25,40,36,52,46,62,55,71]" :key="h" :style="{ height: `${h}%` }"></i></div></div><div class="stat-card"><div class="stat-top"><span class="stat-label">近期更新</span><span class="stat-icon blue"><svg-icon name="plus" /></span></div><div class="stat-number">{{ recentQuestionCount }}</div><div class="stat-footer"><span class="positive">刚刚、今天或昨天</span><span>按更新记录</span></div></div><div class="stat-card"><div class="stat-top"><span class="stat-label">待完善草稿</span><span class="stat-icon orange"><svg-icon name="edit" /></span></div><div class="stat-number">{{ draftQuestionCount }}</div><div class="stat-footer"><span class="neutral">需要关注</span></div></div><div class="stat-card"><div class="stat-top"><span class="stat-label">音频试题</span><span class="stat-icon green"><svg-icon name="music" /></span></div><div class="stat-number">{{ audioQuestionCount }}</div><div class="stat-footer"><span class="positive">占比 {{ questions.length ? Math.round(audioQuestionCount / questions.length * 100) : 0 }}%</span></div></div></div>
          <div class="dashboard-grid"><div class="panel recent-panel"><div class="panel-heading"><div><h2>最近编辑</h2><p>继续处理你最近编辑过的试题</p></div><button v-if="questions.length" class="text-button" @click="go('library')">查看全部 <svg-icon name="arrow" /></button></div><div v-if="questions.length" class="recent-list"><button v-for="q in questions.slice(0, 3)" :key="q.id" class="recent-item" @click="editQuestion(q)"><div class="question-type" :class="q.type === '选择题' ? 'purple' : q.type === '填空题' ? 'blue' : 'orange'">{{ q.type.slice(0, 1) }}</div><div class="recent-copy"><strong><QuestionText :text="q.title" :runs="q.titleRuns" /></strong><span>{{ q.id }} · {{ q.category }}</span></div><span class="updated">{{ q.updated }}</span><svg-icon name="chevron" /></button></div><div v-else class="dashboard-empty"><strong>还没有试题</strong><span>先创建一道题，最近编辑会显示在这里。</span><button class="text-button" @click="go('add')">创建第一道试题 <svg-icon name="plus" /></button></div></div><div class="panel distribution-panel"><div class="panel-heading"><div><h2>题型分布</h2><p>当前题库结构</p></div><button v-if="questions.length" class="more-button" @click="go('library')"><svg-icon name="more" /></button></div><div class="donut-wrap"><div class="donut" :style="{ background: questionDonutStyle }"><div class="donut-hole"><strong>{{ questions.length ? questions.length.toLocaleString() : '—' }}</strong><span>{{ questions.length ? '道试题' : '暂无数据' }}</span></div></div><div class="legend"><div><i class="dot purple"></i><span>选择题</span><strong>{{ questionTypeCounts.choice }}</strong></div><div><i class="dot blue"></i><span>填空题</span><strong>{{ questionTypeCounts.fill }}</strong></div><div><i class="dot" style="background:#48ae7d"></i><span>判断题</span><strong>{{ questionTypeCounts.judgment }}</strong></div><div><i class="dot orange"></i><span>简答题</span><strong>{{ questionTypeCounts.short }}</strong></div></div></div></div></div>
          <div class="panel insight-panel"><div class="insight-icon"><svg-icon name="spark" /></div><div><strong>题库小贴士</strong><p>听辨类试题的平均练习正确率为 <b>72%</b>，可以在“专项练习”中为学生增加更多反复听辨的机会。</p></div></div>
        </section>

        <section v-else-if="activeView === 'library'" class="view library-view"><div class="view-heading"><div><div class="eyebrow">题库管理 / 试题列表</div><h1>试题管理</h1><p>管理、编辑和发布你的音乐学科试题。</p></div><button class="primary-button" @click="go('add')"><svg-icon name="plus" />新增试题</button></div><div class="filter-bar"><div class="filter-search"><svg-icon name="search" /><input v-model="search" placeholder="搜索题号、题干或分类" /></div><select v-model="libraryFilter"><option>全部题型</option><option>选择题</option><option>填空题</option><option>判断题</option><option>简答题</option></select><button class="filter-button" :class="{ selected: showLibraryFilters }" @click="showLibraryFilters = !showLibraryFilters"><svg-icon name="sliders" />筛选</button><div class="view-toggle"><button class="selected"><svg-icon name="list" /></button><button><svg-icon name="grid" /></button></div></div><div v-if="showLibraryFilters" class="advanced-filters"><select v-model="libraryGrade"><option>全部年级</option><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select><select v-model="libraryCategory"><option>全部分类</option><option v-for="category in categoryNames" :key="category">{{ category }}</option></select><select v-model="libraryAssetFilter"><option>全部试题</option><option>仅含音频</option><option>仅含图片</option></select><button class="text-button" @click="libraryGrade = '全部年级'; libraryCategory = '全部分类'; libraryAssetFilter = '全部试题'">重置筛选</button></div><div class="table-panel"><div class="table-header"><span>试题信息</span><span>分类</span><span>题型</span><span>状态</span><span>更新于</span><span>操作</span></div><div v-for="q in filteredQuestions" :key="q.id" class="table-row" @click="editQuestion(q)"><div class="question-cell"><div class="question-type" :class="q.type === '选择题' ? 'purple' : q.type === '填空题' ? 'blue' : 'orange'">{{ q.type.slice(0, 1) }}</div><div><strong><QuestionText :text="q.title" :runs="q.titleRuns" /></strong><span>{{ q.id }} · {{ q.grade }} <i v-if="q.hasAudio"><svg-icon name="music" />音频</i><i v-if="q.hasImage"><svg-icon name="image" />图片</i></span></div></div><span class="category-pill">{{ q.category }}</span><span class="type-text">{{ q.type }}</span><span class="status-pill" :class="q.status === '已发布' ? 'published' : 'draft'"><i></i>{{ q.status }}</span><span class="updated">{{ q.updated }}</span><span class="row-actions" @click.stop><button title="编辑" @click="editQuestion(q)"><svg-icon name="edit" /></button><button title="复制" @click="duplicateQuestion(q)"><svg-icon name="copy" /></button><button title="发布或撤回" @click="toggleQuestionStatus(q)"><svg-icon name="check" /></button><button title="删除" @click="deleteQuestion(q)"><svg-icon name="trash" /></button></span></div><div v-if="!filteredQuestions.length" class="empty-state">没有找到匹配的试题</div><div class="table-footer"><span>共 {{ filteredQuestions.length }} 道试题</span><div class="pagination"><button class="active">1</button><button>2</button><button>3</button><span>…</span><button>12</button><button><svg-icon name="chevron" /></button></div></div></div></section>

        <PaperWorkspace v-else-if="activeView === 'papers'" :questions="questions" :papers="savedPapers" :mode="activeNavLabel" @update:papers="savedPapers=$event" @start-exam="openSavedPaper($event); go('exam','模拟考试')" />

        <section v-else-if="activeView === 'add'" class="view add-view"><div class="add-heading"><div><div class="eyebrow">题库管理 / 新增试题</div><h1>{{ currentSavedId ? '编辑试题' : '创建一道新试题' }}</h1><p>把灵感记录下来，建立更有质量的音乐学习内容。</p></div><div class="draft-indicator"><span class="status-dot"></span>{{ questionSaving ? '正在保存…' : '⌘ S 保存草稿' }}</div></div><div class="stepper"><button :class="{ active: addStep === 1, done: addStep > 1 }" @click="addStep = 1"><span>01</span><div><strong>基本信息</strong><small>先定义试题的归属</small></div></button><div class="step-line" :class="{ filled: addStep > 1 }"></div><button :class="{ active: addStep === 2 }" @click="addStep = 2"><span>02</span><div><strong>题目内容</strong><small>录入题干、答案与解析</small></div></button></div>
          <div v-if="addStep === 1" class="form-card"><div class="form-card-heading"><div><h2>基本信息</h2><p>为这道试题选择合适的分类和题型，系统会自动生成唯一题号。</p></div><div class="generated-id">题号 <strong>{{ currentSavedId || nextQuestionId }}</strong></div></div><div class="form-grid"><label class="field"><span>年级 <em>*</em></span><select v-model="form.grade"><option value="">请选择年级</option><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select></label><label class="field"><span>一级分类 <em>*</em></span><select v-model="form.category"><option value="">请选择一级分类</option><option v-for="category in categoryNames" :key="category">{{ category }}</option></select></label><label class="field"><span>二级分类 <small>选填</small></span><select v-model="form.subcategory"><option value="">选择二级分类</option><option v-for="subcategory in subcategoryNames" :key="subcategory">{{ subcategory }}</option></select></label><label class="field"><span>试题类型 <em>*</em></span><div class="type-options"><button v-for="type in ['选择题', '填空题', '判断题', '简答题']" :key="type" :class="{ selected: questionType === type }" @click="questionType = type as QuestionType"><span class="radio-dot"></span>{{ type }}</button></div></label><label class="field"><span>难度 <small>选填</small></span><div class="difficulty-options"><button v-for="level in ['基础', '中等', '进阶']" :key="level" :class="{ selected: form.difficulty === level }" @click="form.difficulty = level">{{ level }}</button></div></label><label class="field"><span>试题来源 <small>选填</small></span><input v-model="form.source" placeholder="例如：2025 年省测真题" /></label></div><div class="form-tip"><svg-icon name="info" /><span>题型可以在后续步骤中随时调整，音乐听辨内容可与四种题型自由组合。</span></div><div v-if="formError" class="form-error"><svg-icon name="info" />{{ formError }}</div><div class="form-actions"><button class="ghost-button" @click="go('library')">取消</button><button class="primary-button" @click="form.grade && form.category ? (formError = '', addStep = 2) : (formError = '请先选择年级和一级分类。')">下一步 <svg-icon name="arrow" /></button></div></div>
          <div v-else class="editor-layout"><div class="editor-main"><div class="editor-card"><div class="section-heading"><div class="section-index">01</div><div><h2>题目</h2><p>输入题干内容，可插入图片、音频或音乐记谱符号。</p></div><span class="required-label">必填</span></div><PromptEditor :text="form.prompt" :runs="promptRuns" @change="(text, runs) => { form.prompt = text; promptRuns = runs }"><button @click="openImagePicker"><svg-icon name="image" />图片</button><button @click="openAudioPicker"><svg-icon name="music" />音频</button><button type="button" title="打开谱面编辑器，完成后生成题目图片" aria-label="打开谱面编辑器" aria-haspopup="dialog" :aria-expanded="showNotationPanel" @click="openNotationEditor"><svg-icon name="music" />谱面</button></PromptEditor><teleport to="body"><NotationEditor v-if="showNotationPanel" :source="notationDocument" :busy="notationExportBusy" @change="notationDocument = $event" @close="closeNotationEditor" @export="exportNotationImage" /></teleport><teleport to="body"><transition name="preview-modal"><div v-if="showQuestionPreview" class="question-preview-backdrop" @click.self="closeQuestionPreview"><section class="question-preview-modal" role="dialog" aria-modal="true" aria-labelledby="question-preview-title"><header class="question-preview-header"><div><div class="eyebrow">MusicBank · 题目预览</div><h2 id="question-preview-title">{{ questionType }} · {{ form.grade || '六年级' }}</h2></div><button type="button" class="icon-button" aria-label="关闭题目预览" @click="closeQuestionPreview"><svg-icon name="close" /></button></header><div class="question-preview-paper"><div class="question-preview-meta"><span>{{ form.category || '音乐综合' }}</span><span>{{ form.difficulty }}</span><span>草稿预览</span></div><h3><QuestionText :text="form.prompt || '请输入题目内容...'" :runs="promptRuns" /></h3><QuestionMedia :attachments="attachments" /><div v-if="questionType === '选择题'" class="question-preview-options"><div v-for="(letter, index) in (showMore ? ['A','B','C','D','E','F'] : ['A','B','C','D'])" :key="letter"><b>{{ letter }}.</b><span>{{ optionTexts[index] || '待填写' }}</span></div></div><div v-else-if="questionType === '判断题'" class="question-preview-answer-line">判断：（　　）　√ 正确　× 错误</div><div v-else-if="questionType === '填空题'" class="question-preview-answer-line">请填写答案：＿＿＿＿＿＿</div><div v-else class="question-preview-answer-line">请结合题干作答。</div></div><footer class="question-preview-footer"><span>这是学生看到的题目样式，正确答案与解析不会显示。</span><button type="button" class="primary-button" @click="closeQuestionPreview">继续编辑</button></footer></section></div></transition></teleport><input ref="imageInput" class="hidden-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp" @change="handleImageChange" /><input ref="audioInput" class="hidden-file-input" type="file" multiple accept="audio/mpeg,audio/wav,.mp3,.wav" @change="handleAudioChange" /><p v-if="mediaImportBusy" role="status" class="media-import-status">正在将素材保存到应用…</p><QuestionMedia :attachments="attachments" editable @remove="removeAttachment" @duration="syncAudioDuration" /></div><div class="editor-card"><div class="section-heading"><div class="section-index">02</div><div><h2>答案</h2><p>填写正确答案，系统会在练习和考试时使用。</p></div><span class="required-label">必填</span></div><div v-if="questionType === '选择题'" class="options-editor"><div class="choice-mode-row"><span>正确答案方式</span><div class="choice-mode-toggle"><button type="button" :class="{ selected: choiceMode === 'single' }" @click="setChoiceMode('single')">单选</button><button type="button" :class="{ selected: choiceMode === 'multiple' }" @click="setChoiceMode('multiple')">多选</button></div><small>{{ choiceMode === 'multiple' ? '可同时选择多个正确选项' : '只能选择一个正确选项' }}</small></div><div v-for="(letter, index) in (showMore ? ['A','B','C','D','E','F'] : ['A','B','C','D'])" :key="letter" class="option-row"><button type="button" class="option-radio" :class="{ selected: selectedAnswers.includes(letter), multiple: choiceMode === 'multiple' }" @click="toggleChoiceAnswer(letter)"><span></span></button><b>{{ letter }}</b><input v-model="optionTexts[index]" :placeholder="`请输入选项 ${letter} 的内容`" /><button v-if="letter === 'D' && !showMore" type="button" class="remove-option" @click="showMore = true"><svg-icon name="plus" />增加选项</button></div><button v-if="showMore" type="button" class="add-option" @click="collapseOptions">收起扩展选项</button></div><div v-else-if="questionType === '判断题'" class="judgment-options" role="group" aria-label="判断题正确答案"><button v-for="value in ['true','false']" :key="value" type="button" :aria-pressed="judgmentAnswer === value" :class="{selected:judgmentAnswer === value}" @click="judgmentAnswer = value">{{ judgmentLabel(value) }}</button></div><textarea v-else-if="questionType === '填空题'" v-model="form.fillAnswer" class="answer-textarea" placeholder="请输入标准答案，每行一个空"></textarea><textarea v-else v-model="form.shortAnswer" class="answer-textarea large" placeholder="请输入参考答案，可分段填写"></textarea></div><div class="editor-card"><div class="section-heading"><div class="section-index">03</div><div><h2>解析</h2><p>帮助学生理解答案背后的音乐知识。</p></div><span class="optional-label">选填</span></div><textarea v-model="form.explanation" class="answer-textarea explanation" placeholder="请输入试题解析、听辨技巧或作品背景..."></textarea></div><div v-if="formError" class="form-error editor-error"><svg-icon name="info" />{{ formError }}</div></div><aside class="editor-aside"><div class="aside-card"><div class="aside-heading"><h3>录入提示</h3><svg-icon name="spark" /></div><div class="aside-tip"><span>01</span><p>题干尽量使用完整、清晰的句子。</p></div><div class="aside-tip"><span>02</span><p>音频建议控制在 30MB 以内，支持 MP3 和 WAV。</p></div><div class="aside-tip"><span>03</span><p>答案选项至少保留两个有效内容。</p></div></div><div class="aside-card preview-card"><div class="aside-heading"><h3>实时预览</h3><button class="text-button" @click="openQuestionPreview">打开预览 <svg-icon name="arrow" /></button></div><div class="preview-paper"><span class="preview-label">{{ questionType }} · {{ form.grade || '六年级' }}</span><strong><QuestionText :text="form.prompt || '请输入题目内容...'" :runs="promptRuns" /></strong><div v-if="attachments.length" class="mini-audio"><span>{{ attachments.filter(item=>item.assetType==='image').length }} 张图片 · {{ attachments.filter(item=>item.assetType==='audio').length }} 段音频</span></div><div class="mini-options" v-if="questionType === '选择题'"><span v-for="(letter, index) in ['A','B','C','D']" :key="letter">{{ letter }}. {{ optionTexts[index] || '待填写' }}</span></div><div v-else class="mini-answer">{{ questionType === '判断题' ? judgmentLabel(judgmentAnswer) : questionType === '填空题' ? (form.fillAnswer || '待填写标准答案') : (form.shortAnswer || '待填写参考答案') }}</div></div></div></aside></div><div v-if="addStep === 2" class="save-bar"><button class="ghost-button" @click="addStep = 1">返回上一步</button><div><button class="secondary-button" :disabled="questionSaving" @click="saveQuestion()">保存草稿 <span>⌘ S</span></button><button class="secondary-button" :disabled="questionSaving" @click="saveQuestion(true)">保存并新增</button><button class="primary-button" :disabled="questionSaving" @click="publishQuestion">保存并发布 <svg-icon name="arrow" /></button></div></div>
        </section>
        <section v-else-if="activeView === 'practice'" class="view practice-view"><div class="practice-heading"><div><div class="eyebrow">学习与考试 / 顺序练习</div><h1>{{ studyMode === 'special' ? '专项练习' : '顺序练习' }}</h1><p>按题库顺序练习，提交后查看答案和解析。</p></div><div class="practice-progress"><strong>{{ practiceIndex + 1 }}</strong><span>/ {{ practiceQuestions.length || 0 }} 题</span></div></div><div v-if="studyMode === 'special'" class="filter-bar"><select v-model="practiceGrade" aria-label="练习年级"><option>全部年级</option><option v-for="grade in ['一年级','二年级','三年级','四年级','五年级','六年级']" :key="grade">{{ grade }}</option></select><select v-model="practiceCategory" aria-label="练习分类"><option>全部分类</option><option v-for="category in practiceCategories" :key="category">{{ category }}</option></select><button type="button" class="filter-button" :aria-pressed="practiceAudioOnly" @click="practiceAudioOnly = !practiceAudioOnly"><svg-icon name="music" />{{ practiceAudioOnly ? '仅含音频 ✓' : '仅含音频' }}</button></div><div v-if="practiceCurrent" class="practice-layout"><div class="practice-main"><div class="practice-meta"><span class="category-pill">{{ practiceCurrent.grade }}</span><span class="category-pill">{{ practiceCurrent.category }}</span><span class="type-text">{{ practiceCurrent.type }}</span><span class="practice-id">{{ practiceCurrent.id }}</span></div><div class="practice-card"><div class="practice-card-top"><span class="practice-number">{{ String(practiceIndex + 1).padStart(2, '0') }}</span><span v-if="practiceCurrent.hasAudio" class="audio-badge"><svg-icon name="music" />听辨题</span></div><h2><QuestionText :text="practiceCurrent.title" :runs="practiceCurrent.titleRuns" /></h2><QuestionMedia :attachments="practiceAttachments" :missing-image="practiceCurrent.hasImage && !practiceAttachments.some(item=>item.assetType==='image')" :missing-audio="practiceCurrent.hasAudio && !practiceAttachments.some(item=>item.assetType==='audio')" /><div v-if="practiceCurrent.type === '选择题'"><div class="choice-answer-hint">{{ practiceCurrent.answerMode === 'multiple' || answerLetters(practiceCurrent.correctAnswer).length > 1 ? '多选题 · 可选择多个答案' : '单选题 · 请选择一个答案' }}</div><div class="practice-options"><button v-for="(option, index) in (practiceCurrent.options || ['二胡','小提琴','琵琶','竹笛'])" :key="option + index" :class="{ selected: practiceChoiceAnswers.includes(String.fromCharCode(65 + index)), multiple: practiceCurrent.answerMode === 'multiple' || answerLetters(practiceCurrent.correctAnswer).length > 1, correct: practiceSubmitted && answerLetters(practiceCurrent.correctAnswer).includes(String.fromCharCode(65 + index)), incorrect: practiceSubmitted && practiceChoiceAnswers.includes(String.fromCharCode(65 + index)) && !answerLetters(practiceCurrent.correctAnswer).includes(String.fromCharCode(65 + index)) && practiceResult === 'wrong' }" @click="togglePracticeChoice(String.fromCharCode(65 + index))"><span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}</button></div></div><div v-else-if="practiceCurrent.type === '判断题'" class="judgment-options" role="group" aria-label="判断题作答"><button v-for="value in ['true','false']" :key="value" type="button" :disabled="practiceSubmitted" :aria-pressed="practiceAnswer === value" :class="{selected:practiceAnswer === value,correct:practiceSubmitted && practiceCurrent.correctAnswer===value}" @click="practiceAnswer=value">{{ judgmentLabel(value) }}</button></div><textarea v-else-if="practiceCurrent.type === '填空题'" v-model="practiceAnswer" :readonly="practiceSubmitted" class="practice-answer-input" placeholder="请输入答案"></textarea><textarea v-else v-model="practiceAnswer" :readonly="practiceSubmitted" class="practice-answer-input large" placeholder="请输入你的答案，提交后与参考答案对照"></textarea><div v-if="practiceSubmitted" class="practice-feedback" :class="practiceResult"><div class="feedback-icon"><svg-icon :name="practiceResult === 'correct' ? 'check' : practiceResult === 'pending' ? 'info' : 'close'" /></div><div><strong>{{ practiceResult === 'correct' ? '回答正确' : practiceResult === 'pending' ? '请自我核对参考答案' : '再想一想' }}</strong><p v-if="practiceResult === 'wrong'">正确答案：{{ practiceCurrent.type === '判断题' ? judgmentLabel(practiceCurrent.correctAnswer) : practiceCurrent.type === '选择题' ? formatChoiceAnswer(practiceCurrent.correctAnswer) : (practiceCurrent.fillAnswers?.[0] || '参考答案见下方解析') }}</p><p v-else-if="practiceResult === 'pending'">简答题暂不自动评分，请结合参考答案判断是否掌握。</p></div></div><div v-if="practiceSubmitted && (practiceCurrent.explanation || practiceCurrent.referenceAnswer || practiceResult !== 'correct')" class="practice-explanation"><strong>解析</strong><p>{{ practiceCurrent.explanation || practiceCurrent.referenceAnswer || '这道题的解析正在完善中。' }}</p></div></div><div class="practice-actions"><button class="ghost-button" :disabled="practiceIndex === 0" @click="previousPractice"><svg-icon name="chevron-left" />上一题</button><button v-if="!practiceSubmitted" class="primary-button" @click="submitPractice">提交答案 <svg-icon name="arrow" /></button><button v-else class="primary-button" @click="nextPractice">下一题 <svg-icon name="arrow" /></button></div></div><aside class="practice-aside"><div class="aside-card practice-stat-card"><div class="aside-heading"><h3>本次练习</h3><svg-icon name="spark" /></div><div class="practice-score"><strong>{{ practiceSubmitted && practiceResult === 'correct' ? '100' : '—' }}</strong><span>当前得分</span></div><div class="practice-stat-row"><span>已完成</span><b>{{ practiceCompletedCount }} / {{ practiceQuestions.length }}</b></div><div class="practice-stat-row"><span>正确率</span><b>{{ practiceAccuracy }}</b></div></div><div class="aside-card question-map"><div class="aside-heading"><h3>答题卡</h3><span>{{ practiceQuestions.length }} 题</span></div><div class="map-grid"><button v-for="(_, index) in practiceQuestions" :key="index" :class="{ current: index === practiceIndex, answered: Boolean(practiceResponses[practiceQuestions[index].id]) }" @click="practiceIndex = index; resetPractice()">{{ index + 1 }}</button></div></div></aside></div><div v-else class="empty-practice"><div class="placeholder-icon"><svg-icon name="book" /></div><h2>{{ studyMode === 'special' ? '没有符合筛选条件的试题' : '还没有已发布试题' }}</h2><p>请调整筛选条件，或创建并发布试题后再练习。</p><button class="primary-button" @click="go('add')">去新增试题 <svg-icon name="arrow" /></button></div></section>

        <ExamHistory v-else-if="activeView === 'exam-history'" @resume="resumeExam" />
        <section v-else-if="activeView === 'exam'" class="view exam-view"><div class="exam-topbar"><div><div class="eyebrow">学习与考试 / 模拟考试</div><h1>{{ paperConfig.name }}</h1><p>{{ generatedPaper.length }} 道试题 · 交卷前不显示答案和解析</p></div><div class="exam-timer" :class="{ urgent: examRemaining < 300 }"><svg-icon name="clock" /><strong>{{ formatExamTime(examRemaining) }}</strong><span>剩余时间</span></div><button class="primary-button" :disabled="examSubmitted || examSaving" @click="submitExam()">{{ examSubmitted ? '已交卷' : examSaving ? '保存中…' : '交卷' }} <svg-icon name="check" /></button></div><div v-if="examCurrent" class="exam-layout"><main class="exam-main"><div class="exam-card"><div class="exam-card-head"><span>第 {{ examIndex + 1 }} / {{ generatedPaper.length }} 题</span><span>{{ examCurrent.type }} · {{ generatedPaper[examIndex].score }} 分</span></div><h2><QuestionText :text="examCurrent.title" :runs="examCurrent.titleRuns" /></h2><QuestionMedia :attachments="examAttachments" :missing-image="examCurrent.hasImage && !examAttachments.some(item=>item.assetType==='image')" :missing-audio="examCurrent.hasAudio && !examAttachments.some(item=>item.assetType==='audio')" /><div v-if="examCurrent.type === '选择题'"><div class="choice-answer-hint">{{ examCurrent.answerMode === 'multiple' || answerLetters(examCurrent.correctAnswer).length > 1 ? '多选题 · 可选择多个答案' : '单选题 · 请选择一个答案' }}</div><div class="practice-options"><button v-for="(option, index) in (examCurrent.options || [])" :key="option + index" :class="{ selected: answerLetters(examAnswers[examCurrent.id]).includes(String.fromCharCode(65 + index)), multiple: examCurrent.answerMode === 'multiple' || answerLetters(examCurrent.correctAnswer).length > 1 }" @click="toggleExamChoice(String.fromCharCode(65 + index))"><span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}</button></div></div><div v-else-if="examCurrent.type === '判断题'" class="judgment-options" role="group" aria-label="考试判断题作答"><button v-for="value in ['true','false']" :key="value" type="button" :disabled="examSubmitted" :aria-pressed="examAnswers[examCurrent.id] === value" :class="{selected:examAnswers[examCurrent.id] === value}" @click="answerExam(value)">{{ judgmentLabel(value) }}</button></div><textarea v-else-if="examCurrent.type === '填空题'" class="practice-answer-input" :value="examAnswers[examCurrent.id] || ''" :readonly="examSubmitted || examSaving" placeholder="请输入答案" @input="answerExam(($event.target as HTMLTextAreaElement).value)"></textarea><textarea v-else class="practice-answer-input large" :value="examAnswers[examCurrent.id] || ''" :readonly="examSubmitted || examSaving" placeholder="请输入你的答案" @input="answerExam(($event.target as HTMLTextAreaElement).value)"></textarea><div v-if="examSubmitted" class="exam-result"><strong>客观题得分 {{ examScore }} 分</strong><span v-if="generatedPaper.some((item) => item.question.type === '简答题')">简答题待人工阅卷</span><p>参考答案：{{ examCurrent.type === '判断题' ? judgmentLabel(examCurrent.correctAnswer) : examCurrent.type === '选择题' ? formatChoiceAnswer(examCurrent.correctAnswer) : (examCurrent.fillAnswers || []).join('、') || examCurrent.referenceAnswer || '请结合参考答案人工阅卷' }}</p><p v-if="examCurrent.explanation">解析：{{ examCurrent.explanation }}</p></div></div><div class="practice-actions"><button class="ghost-button" :disabled="examIndex === 0" @click="previousExamQuestion"><svg-icon name="chevron-left" />上一题</button><button v-if="!examSubmitted" class="secondary-button" @click="nextExamQuestion">{{ examIndex === generatedPaper.length - 1 ? '检查答题' : '下一题' }} <svg-icon name="arrow" /></button><button v-else class="primary-button" @click="go('dashboard')">返回首页 <svg-icon name="arrow" /></button></div></main><aside class="practice-aside"><div class="aside-card practice-stat-card"><div class="aside-heading"><h3>答题进度</h3><svg-icon name="clock" /></div><div class="practice-score"><strong>{{ Object.keys(examAnswers).length }}</strong><span>/ {{ generatedPaper.length }} 已答</span></div><div class="practice-stat-row"><span>考试状态</span><b>{{ examSubmitted ? '已交卷' : '进行中' }}</b></div><div class="practice-stat-row"><span>考试时长</span><b>{{ paperConfig.duration }} 分钟</b></div></div><div class="aside-card question-map"><div class="aside-heading"><h3>答题卡</h3><span>{{ generatedPaper.length }} 题</span></div><div class="map-grid"><button v-for="(item, index) in generatedPaper" :key="item.question.id" :class="{ current: index === examIndex, answered: Boolean(examAnswers[item.question.id]) }" @click="examIndex = index">{{ index + 1 }}</button></div></div></aside></div><div v-else class="empty-practice"><div class="placeholder-icon"><svg-icon name="layers" /></div><h2>还没有可用试卷</h2><p>请先在随机组卷中生成一份试卷草稿。</p><button class="primary-button" @click="go('papers', '随机组卷')">去随机组卷 <svg-icon name="arrow" /></button></div></section>

        <section v-else-if="activeView === 'wrong'" class="view wrong-view"><div class="view-heading"><div><div class="eyebrow">学习与考试 / 错题复习</div><h1>我的错题</h1><p>复习做错的题目，保留图片和音频引用。</p></div><div class="paper-status"><span class="status-dot"></span>{{ wrongQuestions.length }} 道待复习</div></div><div v-if="wrongQuestions.length" class="wrong-list"><div v-for="question in wrongQuestions" :key="question.id" class="wrong-item"><div class="question-type" :class="question.type === '选择题' ? 'purple' : question.type === '填空题' ? 'blue' : 'orange'">{{ question.type.slice(0, 1) }}</div><div class="wrong-copy"><strong>{{ question.title }}</strong><span>{{ question.id }} · {{ question.grade }} · {{ question.category }}<i v-if="question.hasAudio"><svg-icon name="music" />音频</i><i v-if="question.hasImage"><svg-icon name="image" />图片</i></span></div><button class="secondary-button" @click="reviewWrong(question)">重新练习</button><button class="icon-button" title="移出错题本" @click="removeWrong(question)"><svg-icon name="close" /></button></div></div><div v-else class="empty-practice wrong-empty"><h2>暂时没有错题</h2><p>练习中答错的题目会自动出现在这里。</p><button class="primary-button" @click="go('practice', '顺序练习')">开始练习 <svg-icon name="arrow" /></button></div></section>

        <section v-else-if="activeView === 'backup'" class="view backup-view">
          <div class="view-heading"><div><div class="eyebrow">系统 / 数据安全</div><h1>数据备份</h1><p>将题库、试卷、错题和应用内图片/音频素材保存为一个可恢复文件。</p></div><span class="paper-status"><span class="status-dot"></span>数据保存在本机</span></div>
          <div class="backup-grid">
            <div class="backup-card backup-card-primary"><div class="backup-card-icon"><svg-icon name="archive" /></div><div class="backup-card-copy"><h2>导出备份</h2><p>导出当前 MusicBank 数据。图片和音频会从应用数据文件夹一起打包，不依赖原始文件位置。</p></div><button class="primary-button" :disabled="backupBusy" @click="exportBackup"><svg-icon name="archive" />{{ backupBusy ? '处理中…' : '导出备份' }}</button></div>
            <div class="backup-card"><div class="backup-card-icon blue"><svg-icon name="arrow" /></div><div class="backup-card-copy"><h2>恢复备份</h2><p>从 `.musicbank.json` 文件恢复题库。恢复会替换当前本地数据，并要求输入账户密码确认。</p></div><button class="secondary-button" :disabled="backupBusy" @click="importBackup"><svg-icon name="arrow" />{{ backupBusy ? '处理中…' : '选择备份文件' }}</button></div>
          </div>
          <div class="panel backup-info-panel"><div class="panel-heading"><div><h2>备份内容</h2><p>文件内包含可继续编辑和练习所需的数据。</p></div><svg-icon name="info" /></div><div class="backup-content-list"><div><span class="backup-check">✓</span><span>试题、答案、解析和音乐记谱符号</span></div><div><span class="backup-check">✓</span><span>已保存试卷与试卷快照</span></div><div><span class="backup-check">✓</span><span>练习错题关联</span></div><div><span class="backup-check">✓</span><span>应用数据文件夹中的图片与 MP3/WAV 音频</span></div></div></div>
        </section>
        <section v-else-if="activeView === 'settings'" class="view settings-view">
          <div class="view-heading"><div><div class="eyebrow">系统 / 偏好设置</div><h1>系统设置</h1><p>调整 MusicBank 的显示偏好、本地数据和账户安全。</p></div></div>
          <div class="settings-grid">
            <div class="panel settings-card account-settings-card">
              <div class="panel-heading"><div><h2>用户设置</h2><p>账户资料保存在本机，不会上传到网络。</p></div></div>
              <div class="account-field-grid"><label class="field"><span>用户名</span><input :value="userProfile?.username || '尚未建立用户'" readonly /></label><label class="field"><span>用户编码</span><input v-model="profileForm.userCode" :disabled="!userProfile || accountBusy" /></label><label class="field account-field-wide"><span>昵称</span><input v-model="profileForm.nickname" :disabled="!userProfile || accountBusy" /></label></div>
              <button class="primary-button settings-save-button" :disabled="!userProfile || accountBusy" @click="saveUserProfile">保存用户资料 <svg-icon name="check" /></button>
              <div class="security-divider"></div>
              <div class="security-section"><div><strong>修改密码</strong><span>需要输入当前密码，修改后立即生效。</span></div><div class="security-fields"><input v-model="passwordForm.currentPassword" type="password" placeholder="当前密码" :disabled="accountBusy" /><input v-model="passwordForm.nextPassword" type="password" placeholder="新密码（至少 6 位）" :disabled="accountBusy" /><input v-model="passwordForm.confirmPassword" type="password" placeholder="确认新密码" :disabled="accountBusy" /><button class="secondary-button" :disabled="accountBusy" @click="changeUserPassword">修改密码</button></div></div>
              <div class="security-section reset-section"><div><strong>重置密码</strong><span>重新输入用户编码验证身份后设置新密码。</span></div><div class="security-fields"><input v-model="resetPasswordForm.userCode" placeholder="输入用户编码" :disabled="accountBusy || !userProfile" autocomplete="username" /><input v-model="resetPasswordForm.nextPassword" type="password" placeholder="新密码（至少 6 位）" :disabled="accountBusy" autocomplete="new-password" /><input v-model="resetPasswordForm.confirmPassword" type="password" placeholder="确认新密码" :disabled="accountBusy" autocomplete="new-password" /><button class="secondary-button" :disabled="accountBusy || !userProfile" @click="resetUserPassword">重置密码</button></div></div>
            </div>
            <div class="settings-stack">
              <div class="panel settings-card"><div class="panel-heading"><div><h2>外观</h2><p>主题会保存在当前设备。</p></div></div><div class="setting-row"><div><strong>深色模式</strong><span>让编辑和考试界面在低光环境下更舒适。</span></div><button class="theme-switch" :class="{ enabled: isDark }" role="switch" :aria-checked="isDark" @click="isDark = !isDark"><i></i></button></div></div>
              <div class="panel settings-card"><div class="panel-heading"><div><h2>本地数据</h2><p>桌面版资源由 MusicBank 管理。</p></div></div><div class="data-location"><span class="data-location-dot"></span><div><strong>应用数据文件夹</strong><span>题库数据库、图片和音频会复制到 MusicBank 的应用数据目录，重启后仍可使用。</span><code class="data-root-path">{{ dataRootPath }}</code></div></div><button class="text-button" @click="go('backup')">前往数据备份 <svg-icon name="arrow" /></button></div>
            </div>
          </div>
        </section>
        <section v-else class="view placeholder-view"><div class="placeholder-icon"><svg-icon :name="activeView === 'wrong' ? 'bookmark' : activeView === 'papers' ? 'layers' : 'play'" /></div><div class="eyebrow">MusicBank · {{ pageTitle }}</div><h1>这一页正在准备中</h1><p>先从数据首页或新增试题开始，核心录题流程已经可以使用。</p><button class="primary-button" @click="go('dashboard')">返回数据首页 <svg-icon name="arrow" /></button></section>
      </div>
    </main>
    <div v-if="setupRequired" class="account-modal-backdrop">
      <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div class="account-modal-icon"><svg-icon name="settings" /></div><div class="eyebrow">MusicBank · 首次启动</div><h1 id="setup-title">建立本地用户</h1><p>首次使用前，请设置本机用户。账户信息和题库数据只保存在当前设备。</p>
        <div class="account-modal-fields"><label class="field"><span>用户名 <em>*</em></span><input v-model="setupForm.username" autocomplete="username" placeholder="例如：music.teacher" /></label><label class="field"><span>昵称 <em>*</em></span><input v-model="setupForm.nickname" placeholder="例如：林老师" /></label><label class="field"><span>密码 <em>*</em></span><input v-model="setupForm.password" type="password" autocomplete="new-password" placeholder="至少 6 位" /></label><label class="field"><span>确认密码 <em>*</em></span><input v-model="setupForm.confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入密码" /></label></div>
        <div v-if="setupError" class="form-error"><svg-icon name="info" />{{ setupError }}</div><button class="primary-button account-modal-submit" :disabled="setupBusy" @click="createInitialUser">{{ setupBusy ? '正在建立…' : '建立用户并开始使用' }} <svg-icon name="arrow" /></button>
      </section>
    </div>
    <transition name="toast"><div v-if="toast" class="toast-message"><svg-icon name="check" />{{ toast }}</div></transition>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue'

const paths: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layers: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
  shuffle: '<path d="M16 3h5v5M4 5h3c4 0 6 10 10 10h4M4 19h3c1.5 0 2.7-1.2 3.7-2.6M16 16l5 5M21 16v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bookmark: '<path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3-6 3V4.5Z"/>',
  archive: '<path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/>',
  settings: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2A2 2 0 0 0 5.8 17l-.1.1A2 2 0 1 1 2.9 14.3l.1-.1A2 2 0 0 0 1.6 11h-.2a2 2 0 0 1 0-4h.2A2 2 0 0 0 3 3.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.2 1h.2a2 2 0 0 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21 8.8h.2a2 2 0 0 1 0 4H21a2 2 0 0 0-1.6 2.2Z" transform="scale(.78) translate(3.4 3.4)"/>',
  chevrons: '<path d="m8 10 4-4 4 4M8 14l4 4 4-4"/>', chevron: '<path d="m9 5 7 7-7 7"/>', 'chevron-left': '<path d="m15 5-7 7 7 7"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>', moon: '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/>', copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3m-9 0 1 14h10l1-14"/>', music: '<path d="M9 18V5l10-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/>', sliders: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', bold: '<path d="M7 4h6a4 4 0 0 1 0 8H7V4Zm0 8h7a4 4 0 0 1 0 8H7v-8Z"/>', italic: '<path d="M10 4h8M6 20h8M14 4 10 20"/>', undo: '<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6"/>', redo: '<path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0-6 6"/>', pause: '<path d="M8 5v14M16 5v14"/>', volume: '<path d="M4 10v4h4l5 4V6l-5 4H4ZM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>', check: '<path d="m5 12 4 4L19 6"/>'
}

export default defineComponent({
  components: {
    SvgIcon: (props: { name: string }) => h('svg', { class: 'svg-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', innerHTML: paths[props.name] || paths.grid }),
  },
})
</script>
