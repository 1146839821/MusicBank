# MusicBank 图文网格与连线题交付说明

核对日期：2026-10-21。实现分支：`codex/matching-image-grid`。此说明汇总当前交付，不替代逐轮实施记录。

## 教师和学生流程

教师在新增/编辑试题中选择“连线题”，上传图片并填写名称，使用稳定项目 ID 设置一对一标准关系及按组/全对评分。保存后可重新编辑、复制和预览。图文网格支持 2/3/4 列、批量图片、说明、完整/裁剪显示、高度、间距、对齐、拖动或按钮排序、替换和删除，也可放到题干段落之间。

学生在顺序练习、专项练习或模拟考试中先选上方项目，再选下方名称，以 SVG 连接线显示关系。可以取消、重连和清空，支持 Tab/回车。名称显示顺序在练习开始或试卷生成时打乱；答案按 ID 评分，不使用屏幕坐标或数组下标。未完成连接允许切题，交卷前会提示。

随机组卷可以配置连线题数量与每题分值；答卷保存全部匹配关系，支持部分得分、考试历史回看和错题重练。原选择、填空、判断、简答题继续使用各自的逻辑。

## 关键文件和数据结构

|范围|实现文件|
|---|---|
|结构及边界校验|`electron/types.ts`、`electron/matching.ts`、`electron/image-grids.ts`、`electron/question-assets.ts`|
|教师录入和学生答题|`src/components/ImageGrids.vue`、`MatchingEditor.vue`、`MatchingQuestion.vue`、`AssetImage.vue`、`src/App.vue`|
|段落混排与格式|`electron/prompt-layout.ts`、`src/components/QuestionPrompt.vue`、现有 `PromptEditor.vue` 和 `TextRun[]`|
|存储、复制、草稿和考试|`electron/db.ts`、`src/question-copy.ts`、`src/practice-drafts.ts`、`src/exam-store.ts`、`src/components/ExamHistory.vue`|
|组卷与历史快照|`electron/paper-plan.ts`、`src/quick-exam.ts`、`src/components/PaperWorkspace.vue`|
|资源及备份|`src/media-store.ts`、`electron/asset-response.ts`、`create-backup.ts`、`restore-backup.ts`、`learning-backup.ts`|
|Word、PDF、打印及分页|`electron/paper-documents.ts`、`document-images.ts`、`document-window.ts`、`document-handlers.ts`、`src/components/ExamDocuments.vue`、`src/papers/paginate.ts`|
|桌面构建和运行验证|`.github/workflows/build-desktop.yml`、`scripts/verify-package.mjs`、`package-smoke.cjs`、`verify-windows-installer.ps1`、`native-audio-smoke.cjs`、`native-pagination-smoke.cjs`|

- `MatchingItem`：`id/contentType/text/assetId/order`。
- `MatchingPair`：`sourceId/targetId`。
- `MatchingData`：`version/sources/targets/pairs/scoring/targetOrder`。
- `ImageGridBlock`：`id/kind/columns/imageHeight/fit/gap/align/items/afterParagraph`，每张图片为稳定 ID、assetId、caption。
- 学生答案为 `{version:1,pairs:[...]}` JSON，沿用答卷 answer 字段；重复或未知 ID 在保存边界被拒绝。
- 评分以整数百分之一分计算，分配不能整除的余数后，全对严格等于满分。

实际现有编辑器是自定义 contenteditable 和 TextRun，并非 Tiptap。此次保留编辑器及乐谱系统，增加可编辑的结构化图文块，不保存任意 HTML 或绝对文件路径。

## 数据迁移及保护

修改前已建立开发分支，原生数据备份位于用户 Documents 下的 `MusicBank Backups/pre-matching-20261020-233317`，含 manifest 和数据副本。该原生库当时为 0 题；浏览器开发数据独立保存。

迁移版本 `2026102001` 显式检查后增加 `matching_json`、`image_grids_json`。题型 CHECK 的扩充在事务中保留旧列和记录、恢复索引并检查外键。历史资源引用执行 `migration.paper-asset-references.v2` 回填。迁移测试覆盖旧题、练习和错题记录；未重置数据库。

试卷保存完整题目、图片 ID、标准关系、乱序展示顺序、分值及评分规则。修改/删除原始题目不会改变历史快照；历史引用通过资源引用表保护文件。备份恢复前校验新结构，格式兼容版本 1。

## 导出和运行验收证据

- 当前单元测试：34 个测试文件、196 项通过；类型检查和 renderer/Electron 构建通过。
- 浏览器实际验收：四图连线保存重开；网格说明/列数/顺序；鼠标取消/重连、Tab/回车操作；未完成切题；两组正确得 2/4 分；历史答卷恢复。测试素材为项目 PNG，名称为二胡、琵琶、竹笛、小提琴。
- Word 使用真实表格和嵌入图片，学生卷不含标准连线；答案以图片编号→名称编号表示。连线表格非末行设置连续排版，普通网格可按行分页。WebP 在桌面导出时转换为 PNG，原始资源不被改写。
- 生产 PDF 路径实测：40 张 PNG 测试图生成 4 页，独立 Poppler 确认页数及 1–40 顺序，首末页渲染无截断；分页再次执行后文档结构不变。两行短表格保持整体及题号。
- 真实 Electron 音频运行检查：两份三秒 WAV 均可读取时长、播放推进、暂停及 seek 到第二秒。数据库/备份测试另行覆盖多图片、多音频保存和重开。
- 打包运行检查：包内 SQLite 及真实数据库模块执行空库初始化、保存、匹配判分、原题删除、关闭重开和快照恢复；Windows CI 实际静默安装/卸载，验证快捷方式、卸载登记及用户数据保留；macOS Apple silicon 打包窗口已手工打开并加载 ASAR 内页面。
- 全三平台已通过记录：`d67cf4c`，Actions `39527133275`，覆盖音频修正。包含最新 Word/PDF 分页验证的 `31a0418`，Actions `39528342980` 仍须以最终状态为准，不沿用旧提交的绿色结果。

## 可复现检查

```sh
npm test
npm run build
npx electron scripts/native-audio-smoke.cjs
npx electron scripts/native-pagination-smoke.cjs
```

后一个命令可追加 `--pdf=<本机输出路径>` 保存受控测试 PDF。三平台安装包由 workflow_dispatch 在本分支执行生成；本轮没有合并主分支或发布正式 Release。

## 限制及未实际验收项

- Windows 图形安装/卸载向导和图形窗口尚未人工操作；静默安装/卸载与原生运行已由 CI 实测。
- 尚未连接实体打印机；已验证生产 PDF 路径和打印排版，不能将其描述为纸张输出验收。
- 教师实际乐器照片的内容正确性需教师校对；现有验收使用技术测试素材。
- 一对一匹配为第一版范围；不提供鼠标拖线、多对多或网格嵌套。
- 单个表格行本身高于整页时，仍保留完整行；任意超长说明需教师调整版式。正常多行网格已支持跨页。
- Microsoft Word 最终分页尚未逐个用户模板人工打开检查；已验证 OOXML 结构及独立 PDF 输出，复杂自定义模板仍需预览确认。

完整阶段审查、命令结果与历史构建记录见 `matching-image-grid-plan.md`；要求矩阵见 `matching-acceptance-audit.md`。
