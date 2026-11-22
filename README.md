# 考研英语 N IN ONE

> 一体化考研英语学习中心 —— 历年巅峰难度真题阅读精读 + 作文句子/主题词拼写 + PWA 离线安装 + GitHub Gist 多端双向合并同步。

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-8a6a34?style=flat-square)](https://mintonight.github.io/kaoyan-english-n-in-one/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](#license)

---

## ✨ 功能特性

### 📖 阅读练习（`reading.html`）
- 收录近 5 年（2021–2025）**英语一 8 篇 + 英语二 9 篇**历年「巅峰难度」阅读真题（共 85 题）
- 每题配备 **【考查题型】【解题要点】【逐选项解析】**，争议题用橙色徽章单独列明主流/争议两种观点
- 桌面端左右分栏 / 手机端上下分栏，中缝支持拖拽调节比例（双击复位 50%）
- 支持自测做题 ⇄ 精读解析双模式、18 分钟倒计时、划词查词浮窗、逐题计时与逐题笔记

### ✍️ 拼写练习（`spelling.html`）
- 覆盖 **2 篇范文整句 + 16 年（2010–2025）真题主题词 + 7 类必备主题词**（共 25 组 · 419 项）
- 看中文写英文，每空一词即时核对、按住显示答案、自定义快捷键、错词榜与语音朗读（离线优先使用本机离线语音）

### 📲 PWA 安装到本地（完全离线可用）
- 零外部 CDN/字体依赖，内置 `manifest.webmanifest` 与 `sw.js` 预缓存全站页面、脚本与题库（约 260 KB）
- **桌面端（Chrome / Edge）**：访问 GitHub Pages 后点击顶栏「📲 安装到本地」或地址栏安装图标，生成独立桌面应用，断网秒开
- **手机端**：Android Chrome/Edge 点「安装到本地 / 添加到主屏幕」；iOS Safari 点「分享 → 添加到主屏幕」
- **本地直接打开**：也保留了零构建特性，下载仓库后直接双击 `index.html` 即可在浏览器中使用

### ☁️ 多端双向同步（GitHub Gist）
- 在首页、阅读页或拼写页任一处填入仅有 **`gist`** 权限的 [GitHub Token](https://github.com/settings/tokens/new?scopes=gist) 即可使用
- **无需手动复制 Gist ID**：新设备留空 Gist ID，首次同步会自动查找云端已有的 `kaoyan-study-data.json`（没有则自动新建私密 Gist）
- **安全双向合并（不覆盖）**：先拉取远端 → 按单题时间戳 / 拼写分设备 CRDT 计数无损合并 → 仅在有差异时推送；若拉取失败直接中止，绝不盲写覆盖
- **离线自动续传**：断网期间学习记录照常保存在本机，联网后自动同步；同时支持一键导出/导入合并 `.json` 本地备份

> 🔒 安全说明：Token 仅保存在你本机浏览器的 `localStorage`，所有同步请求直连 `api.github.com`，不经过任何第三方服务器。

---

## 📂 项目结构

```text
kaoyan-english-n-in-one/
├── index.html                 # 首页入口（阅读区 / 拼写区 / PWA 安装 / 多端同步）
├── reading.html               # 阅读研习页
├── spelling.html              # 拼写练习页
├── sync.js                    # 统一多端双向同步引擎（Gist + CRDT 合并 + 导入导出）
├── pwa.js                     # PWA 注册、安装引导与离线状态提示
├── sw.js                      # Service Worker（全站离线预缓存）
├── manifest.webmanifest       # Web App Manifest
├── data/
│   ├── reading-data.js        # 17 篇阅读真题与划词词表（单一数据源）
│   └── spelling-data.js       # 25 组 419 项拼写题库（单一数据源）
├── icons/                     # PWA 应用图标（SVG + 192/512 PNG）
├── .github/workflows/deploy.yml
└── README.md
```

## 🚀 部署（GitHub Pages via Actions）

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动打包并发布到 GitHub Pages。
首次启用：仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions** 即可。

## 📄 License

[MIT](https://opensource.org/licenses/MIT) © 2026 Yimino (mintonight)

> ⚠️ 真题版权归原作者及命题机构所有，本仓库仅用于个人学习研究，不用于商业用途。
