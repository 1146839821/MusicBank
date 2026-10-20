# 图文网格与连线题实施审查

## 实施前保护

开发分支：codex/matching-image-grid，基于 b309190。
本机应用数据已备份到用户 Documents/MusicBank Backups/pre-matching-20261020-233317；SQLite 完整性检查 ok。该原生数据目录现有题目、试卷、考试记录均为 0；浏览器开发数据与原生数据分开存储。不得重置数据库。

## 实际代码审查

|关键文件|当前机制|扩展风险及处理|
|---|---|---|
|src/components/PromptEditor.vue、src/prompt-content.ts|自定义 contenteditable，保存 text 与 bold/italic TextRun；不是 Tiptap，粘贴纯文本|保留已验证编辑器，增加结构化图文节点，不写任意 HTML 或绝对路径|
|src/media-store.ts、electron/main.ts、QuestionMedia.vue|原生资源复制到应用数据目录，浏览器 IndexedDB；附件数组，多图片/audio controls，自定义协议支持音频范围请求|图文及连线图片必须纳入同一资源引用；避免再次作为独立附件重复显示|
|NotationEditor.vue、src/notation/*|结构化乐谱源稿、SVG 转 PNG 后资源入库|保持独立编辑器，不替换或集成上游整个项目|
|electron/types.ts、electron/db.ts|四题型，JSON 选项/附件/格式片段，SQLite CHECK 限制题型|增加连线题及 JSON 字段；事务重建 CHECK，保留所有列、索引及外键关系|
|src/question-copy.ts、App.vue|深拷贝复制题目，录入及答题逻辑集中在 App|新字段必须贯穿打开、保存、复制、预览、筛选，避免遗漏|
|electron/paper-plan.ts、src/quick-exam.ts|按题型参数及种子抽题，完整题目深拷贝快照|目标显示顺序在生成快照时确定并保存；正确关系始终使用 ID|
|electron/db.ts|paper_items 快照、paper_asset_refs；已有考试时禁止覆盖试卷|扩展引用收集器保护网格与连线图片；新增引用回填版本|
|electron/paper-documents.ts、ExamDocuments.vue|操作真实 Word XML，保留模板布局；docx-preview 后打印/PDF|使用 Word 表格和内嵌图片排版，不截图替代；预留连线空间，答案输出编号映射|
|App.vue、exam-store.ts、ExamHistory.vue|字符串答卷，原生 SQLite/浏览器存储；客观自动评分、简答人工评分|匹配答卷以版本化 JSON 存储，统一验证和判分；所有入口使用共享逻辑|
|create-backup.ts、restore-backup.ts、learning-backup.ts|包含资源、题目、试卷及学习记录；恢复前验证、暂存及回滚|新增结构校验并保留旧版备份兼容；错误结构不能覆盖数据|

潜在问题：旧迁移 ALTER 捕获所有错误，不能作为新迁移范式；新增迁移应显式检查列。现有模板仅认识四题型，需兼容新增连线区域。现有资源导出按整行图片处理，需新增结构化表格排版。渲染器的资源类型/大小校验不能替代原生边界校验。

## 数据设计

- ImageGridBlock：稳定 id、columns(2/3/4)、imageHeight、fit(contain/cover)、gap、align、items(id/assetId/caption)。资源只保存 ID。
- MatchingItem：id/contentType/text/assetId/order。
- MatchingPair：sourceId/targetId。
- MatchingData：version、sources、targets、pairs、scoring(per-pair/all-or-nothing)、targetOrder。展示乱序与答案关系分离。
- 学生答案：版本化匹配关系 JSON，存入兼容现有 answer 字段；拒绝重复 source/target 和未知 ID。
- 分值：以整数百分之一分分配，余数按标准项目顺序分配，保证全对等于满分且总分精确。

## 分阶段实施及验证

1. 类型、结构校验、共享匹配算法、整数评分及单元测试；向前迁移及旧数据保留测试。
2. 图文网格组件：列数、显示方式、高度、间距、对齐、文字、替换/删除、多图、拖动及键盘排序；结构保存/恢复。
3. 连线题教师录入：图片与名称、稳定 ID、一对一标准关系、评分规则、编辑及复制。
4. MatchingQuestion：上图片下文字、SVG 线、选择/取消/重新连接/清空、键盘及窗口尺寸响应。
5. 接入列表、预览、顺序/专项练习、随机组卷、考试、记录、错题及部分得分；未完成状态识别。
6. 快照及资源保护、备份恢复验证，生成时保存展示顺序。
7. Word 原生表格布局、答案编号映射，PDF/打印复用文档布局，模板兼容。
8. 每个阶段运行类型检查、构建和相关测试；最终全量回归及浏览器操作验收、三平台构建检查。

回归范围：原四题型、图片音频、四组连线保存重开、连接取消与乱序、部分正确计分、随机组卷、快照不变、Word/PDF、旧题编辑不丢数据、Windows/macOS 构建。任何未实际验证的项目在最终报告明确列出。

## 实施结果（2026-10-21）

已接入上述全部功能入口。新增 `electron/matching.ts` 和 `electron/image-grids.ts` 作为数据校验边界；新增 `AssetImage.vue`、`ImageGrids.vue`、`MatchingEditor.vue`、`MatchingQuestion.vue`。现有编辑器仍保存纯文本与格式片段，图文网格保存独立结构化块并随题干渲染，不存任意 HTML；不是 Tiptap 节点。后续增强已支持按段落定位，详见下文。

数据库迁移版本 2026102001：显式检查后添加 matching_json / image_grids_json；事务扩充题型 CHECK，复制全部旧列、恢复原索引并检查外键。历史试卷资源引用执行 v2 回填。备份格式仍为兼容的版本 1，新增结构在恢复覆盖前校验。历史试卷完整快照不随原题编辑/删除而改变。

已执行：166 项测试、29 个测试文件全部通过；Vue/TypeScript 检查、Vite 与 Electron 构建通过；git diff --check 通过。测试覆盖旧题型、媒体、复制、迁移、学习历史、快照/资源约束、恢复、乱序、部分得分与整数精度、Word 原生图片表格和答案映射。

浏览器验收：四张图片连线题保存重开；图文网格列数、文字和顺序恢复；真实 Word 预览保留网格和图片；鼠标连接/取消、键盘连接、切题保留；未完成提交提示；两组正确得 2/4 分且历史记录恢复两条连接。图片使用项目内 PNG 测试素材，名称使用四种乐器。另以文字项目独立复测完整判分流程。

PDF 验收：从实际 docx-preview 排版 DOM 调用 Electron 原生 documentPdf，生成一页 A4 PDF，Poppler 渲染后检查项目对齐、文字和连线空白区，无裁切重叠。未实际连接实体打印机；Windows 安装/卸载人工操作不属于本机可验证范围。三平台 CI 打包及原生 SQLite 启动检查结果见后续构建记录。

### 最终跨平台构建记录

实现提交：883378c。GitHub Actions 运行 39456822610，macOS Intel、macOS Apple silicon、Windows x64 三个任务均成功，包括全量测试、TypeScript/构建、打包、安装包内容校验和原生 SQLite 读写冒烟检查。Windows 产物为支持卸载的 NSIS 安装程序。此轮未发布正式 GitHub Release，也未执行实体打印或 Windows 安装/卸载人工验收。浏览器 1120×820 最小桌面窗口检查通过。

完整修改文件：
- electron/types.ts、matching.ts、image-grids.ts、question-assets.ts：类型、验证、共享计分、资源收集。
- electron/db.ts、learning-backup.ts：向前迁移、保存恢复、快照引用、原生判分。
- electron/paper-plan.ts、paper-documents.ts：题量参数、乱序快照、Word 表格图片及答案。
- src/App.vue、exam-store.ts、quick-exam.ts：录入、预览、筛选、练习、考试、提交及持久化。
- src/components/AssetImage.vue、ImageGrids.vue、MatchingEditor.vue、MatchingQuestion.vue：新组件。
- src/components/ExamHistory.vue、PaperWorkspace.vue：记录回看和组卷配置。
- tests/matching.test.ts、matching-persistence.test.ts、question-media.test.ts、template-storage.test.ts：新功能及兼容回归。
- docs/matching-image-grid-plan.md：审查、实施计划和验收记录。

待人工确认项：真实乐器教学素材的内容校对、实体打印效果、Windows 安装/卸载操作。功能范围说明：第一版提供上方图片/文字、下方名称的一对一匹配；图文网格使用结构化块，未更换原编辑器；后续增强已支持题干段落之间的网格布局，不支持网格内再嵌套网格。


## 段间图文布局增强（2026-10-21）

ImageGridBlock 新增可选 afterParagraph：0 表示题干开头，正整数表示第几段之后；未设置保持旧版末尾行为。删除段落导致位置超出范围时，网格暂按题干末尾显示，保留原位置并在控件中说明。段落以录入的换行区分，不受窗口自动折行影响。该字段保存在现有 JSON 列，旧备份无需变更，无新增 SQLite schema 迁移。

新增 electron/prompt-layout.ts，为预览、练习、考试、记录和 Word 导出共用文字/网格排序；切分格式片段而不丢弃加粗、倾斜和空白行。新增 QuestionPrompt.vue，替代各详情页单独的题干加末尾网格拼接。ImageGrids 增加位置选择；PromptEditor 暴露当前光标所在段落，新建网格默认插入该段之后，也可手动调整到开头或末尾。Word/PDF 使用原生表格保持相同顺序及说明对齐。另修正学生预览误显示连线标准答案的问题；教师编辑界面保留标准对应关系。

修改文件：electron/types.ts、image-grids.ts、prompt-layout.ts、paper-documents.ts；src/App.vue；src/components/QuestionPrompt.vue、ImageGrids.vue、PromptEditor.vue、ExamHistory.vue；tests/prompt-layout.test.ts、paper-documents.test.ts、matching-persistence.test.ts。

本机 175 项测试、30 个测试文件、Vue/TypeScript 检查、前端和 Electron 构建全部通过。浏览器验收包括两段题干中插入图片网格、第一段加粗、保存重开恢复、六张实际图片的 Word 预览；布局不使用页面截图作为导出内容。旧版没有位置字段的题目保持原有末尾布局。

补充验收：完整导出 HTML 含六张实际加载的图片，通过 Electron documentPdf 生成一页 A4 PDF，再用 Poppler 渲染检查，段落/网格/说明/连线空白区顺序正确，无裁切。四图匹配题在模拟考试中全部连对得到 4/4 分，考试记录恢复全部图片、段落顺序及四条连接。未上传图片的空网格在预览和导出时忽略，不生成空 Word 表格，草稿中的可编辑网格保留。

### 2026-10-21 练习草稿回归

- 新增 `src/practice-drafts.ts`，将当前练习会话中的未提交答案按稳定试题 ID 保留；题目切换、筛选后可恢复。草稿与正式提交结果分离，不计入完成数或正确率。
- `src/App.vue` 接入所有题型的草稿恢复；重新进入练习清空会话，错题重新练习清理对应旧草稿。数据仅在当前练习会话内保留，无数据库或迁移变更。
- 新增 `tests/practice-drafts.test.ts`，验证部分连线、多选字符串、清空、已提交答案优先、空筛选池和会话重置。
- 178 项测试通过；TypeScript、生产构建、diff 检查通过。浏览器实测：连线 1/4 组及填空 1/2 空分别切题往返均恢复，未提交时完成数仍为 0。

### 2026-10-21 浏览器交卷一致性

- 审查发现 `src/exam-store.ts` 的浏览器交卷分支缺少桌面 SQLite 分支已有的完整答卷校验，也未在最终交卷边界验证连线答案格式。
- 补齐题目记录数量、所属考试、连续题号和连线答案结构校验；所有验证及重新计分完成后才写入记录。校验失败保留进行中状态和此前已保存答案。
- 合法的未完成连接仍可交卷：按正确组数给分；空答案为零分。记录完整性校验不要求学生答完全部连接。
- 新增 `tests/exam-submission.test.ts`，覆盖缺项、重复、错误考试/题号、损坏 JSON、重复/未知项目、失败后恢复、部分给分与空答案。调整原考生姓名测试为提供完整题号记录。
- 182 项测试、TypeScript、生产构建与 diff 检查通过。本次无数据结构或数据库迁移变化。

### 2026-10-21 原题型答卷展示回归

- `electron/fill-answers.ts` 新增 `formatFillResponse`，按空号显示学生实际输入，保留漏答位置和旧记录中多余的输入，不将学生输入的 `|` 解释为教师备选答案。
- `ExamHistory.vue` 使用逐空显示；简答题的原始换行也保留。模拟考试交卷后的填空参考答案统一使用 `formatFillAnswers`。
- 184 项测试、TypeScript、生产构建、diff 检查通过。浏览器实测旧开发答卷填空输入“中强”交卷后在记录显示“第1空：中强”。多空、漏答及 CRLF 输入由回归测试覆盖。
- 验收发现旧开发试卷快照部分题目缺少标准答案，界面明确显示“未设置答案”；不从当前题库补写历史快照，以保护历史原始内容。本次无 schema 变更。

### 2026-10-21 考试完成度一致性

- `src/question-answers.ts` 新增 `questionAnswerComplete`，统一连线、填空、判断、选择和简答的输入完成判定，完成度与正确性分离。
- 填空题要求每一空非空且数量一致；连线题要求完整一对一；判断题识别 true/false；选择和简答识别非空输入。兼容没有 fillAnswers 的旧单空快照。
- 考试进度、答题卡、未交卷历史记录使用同一函数。交卷前提示所有未答完题目的数量，允许确认后按原规则交卷；超时自动交卷不受提示阻挡。
- 188 项测试、TypeScript、生产构建与 diff 检查通过。浏览器实测两空题：一空时 0/7，填满时 1/7，清空后一空时 0/7；未完成数量提示准确，确认后交卷成功，仍按原规则计分。
- 无数据库或已保存答案格式变更。

### 2026-10-21 历史素材备份完整链路

- 新增真实 PNG/WAV 文件集成测试：四图连线 + 段间图文网格 + 音频 → 部分得分 → 删除原题 → JSON 备份 → 恢复到另一数据目录 → 关闭重开 → Word 导出。
- 测试暴露原题已有错题/练习记录时删除被外键阻挡。`MusicBankDatabase.deleteQuestion` 现以事务清理该原题的练习记录和错题索引，再删除原题；其他试题的学习记录、历史考试/试卷快照及媒体文件保留。前端同步清理该题本次练习缓存和错题计数。
- 验证恢复后图片、音频字节及 SHA256 元数据完整；原题已不存在时，快照中的匹配项目、正确关系、乱序、网格段落位置和 2/4 分答卷均保持。历史资源外键仍阻止物理删除，恢复后 Word 生成 5 处原生图片（网格 1 + 连线 4）。
- 189 项测试通过；调整隔离测试后又单独重跑 matching-persistence 的 8 项测试通过；TypeScript、生产构建、diff 检查通过。本次不修改 schema。

### 2026-10-21 需求核对与包内模块运行检查

- 新增 `docs/matching-acceptance-audit.md`，逐项对应九阶段要求、实际实现、测试/操作证据和未验证边界；保留 Windows 人工安装卸载、实体打印和真实教材素材校对为待验收项。
- 扩展 `scripts/verify-package.mjs`：检查包内 db.js，并通过发货 Electron 执行 `scripts/package-smoke.cjs`。直接导入 app.asar 内的实际 ESM 数据库模块，验证空题库初始化、schema、连线题保存、部分得分重算、删除原题及重启后的考试快照和乱序恢复。
- smoke 只在系统临时目录创建测试数据库，结束后清理，不接触用户应用数据。三平台工作流使用该检查，修改 smoke 脚本也会触发主分支打包。
- 189 项测试、TypeScript、构建通过；本机重新打包 macOS arm64，原生 SQLite 和应用数据库往返检查均通过，检查未打包用户数据。
- 构建运行 39462802366 对应前一应用提交 3a9ddeb；扩展 smoke 的提交需另行发起构建，不混用不同提交的验证结果。
