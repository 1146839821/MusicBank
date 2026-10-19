<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

type View = 'dashboard' | 'library' | 'add' | 'papers' | 'practice' | 'exam' | 'wrong' | 'backup' | 'settings'
type QuestionType = '选择题' | '填空题' | '简答题'
type ChoiceMode = 'single' | 'multiple'

interface Question {
  id: string
  title: string
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
const choiceMode = ref<ChoiceMode>('single')
const selectedAnswers = ref<string[]>(['B'])
const isPlaying = ref(false)
const toast = ref('')
const showMore = ref(false)
const showQuestionPreview = ref(false)
const formError = ref('')
const currentSavedId = ref<string | null>(null)
const form = reactive({ grade: '', category: '', subcategory: '', difficulty: '基础', source: '', prompt: '请聆听下面的音乐片段，判断其演奏乐器。', explanation: '', fillAnswer: '', shortAnswer: '' })
const optionTexts = ref(['二胡', '小提琴', '琵琶', '竹笛', '', ''])
const audioInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const practiceAudioElement = ref<HTMLAudioElement | null>(null)
const audioAsset = reactive({ id: '', name: '音乐片段 A', url: '', duration: '01:25', mime: 'MP3' })
const imageAsset = ref('')
const imageAssetId = ref('')
const practiceIndex = ref(0)
const studyMode = ref<'sequence' | 'special'>('sequence')
const practiceAnswer = ref('')
const practiceChoiceAnswers = ref<string[]>([])
const practiceSubmitted = ref(false)
const practiceResult = ref<'correct' | 'wrong' | 'pending' | null>(null)
const paperConfig = reactive({ name: '六年级音乐阶段模拟卷', grade: '六年级', category: '全部分类', totalScore: 100, duration: 40, audioMode: '不限', seed: '', choiceCount: 20, choiceScore: 2, fillCount: 10, fillScore: 3, shortCount: 3, shortScore: 10 })
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
const examAudioElement = ref<HTMLAudioElement | null>(null)
const wrongQuestionIds = ref<string[]>([])
const paperError = ref('')
type NotationMode = 'jianpu' | 'staff'
interface NotationToken { id: number; label: string; glyph: string; category: string }
interface NotationGroup { label: string; items: Array<{ label: string; glyph: string; category?: string }> }

const showNotationPanel = ref(false)
const notationMode = ref<NotationMode>('jianpu')
const notationTokens = ref<NotationToken[]>([])
let notationTokenId = 0
const notationGroups: Record<NotationMode, NotationGroup[]> = {
  jianpu: [
    { label: '音级', items: ['1', '2', '3', '4', '5', '6', '7', '0'].map((glyph) => ({ label: glyph === '0' ? '休止符' : `音级 ${glyph}`, glyph })) },
    { label: '八度与时值', items: [
      { label: '上加一点', glyph: '1̇' }, { label: '上加两点', glyph: '1̇̇' }, { label: '下加一点', glyph: '1̣' }, { label: '下加两点', glyph: '1̣̣' },
      { label: '下单线', glyph: '1̲' }, { label: '下双线', glyph: '1̳' }, { label: '附点', glyph: '·' }, { label: '延长一拍', glyph: '—' },
    ] },
    { label: '连音与节奏', items: [
      { label: '连音线', glyph: '⌒' }, { label: '保持线', glyph: '⁀' }, { label: '二连音', glyph: '⟨2⟩' }, { label: '三连音', glyph: '⟨3⟩' }, { label: '五连音', glyph: '⟨5⟩' }, { label: '七连音', glyph: '⟨7⟩' },
    ] },
    { label: '小节与表情', items: [
      { label: '分拍线', glyph: '/' }, { label: '单竖线', glyph: '|' }, { label: '双竖线', glyph: '||' }, { label: '终止线', glyph: '|]' }, { label: '左反复', glyph: '||:' }, { label: '右反复', glyph: ':||' },
      { label: '渐慢', glyph: 'rit.' }, { label: '渐快', glyph: 'accel.' }, { label: '弱', glyph: 'p' }, { label: '强', glyph: 'f' },
    ] },
  ],
  staff: [
    { label: '音符时值', items: [
      { label: '全音符', glyph: '𝅝' }, { label: '二分音符', glyph: '𝅗𝅥' }, { label: '四分音符', glyph: '♩' }, { label: '八分音符', glyph: '♪' },
      { label: '十六分音符', glyph: '𝅘𝅥𝅯' }, { label: '三十二分音符', glyph: '𝅘𝅥𝅰' }, { label: '六十四分音符', glyph: '𝅘𝅥𝅱' },
      { label: '附点全音符', glyph: '𝅝.' }, { label: '附点二分音符', glyph: '𝅗𝅥.' }, { label: '附点四分音符', glyph: '♩.' }, { label: '附点八分音符', glyph: '♪.' },
      { label: '附点十六分音符', glyph: '𝅘𝅥𝅯.' }, { label: '附点三十二分音符', glyph: '𝅘𝅥𝅰.' }, { label: '附点六十四分音符', glyph: '𝅘𝅥𝅱.' },
      { label: '复附点全音符', glyph: '𝅝..' }, { label: '复附点二分音符', glyph: '𝅗𝅥..' }, { label: '复附点四分音符', glyph: '♩..' }, { label: '复附点八分音符', glyph: '♪..' },
      { label: '复附点十六分音符', glyph: '𝅘𝅥𝅯..' }, { label: '复附点三十二分音符', glyph: '𝅘𝅥𝅰..' }, { label: '复附点六十四分音符', glyph: '𝅘𝅥𝅱..' },
    ] },
    { label: '休止符', items: [
      { label: '全休止符', glyph: '𝄻' }, { label: '二分休止符', glyph: '𝄼' }, { label: '四分休止符', glyph: '𝄽' }, { label: '八分休止符', glyph: '𝄾' }, { label: '十六分休止符', glyph: '𝄿' }, { label: '六十四分休止符', glyph: '𝅁' },
    ] },
    { label: '连音与奏法', items: [
      { label: '连音线', glyph: '⁀' }, { label: '圆滑线', glyph: '⌒' }, { label: '二连音', glyph: '⟨2⟩' }, { label: '三连音', glyph: '⟨3⟩' }, { label: '五连音', glyph: '⟨5⟩' }, { label: '九连音', glyph: '⟨9⟩' },
      { label: '延长记号', glyph: '𝄐' }, { label: '断音', glyph: '•' }, { label: '保持音', glyph: '—' }, { label: '重音', glyph: '>' },
    ] },
    { label: '谱号与小节', items: [
      { label: '高音谱号', glyph: '𝄞' }, { label: '低音谱号', glyph: '𝄢' }, { label: '升号', glyph: '♯' }, { label: '降号', glyph: '♭' }, { label: '还原号', glyph: '♮' },
      { label: '四四拍', glyph: '4/4' }, { label: '三四拍', glyph: '3/4' }, { label: '六八拍', glyph: '6/8' }, { label: '单小节线', glyph: '|' }, { label: '双小节线', glyph: '||' }, { label: '终止线', glyph: '||]' },
    ] },
  ],
}
const activeNotationGroups = computed(() => notationGroups[notationMode.value])
const notationSummary = computed(() => notationTokens.value.length ? notationTokens.value.map((token) => token.glyph).join(' ') : '还没有加入谱面元素')

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '\"': '&quot;' }[character] || character))
}

