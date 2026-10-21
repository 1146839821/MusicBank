# 连线题与图文混排验收核对

核对日期：2026-10-21。范围为用户九阶段增强要求，不能将单个测试通过等同于全部需求完成。

|要求|当前实现与证据|验收范围与边界|
|---|---|---|
|先审查实际技术与结构|matching-image-grid-plan.md 记录实际 contenteditable、TextRun、媒体、快照及 SQLite 机制|不是 Tiptap；保留既有稳定编辑器，采用结构化网格而非任意 HTML|
|2/3/4 列、批量图片、完整/裁剪、高度、文字、间距、对齐|ImageGrids.vue 实际控件及结构化 ImageGridBlock；image-grids.ts 保存边界校验|浏览器已验证上传、说明、顺序及保存重开；裁剪 Word 使用图片裁剪参数|
|拖动、编辑、删除、替换、排序|ImageGrids.vue 的 drop/move/upload/patch；另有前后移动按钮供键盘操作|拖动依赖浏览器 drag/drop；无强制整体栅格截图|
|图文位置及跨页面一致性|prompt-layout.ts、QuestionPrompt.vue；prompt-layout/paper-documents 测试；实际 Word/PDF 验收|段落以显式换行分隔，可在段前/段后插入；不支持嵌套网格|
|连线数据及教师编辑|MatchingEditor.vue、matching.ts、types.ts；matching/matching-persistence 测试|第一版支持上方图片或文字、下方文字名称；一对一，2–12 组|
|点击连接、取消、重连、清空及键盘|MatchingQuestion.vue 按钮与 SVG；四图浏览器鼠标/Tab/回车验收|不提供拖线输入；需求允许只提供点击方式|
|不同窗口与线位置|实际元素 getBoundingClientRect、ResizeObserver、图片 load 及窗口 resize|已做最小桌面窗口验收；不等同于所有设备或任意缩放覆盖|
|稳定 ID、目标乱序|matching.ts、paper-plan.ts、quick-exam.ts；乱序评分及不可变快照测试|答案保存 sourceId/targetId，不保存坐标或下标|
|部分分/全对分与精确总分|matchingScore 整数分配到百分之一分；matching.test.ts；原生 finishExam 重算|练习显示百分制；考试按试卷分值计算|
|所有题型与页面接入|App.vue、PaperWorkspace、ExamHistory；五题型测试、题库录入及四图模拟考试操作|判断题及旧题兼容有数据库测试；未宣称每个组合都有浏览器自动化覆盖|
|切题及未完成识别|practice-drafts、questionAnswerComplete；真实浏览器 1/4 连线、1/2 空切题及交卷确认|练习草稿为会话级；考试保存进度可恢复；未完成仍允许确认交卷|
|快照完整及原题编辑/删除|matching-persistence.test.ts：保存、改题、删除、部分分、快照及乱序保持|已有考试的试卷禁止覆盖；删除原题会清理其练习/错题索引，考试历史保留|
|资源保护及备份|questionAssets、question_asset_refs、paper_asset_refs；真实 PNG/WAV 备份恢复并重启测试|字节与 hash 元数据保留；历史引用阻止物理删除；不把原始路径写入题目|
|Word/PDF/打印布局|paper-documents 原生表格及嵌图、编号答案；实际 Electron PDF 及 Poppler 渲染验收|PDF 使用 Word 排版 DOM，非互动界面截图；实体打印尚未验收|
|迁移、备份、开发分支|实施报告中备份目录；2026102001 向前 CHECK/JSON 列迁移；旧学习记录保留测试|未重置用户数据库；开发数据与打包初始库分离|
|三平台安装包|提交 6b74495，Actions 39514019346 的 Intel/Apple silicon/Windows x64 全部成功|包内模块完成空库初始化、保存、交卷、原题删除、数据库重开及快照恢复|
|Windows 安装与卸载|同一运行的 Windows job 118941716281 实际运行 verify-windows-installer.ps1，日志确认安装、安装后数据库、快捷方式、卸载登记、卸载及用户数据保留通过|安装到带空格目录；静默安装/卸载已实测，人工向导与图形窗口尚未操作验收|

仍需人工环境验证：Windows 安装向导/图形窗口/卸载向导的交互、实体打印机输出、教师真实乐器素材内容校对。静默安装和卸载已由 Windows CI 实际执行并通过；不能将其替代人工窗口验收。未将这些人工项目标记为已完成。

具体每轮测试数量、提交和构建记录见 matching-image-grid-plan.md。
