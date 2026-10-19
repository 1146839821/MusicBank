# MusicBank · 乐测题库

MusicBank 是面向小学音乐教师和教研员的本地题库与练习应用。当前版本包含 Vue 3 + TypeScript 渲染层，以及 Electron + SQLite 桌面数据层基础。

## 开发

```bash
npm install
npm run dev
```

浏览器开发模式使用 `localStorage` 作为回退存储。浏览器内可以录入题目、插入图片和 MP3/WAV 预览，并打开五线谱/简谱谱面编辑器；完成后谱面会导出为题目图片。

## 桌面端

```bash
npm run build
npm run start
```

桌面端数据写入 Electron `userData/data/`：

- `database/music_questions.db`：SQLite 数据库，启用 WAL 和外键。
- `assets/audio/`：音频素材。
- `assets/images/`：图片素材。

渲染层只能通过 Preload 暴露的白名单接口访问题目、试卷、考试、练习记录和素材。导入题目的图片与音频会复制到上述应用数据目录，题目只保存资源 ID，不依赖用户原始文件路径；页面通过 `musicbank-asset://<assetId>` 协议读取素材，因此重启应用后仍可预览。考试开始、逐题作答和交卷会写入 SQLite；练习结果与错题会去重保存，重启桌面应用后可以恢复错题列表。音频第一次读取元数据后，真实时长也会回写到素材表。试卷管理可以浏览已保存的快照、载入配置、直接开始模拟考试或删除本地试卷。

系统页的“数据备份”会导出单个 `.musicbank.json` 文件，其中包含题目、试卷快照、错题关联以及应用数据目录中的图片和音频字节；恢复备份前会提示替换当前本地数据，并清理旧素材文件。

## 检查

```bash
npm run build
npm test
```

`npm run dist` 使用 electron-builder 生成 macOS DMG 和 Windows NSIS 配置对应的安装包。正式分发前仍需在目标系统准备 Electron 二进制、原生模块和代码签名环境。

## GitHub Actions 发布

`.github/workflows/build-desktop.yml` 会在手动触发或推送 `v*` 版本标签时并行构建三个桌面版本：

- `MusicBank-<version>-x64.dmg`：macOS Intel
- `MusicBank-<version>-arm64.dmg`：macOS Apple silicon
- `MusicBank-Setup-<version>-x64.exe`：Windows x64

Windows 使用 NSIS 安装程序，支持选择安装目录、桌面和开始菜单快捷方式，并在系统“应用和功能”中提供 MusicBank 卸载入口。卸载默认保留应用数据目录，避免误删题库；如需清理数据，请在应用内使用备份和数据管理功能。

创建并推送版本标签后，工作流会把三个安装包和对应的 blockmap 文件发布到 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 音乐符号

录题时可以打开“谱面编辑器”，在简谱和五线谱之间切换。五线谱覆盖全音符、二分、四分、八分、十六分、三十二分和六十四分音符，以及对应的附点/复附点时值、休止符、连音、三连音、拍号、升降还原记号、单/双小节线、终止线和反复记号；简谱提供 1–7 与 0、上下加点、下单线、下双线、附点、连音、三连音、分拍线、单/双竖线、终止线和反复线。选择音级后再点加点或下线按钮，会组合成例如 `4̳̇` 的复合记号。完成后点击“生成题目图片”，系统将 PNG 保存到应用数据目录，并通过资源 ID 关联到当前题目。