function buildNotationSvg(mode: NotationMode, tokens: NotationToken[]) {
  const width = Math.max(720, 132 + tokens.length * 76)
  const height = mode === 'staff' ? 230 : 190
  const safeTokens = tokens.length ? tokens : [{ id: 0, label: '', glyph: '♩', category: '' }]
  const textFont = mode === 'staff' ? 'Bravura, "Noto Music", "Segoe UI Symbol", serif' : 'ui-rounded, "PingFang SC", "Microsoft YaHei", sans-serif'
  const background = mode === 'staff' ? '#fffdf8' : '#fff'
  const accent = mode === 'staff' ? '#243b72' : '#304b93'
  const lines = mode === 'staff' ? Array.from({ length: 5 }, (_, index) => `<line x1="62" y1="${76 + index * 18}" x2="${width - 46}" y2="${76 + index * 18}"/>`).join('') : ''
  const title = mode === 'staff' ? '五线谱片段' : '简谱片段'
  const tokenMarkup = safeTokens.map((token, index) => {
    const x = 92 + index * 76
    if (mode === 'staff') {
      const isBar = /[|]/.test(token.glyph)
      if (isBar) {
        const bar = (lineX: number, strokeWidth = 2) => `<line x1="${lineX}" y1="62" x2="${lineX}" y2="158" stroke-width="${strokeWidth}"/>`
        const dot = (dotX: number) => `<circle cx="${dotX}" cy="98" r="4" fill="${accent}" stroke="none"/><circle cx="${dotX}" cy="122" r="4" fill="${accent}" stroke="none"/>`
        if (token.glyph === '||') return `${bar(x - 6)}${bar(x + 6)}`
        if (token.glyph === '||]') return `${bar(x - 8)}${bar(x)}${bar(x + 10, 6)}`
        if (token.glyph === '|]') return `${bar(x - 5)}${bar(x + 7, 6)}`
        if (token.glyph === '||:') return `${bar(x - 7)}${bar(x + 5)}${dot(x + 15)}`
        if (token.glyph === ':||') return `${dot(x - 15)}${bar(x - 5)}${bar(x + 7)}`
        return bar(x)
      }
      return `<text x="${x}" y="126" class="staff-token">${escapeXml(token.glyph)}</text>`
    }
    const hasTopDot = token.glyph.includes('̇')
    const hasBottomDot = token.glyph.includes('̣')
    const hasSingle = token.glyph.includes('̲')
    const hasDouble = token.glyph.includes('̳')
    const display = token.glyph.replace(/[̣̲̳̇]/g, '')
    const top = hasTopDot ? `<circle cx="${x}" cy="${76}" r="3.5"/>` : ''
    const bottom = hasBottomDot ? `<circle cx="${x}" cy="${129}" r="3.5"/>` : ''
    const underline = hasDouble ? `<line x1="${x - 17}" y1="${142}" x2="${x + 17}" y2="${142}"/><line x1="${x - 17}" y1="${148}" x2="${x + 17}" y2="${148}"/>` : hasSingle ? `<line x1="${x - 17}" y1="${144}" x2="${x + 17}" y2="${144}"/>` : ''
    return `${top}${bottom}${underline}<text x="${x}" y="126" class="jianpu-token">${escapeXml(display)}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="18" fill="${background}"/><text x="32" y="35" class="notation-title">${title}</text><g fill="none" stroke="${accent}" stroke-linecap="round" stroke-linejoin="round">${lines}</g><g fill="${accent}" stroke="${accent}" stroke-linecap="round" stroke-linejoin="round" text-anchor="middle"><text x="${mode === 'staff' ? 38 : 42}" y="126" class="notation-clef">${mode === 'staff' ? '𝄞' : '1='}</text>${tokenMarkup}</g><text x="32" y="${height - 18}" class="notation-footer">MusicBank · ${escapeXml(notationSummary.value)}</text><style>.notation-title{font:600 14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#8b94a3}.notation-footer{font:10px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#a4acb8}.notation-clef{font:32px ${textFont};fill:${accent}}.staff-token{font:42px ${textFont};fill:${accent};stroke:none}.jianpu-token{font:32px ${textFont};fill:${accent};stroke:none}</style></svg>`
}
const notationSvg = computed(() => buildNotationSvg(notationMode.value, notationTokens.value))
const notationPreviewUrl = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(notationSvg.value)}`)

function openNotationEditor() {
  showNotationPanel.value = true
}
function switchNotationMode(mode: NotationMode) {
  if (notationMode.value === mode) return
  if (notationTokens.value.length) {
    notationTokens.value = []
    notify('已切换谱面类型，当前元素已清空')
  }
  notationMode.value = mode
}
function addNotationItem(item: { label: string; glyph: string; category?: string }, group: NotationGroup) {
  if (notationMode.value === 'jianpu' && group.label === '八度与时值' && (/[̣̲̳̇]/.test(item.glyph) || item.glyph === '·')) {
    const last = notationTokens.value[notationTokens.value.length - 1]
    if (!last || !/^[0-7](?:[̣̲̳̇]|·)*$/u.test(last.glyph)) {
      notify('请先选择一个简谱音级，再添加加点或下线')
      return
    }
    const modifier = item.glyph.replace(/1/g, '')
    last.glyph += modifier
    last.label = `${last.label} · ${item.label}`
    return
  }
  notationTokens.value.push({ id: ++notationTokenId, label: item.label, glyph: item.glyph, category: item.category || group.label })
}
function removeLastNotationItem() {
  notationTokens.value.pop()
}
function clearNotation() {
  notationTokens.value = []
}
function closeNotationEditor() {
  showNotationPanel.value = false
}

function openQuestionPreview() {
  showQuestionPreview.value = true
}

function closeQuestionPreview() {
  showQuestionPreview.value = false
}

async function exportNotationImage() {
  if (!notationTokens.value.length) {
    notify('请先在面板中加入至少一个谱面元素')
    return
  }
  const svgBlob = new Blob([notationSvg.value], { type: 'image/svg+xml;charset=utf-8' })
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
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备不支持谱面导出')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pngBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 导出失败')), 'image/png'))
    const bytes = await pngBlob.arrayBuffer()
    if (window.musicBank) {
      const imported = await window.musicBank.assets.import({ assetType: 'image', name: `MusicBank-谱面-${Date.now()}.png`, mimeType: 'image/png', bytes })
      if (imageAsset.value?.startsWith('blob:')) URL.revokeObjectURL(imageAsset.value)
      imageAssetId.value = imported.id
      imageAsset.value = imported.url
    } else {
      imageAssetId.value = ''
      imageAsset.value = canvas.toDataURL('image/png')
    }
    showNotationPanel.value = false
    notify('谱面已生成图片并加入当前题目')
  } catch (error) {
    notify(error instanceof Error ? error.message : '谱面导出失败')
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}


const navGroups = [
  { label: '题库管理', items: [{ id: 'dashboard', icon: 'grid', label: '数据首页' }, { id: 'library', icon: 'book', label: '试题管理' }, { id: 'add', icon: 'plus', label: '新增试题', accent: true }, { id: 'papers', icon: 'layers', label: '试卷管理' }] },
  { label: '学习与考试', items: [{ id: 'practice', icon: 'play', label: '顺序练习' }, { id: 'practice', icon: 'spark', label: '专项练习' }, { id: 'papers', icon: 'shuffle', label: '随机组卷' }, { id: 'exam', icon: 'clock', label: '模拟考试' }, { id: 'wrong', icon: 'bookmark', label: '我的错题' }] },
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

const nextQuestionId = computed(() => {
  const maxId = questions.value.reduce((max, question) => {
    const numericId = Number(question.id.match(/(\d+)$/)?.[1] || 0)
    return Math.max(max, numericId)
  }, 0)
  return `MUS-${String(maxId + 1).padStart(6, '0')}`
})
const practiceQuestions = computed(() => questions.value.filter((question) => question.status === '已发布' && (studyMode.value === 'sequence' || question.hasAudio || question.category === '音乐记号')))
const practiceCurrent = computed(() => practiceQuestions.value[practiceIndex.value] || practiceQuestions.value[0])
const examCurrent = computed(() => generatedPaper.value[examIndex.value]?.question)
const examScore = computed(() => generatedPaper.value.reduce((score, item) => {
  const answer = examAnswers[item.question.id]
  if (item.question.type === '简答题') return score
  const correct = item.question.type === '选择题' ? choiceAnswersEqual(answer, item.question.correctAnswer) : (item.question.fillAnswers || []).some((expected) => normalizeAnswer(answer) === normalizeAnswer(expected))
  return score + (correct ? item.score : 0)
}, 0))
const wrongQuestions = computed(() => questions.value.filter((question) => wrongQuestionIds.value.includes(question.id)))
const practiceAudioUrl = computed(() => {
  const assetId = practiceCurrent.value?.audioAssetId
  return assetId && window.musicBank ? window.musicBank.assets.url(assetId) : ''
})
const examAudioUrl = computed(() => {
  const assetId = examCurrent.value?.audioAssetId
  return assetId && window.musicBank ? window.musicBank.assets.url(assetId) : ''
})
const practiceImageUrl = computed(() => {
  const assetId = practiceCurrent.value?.imageAssetId
  return assetId && window.musicBank ? window.musicBank.assets.url(assetId) : ''
})
const examImageUrl = computed(() => {
  const assetId = examCurrent.value?.imageAssetId
  return assetId && window.musicBank ? window.musicBank.assets.url(assetId) : ''
})
const publishedPool = computed(() => questions.value.filter((question) => question.status === '已发布' && (paperConfig.grade === '全部年级' || !paperConfig.grade || question.grade === paperConfig.grade) && (paperConfig.category === '全部分类' || question.category === paperConfig.category) && (paperConfig.audioMode === '不限' || (paperConfig.audioMode === '仅含音频' ? question.hasAudio : !question.hasAudio))))
const paperTotal = computed(() => paperConfig.choiceCount * paperConfig.choiceScore + paperConfig.fillCount * paperConfig.fillScore + paperConfig.shortCount * paperConfig.shortScore)
const paperCounts = computed(() => ({ '选择题': paperConfig.choiceCount, '填空题': paperConfig.fillCount, '简答题': paperConfig.shortCount }))
const poolCounts = computed(() => ({ '选择题': publishedPool.value.filter((question) => question.type === '选择题').length, '填空题': publishedPool.value.filter((question) => question.type === '填空题').length, '简答题': publishedPool.value.filter((question) => question.type === '简答题').length }))
const publishedQuestionCount = computed(() => questions.value.filter((question) => question.status === '已发布').length)
const draftQuestionCount = computed(() => questions.value.filter((question) => question.status === '草稿').length)
const audioQuestionCount = computed(() => questions.value.filter((question) => question.hasAudio).length)
const recentQuestionCount = computed(() => questions.value.filter((question) => question.updated === '刚刚' || question.updated.includes('今天') || question.updated.includes('昨天')).length)
const questionTypeCounts = computed(() => ({ choice: questions.value.filter((question) => question.type === '选择题').length, fill: questions.value.filter((question) => question.type === '填空题').length, short: questions.value.filter((question) => question.type === '简答题').length }))
const questionDonutStyle = computed(() => {
  if (!questions.value.length) return 'conic-gradient(#e8ebf1 0 100%)'
  const total = questions.value.length
  const choiceEnd = questionTypeCounts.value.choice / total * 100
  const fillEnd = choiceEnd + questionTypeCounts.value.fill / total * 100
  return `conic-gradient(#8870e8 0 ${choiceEnd}%, #5a8bf1 ${choiceEnd}% ${fillEnd}%, #f2a367 ${fillEnd}% 100%)`
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
  if (practiceAudioElement.value) {
    practiceAudioElement.value.pause()
    practiceAudioElement.value.currentTime = 0
  }
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

const pageTitle = computed(() => activeView.value === 'papers' || activeView.value === 'exam' ? activeNavLabel.value : ({ dashboard: '数据首页', library: '试题管理', add: '新增试题', practice: activeNavLabel.value, wrong: '我的错题', backup: '数据备份', settings: '系统设置' }[activeView.value]))

function go(view: View, navLabel?: string) {
  const previousView = activeView.value
  activeView.value = view
  activeNavLabel.value = navLabel || (view === 'add' ? '新增试题' : view === 'library' ? '试题管理' : view === 'practice' ? '顺序练习' : view === 'wrong' ? '我的错题' : view === 'papers' ? '试卷管理' : view === 'backup' ? '数据备份' : view === 'settings' ? '系统设置' : '数据首页')
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
  form.grade = ''
  form.category = ''
  form.subcategory = ''
  form.difficulty = '基础'
  form.source = ''
  form.prompt = '请聆听下面的音乐片段，判断其演奏乐器。'
  form.explanation = ''
  form.fillAnswer = ''
  form.shortAnswer = ''
  optionTexts.value = ['二胡', '小提琴', '琵琶', '竹笛', '', '']
  questionType.value = '选择题'
  choiceMode.value = 'single'
  selectedAnswers.value = ['B']
  showMore.value = false
  currentSavedId.value = null
  formError.value = ''
  if (audioAsset.url?.startsWith('blob:')) URL.revokeObjectURL(audioAsset.url)
  audioAsset.name = '音乐片段 A'
  audioAsset.id = ''
  audioAsset.url = ''
  audioAsset.duration = '01:25'
  audioAsset.mime = 'MP3'
  if (imageAsset.value?.startsWith('blob:')) URL.revokeObjectURL(imageAsset.value)
  imageAsset.value = ''
  imageAssetId.value = ''
  notationTokens.value = []
  showNotationPanel.value = false
  isPlaying.value = false
}

function editQuestion(question: Question) {
  currentSavedId.value = question.id
  form.grade = question.grade
  form.category = question.category
  form.subcategory = question.subcategory || ''
  form.difficulty = question.difficulty
  form.source = question.source || ''
  form.prompt = question.title
  form.explanation = question.explanation || ''
  form.fillAnswer = (question.fillAnswers || []).join('\n')
  form.shortAnswer = question.referenceAnswer || ''
  questionType.value = question.type
  optionTexts.value = [...(question.options || ['','','','']), '', ''].slice(0, 6)
  choiceMode.value = question.answerMode || (answerLetters(question.correctAnswer).length > 1 ? 'multiple' : 'single')
  selectedAnswers.value = answerLetters(question.correctAnswer || 'A')
  showMore.value = (question.options?.length || 4) > 4
  audioAsset.name = question.audioName || '音乐片段 A'
  audioAsset.duration = question.audioDuration || '01:25'
  audioAsset.id = question.audioAssetId || ''
  audioAsset.url = question.audioAssetId && window.musicBank ? window.musicBank.assets.url(question.audioAssetId) : ''
  imageAssetId.value = question.imageAssetId || ''
  imageAsset.value = question.imageAssetId && window.musicBank ? window.musicBank.assets.url(question.imageAssetId) : ''
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
  const copy: Question = {
    ...question,
    id: nextQuestionId.value,
    title: `${question.title}（副本）`,
    status: '草稿',
    updated: '刚刚',
    options: question.options ? [...question.options] : undefined,
    fillAnswers: question.fillAnswers ? [...question.fillAnswers] : undefined,
  }
  libraryMutationBusy.value = true
  try {
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
function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}
async function handleAudioChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(file.type) && !/\.(mp3|wav)$/i.test(file.name)) {
    notify('仅支持 MP3 或 WAV 音频文件')
    return
  }
  if (file.size > 30 * 1024 * 1024) {
    notify('音频文件不能超过 30MB')
    return
  }
  if (audioAsset.url?.startsWith('blob:')) URL.revokeObjectURL(audioAsset.url)
  const previewUrl = URL.createObjectURL(file)
  audioAsset.url = previewUrl
  audioAsset.id = ''
  audioAsset.name = file.name
  audioAsset.mime = file.name.split('.').pop()?.toUpperCase() || 'AUDIO'
  isPlaying.value = false
  if (window.musicBank) {
    try {
      const imported = await window.musicBank.assets.import({ assetType: 'audio', name: file.name, mimeType: file.type || 'audio/mpeg', bytes: await file.arrayBuffer() })
      audioAsset.id = imported.id
      URL.revokeObjectURL(previewUrl)
      audioAsset.url = imported.url
    } catch {
      notify('音频预览成功，但保存到桌面资源库失败')
      return
    }
  }
  notify('音频已加入当前题目，可立即试听')
}
async function handleImageChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    notify('请选择 JPG、PNG 或 WEBP 图片')
    return
  }
  if (imageAsset.value?.startsWith('blob:')) URL.revokeObjectURL(imageAsset.value)
  const previewUrl = URL.createObjectURL(file)
  imageAsset.value = previewUrl
  imageAssetId.value = ''
  if (window.musicBank) {
    try {
      const imported = await window.musicBank.assets.import({ assetType: 'image', name: file.name, mimeType: file.type || 'image/png', bytes: await file.arrayBuffer() })
      imageAssetId.value = imported.id
      URL.revokeObjectURL(previewUrl)
      imageAsset.value = imported.url
    } catch {
      notify('图片预览成功，但保存到桌面资源库失败')
      return
    }
  }
  notify('图片已加入当前题目')
}
function syncAudioDuration() {
  if (audioElement.value && Number.isFinite(audioElement.value.duration)) {
    audioAsset.duration = formatDuration(audioElement.value.duration)
    if (audioAsset.id && window.musicBank) void window.musicBank.assets.updateDuration(audioAsset.id, Math.round(audioElement.value.duration * 1000))
  }
}
async function toggleAudio() {
  if (!audioElement.value || !audioAsset.url) {
    notify('请先点击“音频”导入 MP3 或 WAV 文件')
    return
  }
  try {
    if (audioElement.value.paused) {
      await audioElement.value.play()
      isPlaying.value = true
    } else {
      audioElement.value.pause()
      isPlaying.value = false
    }
  } catch {
    isPlaying.value = false
    notify('音频无法播放，请检查文件格式')
  }
}

async function togglePracticeAudio() {
  const player = practiceAudioElement.value
  if (!player || !practiceAudioUrl.value) {
    notify('这道题尚未关联可播放的本地音频')
    return
  }
  try {
    if (player.paused) {
      await player.play()
      isPlaying.value = true
    } else {
      player.pause()
      isPlaying.value = false
    }
  } catch {
    isPlaying.value = false
    notify('音频无法播放，请检查本地资源')
  }
}

function validateForm() {
  if (!form.grade || !form.category) {
    formError.value = '请先选择年级和一级分类。'
    addStep.value = 1
    return false
  }
  if (!form.prompt.trim()) {
    formError.value = '题目内容不能为空。'
    return false
  }
  if (questionType.value === '选择题' && (optionTexts.value.slice(0, showMore.value ? 6 : 4).filter(Boolean).length < 2 || !selectedAnswers.value.length)) {
    formError.value = '请至少填写两个选项，并选择正确答案。'
    return false
  }
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
  const id = currentSavedId.value || nextQuestionId.value
  const existingIndex = questions.value.findIndex((item) => item.id === id)
  const item: Question = { id, title: form.prompt.trim(), grade: form.grade, category: form.category, subcategory: form.subcategory, source: form.source, type: questionType.value, status, hasAudio: Boolean(audioAsset.url), hasImage: Boolean(imageAsset.value), audioName: audioAsset.name, audioDuration: audioAsset.duration, audioAssetId: audioAsset.id || undefined, imageAssetId: imageAssetId.value || undefined, updated: '刚刚', difficulty: form.difficulty, options: optionTexts.value.slice(0, showMore.value ? 6 : 4), correctAnswer: questionType.value === '选择题' ? [...selectedAnswers.value].sort().join(',') : undefined, answerMode: questionType.value === '选择题' ? choiceMode.value : undefined, fillAnswers: form.fillAnswer.split('\n').map((answer) => answer.trim()).filter(Boolean), referenceAnswer: form.shortAnswer, explanation: form.explanation }
  questionSaving.value = true
  try {
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

const practiceResponses = reactive<Record<string, { answer: string; result: 'correct' | 'wrong' | 'pending' }>>({})
const practiceCompletedCount = computed(() => practiceQuestions.value.filter((question) => practiceResponses[question.id]).length)
const practiceAccuracy = computed(() => {
  const graded = practiceQuestions.value.map((question) => practiceResponses[question.id]).filter((response) => response && response.result !== 'pending')
  return graded.length ? `${Math.round(graded.filter((response) => response.result === 'correct').length / graded.length * 100)}%` : '待评分'
})

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

async function startExam() {
  stopExamTimer()
  if (!generatedPaper.value.length) {
    generatedPaper.value = questions.value.filter((question) => question.status === '已发布').slice(0, 10).map((question) => ({ question, score: question.type === '选择题' ? 2 : question.type === '填空题' ? 3 : 10 }))
  }
  examIndex.value = 0
  examSubmitted.value = false
  Object.keys(examAnswers).forEach((key) => delete examAnswers[key])
  examRemaining.value = Math.max(1, paperConfig.duration) * 60
  if (!activePaperId.value && generatedPaper.value.length) {
    try {
      activePaperId.value = await persistCurrentPaper()
    } catch {
      notify('试卷未能保存，暂时无法建立可恢复的考试记录')
    }
  }
  activeExamAttemptId.value = `ATTEMPT-${Date.now()}`
  examStartedAt.value = new Date().toISOString()
  activePaperId.value ||= `PAPER-SESSION-${Date.now()}`
  if (window.musicBank) {
    try {
      await window.musicBank.exams.start({ id: activeExamAttemptId.value, paperId: activePaperId.value, status: '进行中', startedAt: examStartedAt.value, remainingSeconds: examRemaining.value })
    } catch {
      notify('考试已开始，但考试记录暂时无法保存')
    }
  }
  examTimer.value = window.setInterval(() => {
    if (examSubmitted.value) return
    examRemaining.value -= 1
    if (examRemaining.value <= 0) submitExam(true)
  }, 1000)
}

function stopExamTimer() {
  if (examTimer.value !== null) {
    window.clearInterval(examTimer.value)
    examTimer.value = null
  }
  if (examAudioElement.value) {
    examAudioElement.value.pause()
    examAudioElement.value.currentTime = 0
  }
  isPlaying.value = false
}

function formatExamTime(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function answerExam(value: string) {
  if (!examCurrent.value || examSubmitted.value) return
  examAnswers[examCurrent.value.id] = value
  const position = examIndex.value + 1
  if (window.musicBank && activeExamAttemptId.value) {
    void window.musicBank.exams.answer({ attemptId: activeExamAttemptId.value, position, answer: value, reviewStatus: examCurrent.value.type === '简答题' ? '待批阅' : undefined })
  }
}

function toggleExamChoice(letter: string) {
  if (!examCurrent.value || examSubmitted.value) return
  const multiple = examCurrent.value.answerMode === 'multiple' || answerLetters(examCurrent.value.correctAnswer).length > 1
  const current = answerLetters(examAnswers[examCurrent.value.id])
  const next = multiple
    ? (current.includes(letter) ? current.filter((answer) => answer !== letter) : [...current, letter].sort())
    : [letter]
  answerExam(next.join(','))
}

async function submitExam(timeout = false) {
  if (examSubmitted.value) return
  examSubmitted.value = true
  stopExamTimer()
  if (window.musicBank && activeExamAttemptId.value) {
    for (let index = 0; index < generatedPaper.value.length; index += 1) {
      const item = generatedPaper.value[index]
      const answer = examAnswers[item.question.id] || ''
      const correct = item.question.type === '选择题'
        ? choiceAnswersEqual(answer, item.question.correctAnswer)
        : item.question.type === '填空题'
          ? (item.question.fillAnswers || []).some((expected) => normalizeAnswer(answer) === normalizeAnswer(expected))
          : false
      await window.musicBank.exams.answer({ attemptId: activeExamAttemptId.value, position: index + 1, answer, score: item.question.type === '简答题' ? undefined : correct ? item.score : 0, reviewStatus: item.question.type === '简答题' ? '待批阅' : '已评分' })
    }
    await window.musicBank.exams.finish({ id: activeExamAttemptId.value, paperId: activePaperId.value || `PAPER-SESSION-${Date.now()}`, status: '已交卷', startedAt: examStartedAt.value || new Date().toISOString(), submittedAt: new Date().toISOString(), remainingSeconds: examRemaining.value })
  }
  if (timeout) notify('考试时间到，系统已自动交卷')
  else notify('已交卷，客观题成绩已生成')
}

function nextExamQuestion() {
  if (examIndex.value < generatedPaper.value.length - 1) examIndex.value += 1
  else notify('已经是最后一道试题')
}

function previousExamQuestion() {
  if (examIndex.value > 0) examIndex.value -= 1
}

async function toggleExamAudio() {
  const player = examAudioElement.value
  if (!player || !examAudioUrl.value) {
    notify('这道题尚未关联可播放的本地音频')
    return
  }
  try {
    if (player.paused) { await player.play(); isPlaying.value = true }
    else { player.pause(); isPlaying.value = false }
  } catch { isPlaying.value = false; notify('音频无法播放，请检查本地资源') }
}

async function removeWrong(question: Question) {
  if (!await confirmDestructive(question.id)) { notify('已取消移出'); return }
  wrongQuestionIds.value = wrongQuestionIds.value.filter((id) => id !== question.id)
  if (window.musicBank) void window.musicBank.wrong.remove(question.id)
  notify(`已将 ${question.id} 移出错题本`)
}

function reviewWrong(question: Question) {
  const index = practiceQuestions.value.findIndex((item) => item.id === question.id)
  if (index >= 0) { studyMode.value = 'special'; practiceIndex.value = index; resetPractice(); activeView.value = 'practice'; activeNavLabel.value = '专项练习' }
}

function generatePaper() {
  paperError.value = ''
  generatedPaper.value = []
  activePaperId.value = null
  if (paperTotal.value !== paperConfig.totalScore) {
    paperError.value = `当前题型分值合计为 ${paperTotal.value} 分，与目标总分相差 ${paperConfig.totalScore - paperTotal.value} 分。`
    return
  }
  const missing = (Object.keys(paperCounts.value) as QuestionType[]).find((type) => poolCounts.value[type] < paperCounts.value[type])
  if (missing) {
    paperError.value = `${missing}符合条件的已发布试题只有 ${poolCounts.value[missing]} 道，少于需要的 ${paperCounts.value[missing]} 道。`
    return
  }
  const items: PaperItem[] = []
  let randomState = paperConfig.seed ? hashSeed(paperConfig.seed) : Math.floor(Math.random() * 2_147_483_647)
  const nextRandom = () => {
    randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0
    return randomState / 4_294_967_296
  }
  const shuffle = (pool: Question[]) => {
    const copy = [...pool]
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(nextRandom() * (index + 1))
      ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
    }
    return copy
  }
  ;(['选择题', '填空题', '简答题'] as QuestionType[]).forEach((type) => {
    shuffle(publishedPool.value.filter((question) => question.type === type)).slice(0, paperCounts.value[type]).forEach((question) => items.push({ question: { ...question, options: question.options ? [...question.options] : undefined, fillAnswers: question.fillAnswers ? [...question.fillAnswers] : undefined }, score: type === '选择题' ? paperConfig.choiceScore : type === '填空题' ? paperConfig.fillScore : paperConfig.shortScore }))
  })
  generatedPaper.value = items
  notify(`已生成 ${items.length} 道试题的试卷草稿`)
}

function hashSeed(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function clearPaper() {
  generatedPaper.value = []
  activePaperId.value = null
  paperError.value = ''
}

function openSavedPaper(paper: SavedPaper) {
  activePaperId.value = paper.id
  paperConfig.name = paper.name
  paperConfig.grade = paper.grade
  paperConfig.totalScore = paper.totalScore
  paperConfig.duration = paper.durationMinutes
  paperConfig.seed = paper.seed || ''
  generatedPaper.value = paper.items.map((item) => ({ question: item.snapshot, score: item.score }))
  notify(`已载入 ${paper.name}，可以开始模拟考试`)
}

async function deleteSavedPaper(paper: SavedPaper) {
  if (!await confirmDestructive(paper.name)) { notify('已取消删除'); return }
  if (window.musicBank) {
    try { await window.musicBank.papers.delete(paper.id) } catch { notify('试卷删除失败'); return }
  } else window.localStorage.removeItem(`musicbank.paper.${paper.id}`)
  savedPapers.value = savedPapers.value.filter((item) => item.id !== paper.id)
  if (activePaperId.value === paper.id) clearPaper()
  notify('试卷已删除')
}

async function saveGeneratedPaper() {
  if (!generatedPaper.value.length) {
    notify('请先生成试卷草稿')
    return
  }
  const paper = {
    id: activePaperId.value || `PAPER-${Date.now()}`,
    name: paperConfig.name,
    grade: paperConfig.grade,
    totalScore: paperTotal.value,
    durationMinutes: paperConfig.duration,
    seed: paperConfig.seed || undefined,
    items: generatedPaper.value.map((item, index) => ({ position: index + 1, questionId: item.question.id, score: item.score, snapshot: item.question })),
  }
  if (window.musicBank) {
    try {
      await window.musicBank.papers.save(paper)
    } catch {
      notify('试卷预览已生成，但保存到本地数据库失败')
      return
    }
  } else {
    window.localStorage.setItem(`musicbank.paper.${paper.id}`, JSON.stringify(paper))
  }
  activePaperId.value = paper.id
  if (window.musicBank) savedPapers.value = await window.musicBank.papers.list() as SavedPaper[]
  else savedPapers.value = [paper as SavedPaper, ...savedPapers.value.filter((item) => item.id !== paper.id)]
  notify('试卷草稿已保存到本地')
}

async function persistCurrentPaper() {
  const paper = {
    id: activePaperId.value || `PAPER-${Date.now()}`,
    name: paperConfig.name,
    grade: paperConfig.grade,
    totalScore: paperTotal.value,
    durationMinutes: paperConfig.duration,
    seed: paperConfig.seed || undefined,
    items: generatedPaper.value.map((item, index) => ({ position: index + 1, questionId: item.question.id, score: item.score, snapshot: item.question })),
  }
  if (window.musicBank) await window.musicBank.papers.save(paper)
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
          <div class="dashboard-grid"><div class="panel recent-panel"><div class="panel-heading"><div><h2>最近编辑</h2><p>继续处理你最近编辑过的试题</p></div><button v-if="questions.length" class="text-button" @click="go('library')">查看全部 <svg-icon name="arrow" /></button></div><div v-if="questions.length" class="recent-list"><button v-for="q in questions.slice(0, 3)" :key="q.id" class="recent-item" @click="editQuestion(q)"><div class="question-type" :class="q.type === '选择题' ? 'purple' : q.type === '填空题' ? 'blue' : 'orange'">{{ q.type.slice(0, 1) }}</div><div class="recent-copy"><strong>{{ q.title }}</strong><span>{{ q.id }} · {{ q.category }}</span></div><span class="updated">{{ q.updated }}</span><svg-icon name="chevron" /></button></div><div v-else class="dashboard-empty"><strong>还没有试题</strong><span>先创建一道题，最近编辑会显示在这里。</span><button class="text-button" @click="go('add')">创建第一道试题 <svg-icon name="plus" /></button></div></div><div class="panel distribution-panel"><div class="panel-heading"><div><h2>题型分布</h2><p>当前题库结构</p></div><button v-if="questions.length" class="more-button" @click="go('library')"><svg-icon name="more" /></button></div><div class="donut-wrap"><div class="donut" :style="{ background: questionDonutStyle }"><div class="donut-hole"><strong>{{ questions.length ? questions.length.toLocaleString() : '—' }}</strong><span>{{ questions.length ? '道试题' : '暂无数据' }}</span></div></div><div class="legend"><div><i class="dot purple"></i><span>选择题</span><strong>{{ questionTypeCounts.choice }}</strong></div><div><i class="dot blue"></i><span>填空题</span><strong>{{ questionTypeCounts.fill }}</strong></div><div><i class="dot orange"></i><span>简答题</span><strong>{{ questionTypeCounts.short }}</strong></div></div></div></div></div>
          <div class="panel insight-panel"><div class="insight-icon"><svg-icon name="spark" /></div><div><strong>题库小贴士</strong><p>听辨类试题的平均练习正确率为 <b>72%</b>，可以在“专项练习”中为学生增加更多反复听辨的机会。</p></div></div>
        </section>

        <section v-else-if="activeView === 'library'" class="view library-view"><div class="view-heading"><div><div class="eyebrow">题库管理 / 试题列表</div><h1>试题管理</h1><p>管理、编辑和发布你的音乐学科试题。</p></div><button class="primary-button" @click="go('add')"><svg-icon name="plus" />新增试题</button></div><div class="filter-bar"><div class="filter-search"><svg-icon name="search" /><input v-model="search" placeholder="搜索题号、题干或分类" /></div><select v-model="libraryFilter"><option>全部题型</option><option>选择题</option><option>填空题</option><option>简答题</option></select><button class="filter-button" :class="{ selected: showLibraryFilters }" @click="showLibraryFilters = !showLibraryFilters"><svg-icon name="sliders" />筛选</button><div class="view-toggle"><button class="selected"><svg-icon name="list" /></button><button><svg-icon name="grid" /></button></div></div><div v-if="showLibraryFilters" class="advanced-filters"><select v-model="libraryGrade"><option>全部年级</option><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select><select v-model="libraryCategory"><option>全部分类</option><option>音乐情绪</option><option>音乐要素</option><option>音乐体裁</option><option>音乐记号</option><option>民族、西洋乐器</option><option>音乐风格</option></select><select v-model="libraryAssetFilter"><option>全部试题</option><option>仅含音频</option><option>仅含图片</option></select><button class="text-button" @click="libraryGrade = '全部年级'; libraryCategory = '全部分类'; libraryAssetFilter = '全部试题'">重置筛选</button></div><div class="table-panel"><div class="table-header"><span>试题信息</span><span>分类</span><span>题型</span><span>状态</span><span>更新于</span><span>操作</span></div><div v-for="q in filteredQuestions" :key="q.id" class="table-row" @click="editQuestion(q)"><div class="question-cell"><div class="question-type" :class="q.type === '选择题' ? 'purple' : q.type === '填空题' ? 'blue' : 'orange'">{{ q.type.slice(0, 1) }}</div><div><strong>{{ q.title }}</strong><span>{{ q.id }} · {{ q.grade }} <i v-if="q.hasAudio"><svg-icon name="music" />音频</i><i v-if="q.hasImage"><svg-icon name="image" />图片</i></span></div></div><span class="category-pill">{{ q.category }}</span><span class="type-text">{{ q.type }}</span><span class="status-pill" :class="q.status === '已发布' ? 'published' : 'draft'"><i></i>{{ q.status }}</span><span class="updated">{{ q.updated }}</span><span class="row-actions" @click.stop><button title="编辑" @click="editQuestion(q)"><svg-icon name="edit" /></button><button title="复制" @click="duplicateQuestion(q)"><svg-icon name="copy" /></button><button title="发布或撤回" @click="toggleQuestionStatus(q)"><svg-icon name="check" /></button><button title="删除" @click="deleteQuestion(q)"><svg-icon name="trash" /></button></span></div><div v-if="!filteredQuestions.length" class="empty-state">没有找到匹配的试题</div><div class="table-footer"><span>共 {{ filteredQuestions.length }} 道试题</span><div class="pagination"><button class="active">1</button><button>2</button><button>3</button><span>…</span><button>12</button><button><svg-icon name="chevron" /></button></div></div></div></section>

        <section v-else-if="activeView === 'papers'" class="view papers-view"><div v-if="activeNavLabel === '试卷管理'" class="saved-papers-view"><div class="view-heading"><div><div class="eyebrow">题库管理 / 试卷管理</div><h1>试卷管理</h1><p>查看已保存的试卷快照，继续模拟考试或清理本地草稿。</p></div><button class="primary-button" @click="go('papers', '随机组卷')"><svg-icon name="plus" />新建随机试卷</button></div><div v-if="savedPapers.length" class="saved-paper-list"><article v-for="paper in savedPapers" :key="paper.id" class="saved-paper-item"><div class="saved-paper-icon"><svg-icon name="layers" /></div><div class="saved-paper-copy"><strong>{{ paper.name }}</strong><span>{{ paper.grade || '全部年级' }} · {{ paper.items.length }} 道题 · {{ paper.totalScore }} 分 · {{ paper.durationMinutes }} 分钟</span><small>{{ paper.id }}<template v-if="paper.seed"> · 种子 {{ paper.seed }}</template></small></div><button class="secondary-button" @click="openSavedPaper(paper); go('exam', '模拟考试')">开始考试 <svg-icon name="arrow" /></button><button class="icon-button" title="载入试卷" @click="openSavedPaper(paper)"><svg-icon name="edit" /></button><button class="icon-button" title="删除试卷" @click="deleteSavedPaper(paper)"><svg-icon name="trash" /></button></article></div><div v-else class="empty-practice saved-empty"><h2>还没有保存的试卷</h2><p>先生成并保存一份随机试卷。</p><button class="primary-button" @click="go('papers', '随机组卷')">去随机组卷 <svg-icon name="arrow" /></button></div></div><div v-else><div class="view-heading"><div><div class="eyebrow">题库管理 / 随机组卷</div><h1>随机组卷</h1><p>按年级、分类和题型组合生成一份可审阅的试卷草稿。</p></div><div class="paper-status"><span class="status-dot"></span>仅抽取已发布试题</div></div><div v-if="activeNavLabel !== '试卷管理'" class="paper-builder"><div class="paper-config-card"><div class="form-card-heading"><div><h2>组卷配置</h2><p>实时计算总分，题量不足或分值不匹配时不会生成正式试卷。</p></div><div class="generated-id">当前总分 <strong :class="{ invalid: paperTotal !== paperConfig.totalScore }">{{ paperTotal }} / {{ paperConfig.totalScore }}</strong></div></div><div class="paper-form-grid"><label class="field wide"><span>试卷名称</span><input v-model="paperConfig.name" /></label><label class="field"><span>年级</span><select v-model="paperConfig.grade"><option>全部年级</option><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select></label><label class="field"><span>分类</span><select v-model="paperConfig.category"><option>全部分类</option><option>音乐情绪</option><option>音乐要素</option><option>音乐体裁</option><option>音乐记号</option><option>民族、西洋乐器</option></select></label><label class="field"><span>目标总分</span><div class="unit-input"><input v-model.number="paperConfig.totalScore" type="number" min="0" /><span>分</span></div></label><label class="field"><span>考试时长</span><div class="unit-input"><input v-model.number="paperConfig.duration" type="number" min="1" /><span>分钟</span></div></label><label class="field"><span>音频试题</span><select v-model="paperConfig.audioMode"><option>不限</option><option>仅含音频</option><option>排除音频</option></select></label><label class="field"><span>随机种子 <small>选填</small></span><input v-model="paperConfig.seed" placeholder="例如：2026-spring" /></label></div><div class="paper-type-config"><div class="paper-type-row"><div class="paper-type-name"><span class="question-type purple">选</span><div><strong>选择题</strong><small>可用 {{ poolCounts['选择题'] }} 道</small></div></div><label>题数<input v-model.number="paperConfig.choiceCount" type="number" min="0" /></label><span>×</span><label>每题分值<input v-model.number="paperConfig.choiceScore" type="number" min="0" /></label><strong class="type-total">{{ paperConfig.choiceCount * paperConfig.choiceScore }} 分</strong></div><div class="paper-type-row"><div class="paper-type-name"><span class="question-type blue">填</span><div><strong>填空题</strong><small>可用 {{ poolCounts['填空题'] }} 道</small></div></div><label>题数<input v-model.number="paperConfig.fillCount" type="number" min="0" /></label><span>×</span><label>每题分值<input v-model.number="paperConfig.fillScore" type="number" min="0" /></label><strong class="type-total">{{ paperConfig.fillCount * paperConfig.fillScore }} 分</strong></div><div class="paper-type-row"><div class="paper-type-name"><span class="question-type orange">简</span><div><strong>简答题</strong><small>可用 {{ poolCounts['简答题'] }} 道</small></div></div><label>题数<input v-model.number="paperConfig.shortCount" type="number" min="0" /></label><span>×</span><label>每题分值<input v-model.number="paperConfig.shortScore" type="number" min="0" /></label><strong class="type-total">{{ paperConfig.shortCount * paperConfig.shortScore }} 分</strong></div></div><div v-if="paperError" class="form-error"><svg-icon name="info" />{{ paperError }}</div><div class="paper-actions"><button class="secondary-button" @click="paperConfig.choiceCount = poolCounts['选择题']; paperConfig.fillCount = poolCounts['填空题']; paperConfig.shortCount = poolCounts['简答题']">按当前题量填充</button><button class="ghost-button" @click="clearPaper">清空预览</button><button class="primary-button" @click="generatePaper">生成试卷草稿 <svg-icon name="arrow" /></button></div></div><aside class="paper-summary"><div class="aside-card"><div class="aside-heading"><h3>组卷摘要</h3><svg-icon name="layers" /></div><div class="summary-score"><strong>{{ paperTotal }}</strong><span>总分</span></div><div class="summary-row"><span>题目总数</span><b>{{ paperConfig.choiceCount + paperConfig.fillCount + paperConfig.shortCount }} 道</b></div><div class="summary-row"><span>考试时长</span><b>{{ paperConfig.duration }} 分钟</b></div><div class="summary-row"><span>音频策略</span><b>{{ paperConfig.audioMode }}</b></div></div><div class="aside-card paper-tip-card"><div class="aside-heading"><h3>组卷提示</h3><svg-icon name="spark" /></div><p>音乐听辨题会保留题干中的音频引用。生成后请先检查题目顺序和分值，再保存试卷。</p></div></aside></div><div v-if="activeNavLabel !== '试卷管理' && generatedPaper.length" class="generated-paper"><div class="generated-paper-heading"><div><h2>{{ paperConfig.name }}</h2><p>{{ paperConfig.grade }} · {{ paperConfig.duration }} 分钟 · 共 {{ generatedPaper.length }} 题</p></div><span class="status-pill published"><i></i>草稿预览</span></div><div class="generated-paper-list"><div v-for="(item, index) in generatedPaper" :key="item.question.id" class="generated-paper-item"><span class="paper-order">{{ String(index + 1).padStart(2, '0') }}</span><div class="generated-copy"><strong>{{ item.question.title }}</strong><span>{{ item.question.type }} · {{ item.score }} 分 · {{ item.question.id }}<i v-if="item.question.hasAudio"><svg-icon name="music" />音频</i></span></div><span class="paper-item-score">{{ item.score }} 分</span></div></div><div class="generated-footer"><span>已生成快照，原题后续修改不会影响此草稿。{{ paperConfig.seed ? ` · 种子 ${paperConfig.seed}` : '' }}</span><button class="primary-button" @click="saveGeneratedPaper">保存试卷草稿 <svg-icon name="check" /></button></div></div></div></section>

        <section v-else-if="activeView === 'add'" class="view add-view"><div class="add-heading"><div><div class="eyebrow">题库管理 / 新增试题</div><h1>{{ currentSavedId ? '编辑试题' : '创建一道新试题' }}</h1><p>把灵感记录下来，建立更有质量的音乐学习内容。</p></div><div class="draft-indicator"><span class="status-dot"></span>{{ questionSaving ? '正在保存…' : '⌘ S 保存草稿' }}</div></div><div class="stepper"><button :class="{ active: addStep === 1, done: addStep > 1 }" @click="addStep = 1"><span>01</span><div><strong>基本信息</strong><small>先定义试题的归属</small></div></button><div class="step-line" :class="{ filled: addStep > 1 }"></div><button :class="{ active: addStep === 2 }" @click="addStep = 2"><span>02</span><div><strong>题目内容</strong><small>录入题干、答案与解析</small></div></button></div>
          <div v-if="addStep === 1" class="form-card"><div class="form-card-heading"><div><h2>基本信息</h2><p>为这道试题选择合适的分类和题型，系统会自动生成唯一题号。</p></div><div class="generated-id">题号 <strong>{{ currentSavedId || nextQuestionId }}</strong></div></div><div class="form-grid"><label class="field"><span>年级 <em>*</em></span><select v-model="form.grade"><option value="">请选择年级</option><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select></label><label class="field"><span>一级分类 <em>*</em></span><select v-model="form.category"><option value="">请选择一级分类</option><option>音乐情绪</option><option>音乐要素</option><option>音乐体裁</option><option>音乐记号</option><option>民族、西洋乐器</option></select></label><label class="field"><span>二级分类 <small>选填</small></span><select v-model="form.subcategory"><option value="">选择二级分类</option><option>欢快</option><option>激昂</option><option>宁静</option><option>悲伤</option></select></label><label class="field"><span>试题类型 <em>*</em></span><div class="type-options"><button v-for="type in ['选择题', '填空题', '简答题']" :key="type" :class="{ selected: questionType === type }" @click="questionType = type as QuestionType"><span class="radio-dot"></span>{{ type }}</button></div></label><label class="field"><span>难度 <small>选填</small></span><div class="difficulty-options"><button v-for="level in ['基础', '中等', '进阶']" :key="level" :class="{ selected: form.difficulty === level }" @click="form.difficulty = level">{{ level }}</button></div></label><label class="field"><span>试题来源 <small>选填</small></span><input v-model="form.source" placeholder="例如：2025 年省测真题" /></label></div><div class="form-tip"><svg-icon name="info" /><span>题型可以在后续步骤中随时调整，音乐听辨内容可与三种题型自由组合。</span></div><div v-if="formError" class="form-error"><svg-icon name="info" />{{ formError }}</div><div class="form-actions"><button class="ghost-button" @click="go('library')">取消</button><button class="primary-button" @click="form.grade && form.category ? (formError = '', addStep = 2) : (formError = '请先选择年级和一级分类。')">下一步 <svg-icon name="arrow" /></button></div></div>
          <div v-else class="editor-layout"><div class="editor-main"><div class="editor-card"><div class="section-heading"><div class="section-index">01</div><div><h2>题目</h2><p>输入题干内容，可插入图片、音频或音乐记谱符号。</p></div><span class="required-label">必填</span></div><div class="editor-toolbar"><button><svg-icon name="bold" /></button><button><svg-icon name="italic" /></button><span></span><button @click="openImagePicker"><svg-icon name="image" />图片</button><button @click="openAudioPicker"><svg-icon name="music" />音频</button><button type="button" title="打开谱面编辑器，完成后生成题目图片" aria-label="打开谱面编辑器" aria-haspopup="dialog" :aria-expanded="showNotationPanel" @click="openNotationEditor"><svg-icon name="music" />谱面</button><span></span><button><svg-icon name="undo" /></button><button><svg-icon name="redo" /></button></div><teleport to="body"><transition name="sheet"><div v-if="showNotationPanel" class="notation-sheet-backdrop" @click.self="closeNotationEditor"><section class="notation-sheet" role="dialog" aria-modal="true" aria-labelledby="notation-title"><header class="notation-sheet-header"><div><div class="eyebrow">MusicBank · 谱面工具</div><h2 id="notation-title">谱面编辑器</h2><p>参考 Dolce 的按需符号面板，编辑完成后导出为题目图片。</p></div><button type="button" class="icon-button" aria-label="关闭谱面编辑器" @click="closeNotationEditor"><svg-icon name="close" /></button></header><div class="notation-mode-switch"><button type="button" :class="{ selected: notationMode === 'jianpu' }" @click="switchNotationMode('jianpu')"><span>简谱</span><small>数字、加点、下线</small></button><button type="button" :class="{ selected: notationMode === 'staff' }" @click="switchNotationMode('staff')"><span>五线谱</span><small>音符、休止、连音</small></button></div><div class="notation-sheet-body"><div class="notation-palette"><div class="notation-palette-heading"><div><strong>符号面板</strong><span>按类别选择，元素会按顺序写入下方乐谱</span></div><span class="notation-palette-hint">{{ notationMode === 'jianpu' ? '简谱模式' : '五线谱模式' }}</span></div><div v-for="group in activeNotationGroups" :key="group.label" class="notation-palette-group"><div class="notation-group-title">{{ group.label }}</div><div class="notation-key-grid"><button v-for="item in group.items" :key="`${group.label}-${item.label}-${item.glyph}`" type="button" class="notation-key" :title="item.label" @click="addNotationItem(item, group)"><span>{{ item.glyph }}</span><small>{{ item.label }}</small></button></div></div></div><aside class="notation-preview-pane"><div class="notation-preview-head"><div><strong>实时预览</strong><span>{{ notationMode === 'jianpu' ? '简谱' : '五线谱' }} · {{ notationTokens.length }} 个元素</span></div><button type="button" class="text-button" :disabled="!notationTokens.length" @click="removeLastNotationItem">撤销一步</button></div><div class="notation-canvas"><img :src="notationPreviewUrl" alt="谱面实时预览" /></div><div class="notation-token-summary"><div class="notation-summary-label">已加入</div><div v-if="notationTokens.length" class="notation-token-chips"><button v-for="token in notationTokens" :key="token.id" type="button" class="notation-token-chip" :title="`移除 ${token.label}`" @click="notationTokens = notationTokens.filter((item) => item.id !== token.id)">{{ token.glyph }}</button></div><span v-else class="notation-empty-hint">点击左侧按钮开始录入</span></div><div class="notation-sheet-actions"><button type="button" class="ghost-button" @click="clearNotation">清空</button><button type="button" class="secondary-button" @click="closeNotationEditor">继续编辑</button><button type="button" class="primary-button" @click="exportNotationImage"><svg-icon name="image" />生成题目图片</button></div></aside></div></section></div></transition></teleport><teleport to="body"><transition name="preview-modal"><div v-if="showQuestionPreview" class="question-preview-backdrop" @click.self="closeQuestionPreview"><section class="question-preview-modal" role="dialog" aria-modal="true" aria-labelledby="question-preview-title"><header class="question-preview-header"><div><div class="eyebrow">MusicBank · 题目预览</div><h2 id="question-preview-title">{{ questionType }} · {{ form.grade || '六年级' }}</h2></div><button type="button" class="icon-button" aria-label="关闭题目预览" @click="closeQuestionPreview"><svg-icon name="close" /></button></header><div class="question-preview-paper"><div class="question-preview-meta"><span>{{ form.category || '音乐综合' }}</span><span>{{ form.difficulty }}</span><span>草稿预览</span></div><h3>{{ form.prompt || '请输入题目内容...' }}</h3><img v-if="imageAsset" :src="imageAsset" alt="题目插入图片" class="question-preview-image" /><div v-if="audioAsset.url" class="question-preview-audio"><audio :src="audioAsset.url" controls preload="metadata"></audio></div><div v-if="questionType === '选择题'" class="question-preview-options"><div v-for="(letter, index) in (showMore ? ['A','B','C','D','E','F'] : ['A','B','C','D'])" :key="letter"><b>{{ letter }}.</b><span>{{ optionTexts[index] || '待填写' }}</span></div></div><div v-else-if="questionType === '填空题'" class="question-preview-answer-line">请填写答案：＿＿＿＿＿＿</div><div v-else class="question-preview-answer-line">请结合题干作答。</div></div><footer class="question-preview-footer"><span>这是学生看到的题目样式，正确答案与解析不会显示。</span><button type="button" class="primary-button" @click="closeQuestionPreview">继续编辑</button></footer></section></div></transition></teleport><textarea v-model="form.prompt" class="rich-editor" placeholder="请输入题目内容..."></textarea><input ref="imageInput" class="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp" @change="handleImageChange" /><input ref="audioInput" class="hidden-file-input" type="file" accept="audio/mpeg,audio/wav" @change="handleAudioChange" /><div v-if="imageAsset" class="image-preview"><img :src="imageAsset" alt="已插入的题目图片" /><span>图片素材已加入题目</span></div><div class="audio-block"><audio ref="audioElement" :src="audioAsset.url" preload="metadata" @loadedmetadata="syncAudioDuration" @ended="isPlaying = false"></audio><div class="audio-leading" :class="{ playing: isPlaying }"><svg-icon :name="isPlaying ? 'pause' : 'music'" /></div><div class="audio-body"><div class="audio-title"><strong>{{ audioAsset.name }}</strong><span>{{ audioAsset.mime }} · {{ audioAsset.duration }}</span></div><div class="audio-progress"><i></i><b></b></div><div class="audio-meta"><span>00:00</span><span class="audio-controls"><button @click="toggleAudio"><svg-icon :name="isPlaying ? 'pause' : 'play'" /></button><svg-icon name="volume" /></span><span>{{ audioAsset.duration }}</span></div></div><button class="audio-more"><svg-icon name="more" /></button></div></div><div class="editor-card"><div class="section-heading"><div class="section-index">02</div><div><h2>答案</h2><p>填写正确答案，系统会在练习和考试时使用。</p></div><span class="required-label">必填</span></div><div v-if="questionType === '选择题'" class="options-editor"><div class="choice-mode-row"><span>正确答案方式</span><div class="choice-mode-toggle"><button type="button" :class="{ selected: choiceMode === 'single' }" @click="setChoiceMode('single')">单选</button><button type="button" :class="{ selected: choiceMode === 'multiple' }" @click="setChoiceMode('multiple')">多选</button></div><small>{{ choiceMode === 'multiple' ? '可同时选择多个正确选项' : '只能选择一个正确选项' }}</small></div><div v-for="(letter, index) in (showMore ? ['A','B','C','D','E','F'] : ['A','B','C','D'])" :key="letter" class="option-row"><button type="button" class="option-radio" :class="{ selected: selectedAnswers.includes(letter), multiple: choiceMode === 'multiple' }" @click="toggleChoiceAnswer(letter)"><span></span></button><b>{{ letter }}</b><input v-model="optionTexts[index]" :placeholder="`请输入选项 ${letter} 的内容`" /><button v-if="letter === 'D' && !showMore" type="button" class="remove-option" @click="showMore = true"><svg-icon name="plus" />增加选项</button></div><button v-if="showMore" type="button" class="add-option" @click="collapseOptions">收起扩展选项</button></div><textarea v-else-if="questionType === '填空题'" v-model="form.fillAnswer" class="answer-textarea" placeholder="请输入标准答案，每行一个空"></textarea><textarea v-else v-model="form.shortAnswer" class="answer-textarea large" placeholder="请输入参考答案，可分段填写"></textarea></div><div class="editor-card"><div class="section-heading"><div class="section-index">03</div><div><h2>解析</h2><p>帮助学生理解答案背后的音乐知识。</p></div><span class="optional-label">选填</span></div><textarea v-model="form.explanation" class="answer-textarea explanation" placeholder="请输入试题解析、听辨技巧或作品背景..."></textarea></div><div v-if="formError" class="form-error editor-error"><svg-icon name="info" />{{ formError }}</div></div><aside class="editor-aside"><div class="aside-card"><div class="aside-heading"><h3>录入提示</h3><svg-icon name="spark" /></div><div class="aside-tip"><span>01</span><p>题干尽量使用完整、清晰的句子。</p></div><div class="aside-tip"><span>02</span><p>音频建议控制在 30MB 以内，支持 MP3 和 WAV。</p></div><div class="aside-tip"><span>03</span><p>答案选项至少保留两个有效内容。</p></div></div><div class="aside-card preview-card"><div class="aside-heading"><h3>实时预览</h3><button class="text-button" @click="openQuestionPreview">打开预览 <svg-icon name="arrow" /></button></div><div class="preview-paper"><span class="preview-label">{{ questionType }} · {{ form.grade || '六年级' }}</span><strong>{{ form.prompt || '请输入题目内容...' }}</strong><div class="mini-audio"><svg-icon name="play" /><span>{{ audioAsset.name }}</span><small>{{ audioAsset.duration }}</small></div><div class="mini-options" v-if="questionType === '选择题'"><span v-for="(letter, index) in ['A','B','C','D']" :key="letter">{{ letter }}. {{ optionTexts[index] || '待填写' }}</span></div><div v-else class="mini-answer">{{ questionType === '填空题' ? (form.fillAnswer || '待填写标准答案') : (form.shortAnswer || '待填写参考答案') }}</div></div></div></aside></div><div v-if="addStep === 2" class="save-bar"><button class="ghost-button" @click="addStep = 1">返回上一步</button><div><button class="secondary-button" :disabled="questionSaving" @click="saveQuestion()">保存草稿 <span>⌘ S</span></button><button class="secondary-button" :disabled="questionSaving" @click="saveQuestion(true)">保存并新增</button><button class="primary-button" :disabled="questionSaving" @click="publishQuestion">保存并发布 <svg-icon name="arrow" /></button></div></div>
        </section>
        <section v-else-if="activeView === 'practice'" class="view practice-view"><div class="practice-heading"><div><div class="eyebrow">学习与考试 / 顺序练习</div><h1>顺序练习</h1><p>按题库顺序练习，提交后查看答案和解析。</p></div><div class="practice-progress"><strong>{{ practiceIndex + 1 }}</strong><span>/ {{ practiceQuestions.length || 0 }} 题</span></div></div><div v-if="practiceCurrent" class="practice-layout"><div class="practice-main"><div class="practice-meta"><span class="category-pill">{{ practiceCurrent.grade }}</span><span class="category-pill">{{ practiceCurrent.category }}</span><span class="type-text">{{ practiceCurrent.type }}</span><span class="practice-id">{{ practiceCurrent.id }}</span></div><div class="practice-card"><div class="practice-card-top"><span class="practice-number">{{ String(practiceIndex + 1).padStart(2, '0') }}</span><span v-if="practiceCurrent.hasAudio" class="audio-badge"><svg-icon name="music" />听辨题</span></div><h2>{{ practiceCurrent.title }}</h2><img v-if="practiceImageUrl" :key="practiceImageUrl" :src="practiceImageUrl" class="question-stimulus-image" alt="题目图片或乐谱" /><div v-if="practiceCurrent.hasAudio" class="practice-audio"><audio ref="practiceAudioElement" :src="practiceAudioUrl" preload="metadata" @ended="isPlaying = false"></audio><div class="audio-leading" :class="{ playing: isPlaying }"><svg-icon :name="isPlaying ? 'pause' : 'music'" /></div><div class="audio-body"><div class="audio-title"><strong>音乐片段 A</strong><span>MP3 · 01:25</span></div><div class="audio-progress"><i></i><b></b></div><div class="audio-meta"><span>00:00</span><span class="audio-controls"><button @click="togglePracticeAudio"><svg-icon :name="isPlaying ? 'pause' : 'play'" /></button><svg-icon name="volume" /></span><span>01:25</span></div></div></div><div v-if="practiceCurrent.type === '选择题'"><div class="choice-answer-hint">{{ practiceCurrent.answerMode === 'multiple' || answerLetters(practiceCurrent.correctAnswer).length > 1 ? '多选题 · 可选择多个答案' : '单选题 · 请选择一个答案' }}</div><div class="practice-options"><button v-for="(option, index) in (practiceCurrent.options || ['二胡','小提琴','琵琶','竹笛'])" :key="option + index" :class="{ selected: practiceChoiceAnswers.includes(String.fromCharCode(65 + index)), multiple: practiceCurrent.answerMode === 'multiple' || answerLetters(practiceCurrent.correctAnswer).length > 1, correct: practiceSubmitted && answerLetters(practiceCurrent.correctAnswer).includes(String.fromCharCode(65 + index)), incorrect: practiceSubmitted && practiceChoiceAnswers.includes(String.fromCharCode(65 + index)) && !answerLetters(practiceCurrent.correctAnswer).includes(String.fromCharCode(65 + index)) && practiceResult === 'wrong' }" @click="togglePracticeChoice(String.fromCharCode(65 + index))"><span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}</button></div></div><textarea v-else-if="practiceCurrent.type === '填空题'" v-model="practiceAnswer" :readonly="practiceSubmitted" class="practice-answer-input" placeholder="请输入答案"></textarea><textarea v-else v-model="practiceAnswer" :readonly="practiceSubmitted" class="practice-answer-input large" placeholder="请输入你的答案，提交后与参考答案对照"></textarea><div v-if="practiceSubmitted" class="practice-feedback" :class="practiceResult"><div class="feedback-icon"><svg-icon :name="practiceResult === 'correct' ? 'check' : practiceResult === 'pending' ? 'info' : 'close'" /></div><div><strong>{{ practiceResult === 'correct' ? '回答正确' : practiceResult === 'pending' ? '请自我核对参考答案' : '再想一想' }}</strong><p v-if="practiceResult === 'wrong'">正确答案：{{ practiceCurrent.type === '选择题' ? formatChoiceAnswer(practiceCurrent.correctAnswer) : (practiceCurrent.fillAnswers?.[0] || '参考答案见下方解析') }}</p><p v-else-if="practiceResult === 'pending'">简答题暂不自动评分，请结合参考答案判断是否掌握。</p></div></div><div v-if="practiceSubmitted && (practiceCurrent.explanation || practiceCurrent.referenceAnswer || practiceResult !== 'correct')" class="practice-explanation"><strong>解析</strong><p>{{ practiceCurrent.explanation || practiceCurrent.referenceAnswer || '这道题的解析正在完善中。' }}</p></div></div><div class="practice-actions"><button class="ghost-button" :disabled="practiceIndex === 0" @click="previousPractice"><svg-icon name="chevron-left" />上一题</button><button v-if="!practiceSubmitted" class="primary-button" @click="submitPractice">提交答案 <svg-icon name="arrow" /></button><button v-else class="primary-button" @click="nextPractice">下一题 <svg-icon name="arrow" /></button></div></div><aside class="practice-aside"><div class="aside-card practice-stat-card"><div class="aside-heading"><h3>本次练习</h3><svg-icon name="spark" /></div><div class="practice-score"><strong>{{ practiceSubmitted && practiceResult === 'correct' ? '100' : '—' }}</strong><span>当前得分</span></div><div class="practice-stat-row"><span>已完成</span><b>{{ practiceCompletedCount }} / {{ practiceQuestions.length }}</b></div><div class="practice-stat-row"><span>正确率</span><b>{{ practiceAccuracy }}</b></div></div><div class="aside-card question-map"><div class="aside-heading"><h3>答题卡</h3><span>{{ practiceQuestions.length }} 题</span></div><div class="map-grid"><button v-for="(_, index) in practiceQuestions" :key="index" :class="{ current: index === practiceIndex, answered: Boolean(practiceResponses[practiceQuestions[index].id]) }" @click="practiceIndex = index; resetPractice()">{{ index + 1 }}</button></div></div></aside></div><div v-else class="empty-practice"><div class="placeholder-icon"><svg-icon name="book" /></div><h2>还没有已发布试题</h2><p>先创建并发布一道试题，再开始顺序练习。</p><button class="primary-button" @click="go('add')">去新增试题 <svg-icon name="arrow" /></button></div></section>

        <section v-else-if="activeView === 'exam'" class="view exam-view"><div class="exam-topbar"><div><div class="eyebrow">学习与考试 / 模拟考试</div><h1>{{ paperConfig.name }}</h1><p>{{ generatedPaper.length }} 道试题 · 交卷前不显示答案和解析</p></div><div class="exam-timer" :class="{ urgent: examRemaining < 300 }"><svg-icon name="clock" /><strong>{{ formatExamTime(examRemaining) }}</strong><span>剩余时间</span></div><button class="primary-button" :disabled="examSubmitted" @click="submitExam()">{{ examSubmitted ? '已交卷' : '交卷' }} <svg-icon name="check" /></button></div><div v-if="examCurrent" class="exam-layout"><main class="exam-main"><div class="exam-card"><div class="exam-card-head"><span>第 {{ examIndex + 1 }} / {{ generatedPaper.length }} 题</span><span>{{ examCurrent.type }} · {{ generatedPaper[examIndex].score }} 分</span></div><h2>{{ examCurrent.title }}</h2><img v-if="examImageUrl" :key="examImageUrl" :src="examImageUrl" class="question-stimulus-image" alt="题目图片或乐谱" /><div v-if="examCurrent.hasAudio" class="practice-audio"><audio ref="examAudioElement" :src="examAudioUrl" preload="metadata" @ended="isPlaying = false"></audio><div class="audio-leading" :class="{ playing: isPlaying }"><svg-icon :name="isPlaying ? 'pause' : 'music'" /></div><div class="audio-body"><div class="audio-title"><strong>{{ examCurrent.audioName || '音乐片段' }}</strong><span>{{ examCurrent.audioDuration || '可重复播放' }}</span></div><div class="audio-progress"><i></i><b></b></div><div class="audio-meta"><span>听辨题</span><span class="audio-controls"><button @click="toggleExamAudio"><svg-icon :name="isPlaying ? 'pause' : 'play'" /></button><svg-icon name="volume" /></span><span>允许重复播放</span></div></div></div><div v-if="examCurrent.type === '选择题'"><div class="choice-answer-hint">{{ examCurrent.answerMode === 'multiple' || answerLetters(examCurrent.correctAnswer).length > 1 ? '多选题 · 可选择多个答案' : '单选题 · 请选择一个答案' }}</div><div class="practice-options"><button v-for="(option, index) in (examCurrent.options || [])" :key="option + index" :class="{ selected: answerLetters(examAnswers[examCurrent.id]).includes(String.fromCharCode(65 + index)), multiple: examCurrent.answerMode === 'multiple' || answerLetters(examCurrent.correctAnswer).length > 1 }" @click="toggleExamChoice(String.fromCharCode(65 + index))"><span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}</button></div></div><textarea v-else-if="examCurrent.type === '填空题'" class="practice-answer-input" :value="examAnswers[examCurrent.id] || ''" :readonly="examSubmitted" placeholder="请输入答案" @input="answerExam(($event.target as HTMLTextAreaElement).value)"></textarea><textarea v-else class="practice-answer-input large" :value="examAnswers[examCurrent.id] || ''" :readonly="examSubmitted" placeholder="请输入你的答案" @input="answerExam(($event.target as HTMLTextAreaElement).value)"></textarea><div v-if="examSubmitted" class="exam-result"><strong>客观题得分 {{ examScore }} 分</strong><span v-if="generatedPaper.some((item) => item.question.type === '简答题')">简答题待人工阅卷</span><p>参考答案：{{ examCurrent.type === '选择题' ? formatChoiceAnswer(examCurrent.correctAnswer) : (examCurrent.fillAnswers || []).join('、') || examCurrent.referenceAnswer || '请结合参考答案人工阅卷' }}</p><p v-if="examCurrent.explanation">解析：{{ examCurrent.explanation }}</p></div></div><div class="practice-actions"><button class="ghost-button" :disabled="examIndex === 0" @click="previousExamQuestion"><svg-icon name="chevron-left" />上一题</button><button v-if="!examSubmitted" class="secondary-button" @click="nextExamQuestion">{{ examIndex === generatedPaper.length - 1 ? '检查答题' : '下一题' }} <svg-icon name="arrow" /></button><button v-else class="primary-button" @click="go('dashboard')">返回首页 <svg-icon name="arrow" /></button></div></main><aside class="practice-aside"><div class="aside-card practice-stat-card"><div class="aside-heading"><h3>答题进度</h3><svg-icon name="clock" /></div><div class="practice-score"><strong>{{ Object.keys(examAnswers).length }}</strong><span>/ {{ generatedPaper.length }} 已答</span></div><div class="practice-stat-row"><span>考试状态</span><b>{{ examSubmitted ? '已交卷' : '进行中' }}</b></div><div class="practice-stat-row"><span>考试时长</span><b>{{ paperConfig.duration }} 分钟</b></div></div><div class="aside-card question-map"><div class="aside-heading"><h3>答题卡</h3><span>{{ generatedPaper.length }} 题</span></div><div class="map-grid"><button v-for="(item, index) in generatedPaper" :key="item.question.id" :class="{ current: index === examIndex, answered: Boolean(examAnswers[item.question.id]) }" @click="examIndex = index">{{ index + 1 }}</button></div></div></aside></div><div v-else class="empty-practice"><div class="placeholder-icon"><svg-icon name="layers" /></div><h2>还没有可用试卷</h2><p>请先在随机组卷中生成一份试卷草稿。</p><button class="primary-button" @click="go('papers', '随机组卷')">去随机组卷 <svg-icon name="arrow" /></button></div></section>

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
