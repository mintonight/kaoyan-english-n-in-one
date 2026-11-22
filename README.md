# 考研英语 n in one

> 一体化考研英语阅读研习系统 —— 从真题整合、难度筛选、交互刷题到笔记 & 云端同步，一站式搞定。

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-8a6a34?style=flat-square)](https://mintonight.github.io/kaoyan-english-n-in-one/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](#license)

---

## ✨ 项目简介

本项目把 **2017~2025 考研英语一 / 英语二** 中最难的阅读篇章挑选出来，做成了一个**离线可用、带笔记同步**的交互式刷题网页。无需后端、无需安装，双击 `index.html` 即可在任意浏览器使用。

## 🚀 功能特性

### 📚 真题阅读库
- 收录近 5 年（2021–2025）**英语一 8 篇 + 英语二 9 篇**历年「巅峰难度 Tier」阅读真题
- 每篇含：原文（分段编号）+ 题干 + A/B/C/D 选项 + 官方答案 + 考查题型 + 解题要点
- **争议题**用橙色徽章醒目标注（如 2023 英一 T3 第33题、2022 英一 T4 第40题），并列明「主流答案 / 争议答案」两种观点

### 🖥️ 交互式刷题界面
- **左右分栏**：左侧题目原文，右侧选项作答
- **可拖动中缝**：任意调节左右宽度，双击复位 50%
- **顶部目录**：按 卷别 / 年份 / 篇目 快速跳转，题号药丸直达任一题目
- **两种模式**：自测做题模式 ⇄ 精读解析模式一键切换
- **18 分钟考场仿真倒计时**
- **划词查词浮窗**：双击/划选文章任意单词即时弹出词义
- 羊皮纸护眼主题 + 学术衬线字体，长时间阅读不累眼

### 📝 笔记系统 + ☁️ GitHub Gist 云端同步
- 每篇阅读都可记录**个人笔记**（生词、长难句、错题原因、心得）
- 笔记**自动保存到浏览器本地**（localStorage），刷新不丢
- 一键**同步到你的 GitHub Gist**（私人 Gist，仅需 `gist` 权限的 Token）
- 支持从 Gist **拉取并合并**笔记，多设备共用一份云端笔记
- Token 只保存在你本机浏览器，不上传任何第三方服务器

---

## 🏁 快速开始

### 方式一：直接运行（推荐）
```bash
git clone https://github.com/mintonight/kaoyan-english-n-in-one.git
cd kaoyan-english-n-in-one
# 直接双击打开 index.html 即可，或：
# macOS
open index.html
# Windows
start index.html
```

### 方式二：在线访问
部署在 GitHub Pages 上，直接访问：
👉 **https://mintonight.github.io/kaoyan-english-n-in-one/**

---

## ☁️ Gist 同步配置

1. 打开网页，点击笔记面板右上角的 **⚙️** 按钮
2. 到 [GitHub → Settings → Developer settings → Tokens](https://github.com/settings/tokens/new?scopes=gist) 创建一个只勾选 **`gist`** 权限的 Token
3. 把 Token 粘贴到设置框；Gist ID 留空（首次同步会自动帮你创建）
4. 点 **☁️ Gist 同步** 上传笔记；点 **⬇️ 拉取** 从云端恢复

> 🔒 安全说明：Token 仅存于本地 `localStorage`。所有请求直接发往 `api.github.com`，不经过任何中间服务器。

---

## 📂 项目结构

```
kaoyan-english-n-in-one/
├── index.html                     # 单文件交互式刷题 + 笔记系统（入口）
├── hardest_reading_final.json     # 阅读真题数据（含答案/难点/争议标记）
└── README.md
```

## 🛠️ 技术栈

- 纯 **HTML + CSS + 原生 JavaScript**，零依赖、零构建
- 数据与视图分离：真题全部存于 JSON，便于增改
- 存储：`localStorage`（本地）+ **GitHub Gist API**（云端）

## 🤝 贡献

欢迎提交 Issue / PR 补充更多年份真题、修正答案、优化界面。若发现答案争议，请在 Issue 中附上机构解析出处。

## 📄 License

[MIT](https://opensource.org/licenses/MIT) © 2026 Yimino (mintonight)

---
> ⚠️ 真题版权归原作者及命题机构所有，本仓库仅用于个人学习研究，不用于商业用途。


## ✨ 精读解析（逐选项）

每道题在「精读解析」模式下都会显示：
- **【考查题型】**：细节题 / 推断题 / 主旨题 / 态度题 / 词义题 / 例证题 / 原因题
- **【解题要点】**：定位段落与核心依据
- **【逐选项解析】**：A/B/C/D 逐项说明——【正解】标为绿色并给出依据段；错误项用规范标签指明错因（【范围放大】【范围缩小】【过度推断】【偷换概念】【正反混淆】【无中生有】【答非所问】【张冠李戴】【绝对化】等）

## 🚀 部署（GitHub Pages via Actions）

本仓库已包含 `.github/workflows/deploy.yml`：推送到 `main` 后会自动构建并把 `index.html` 发布到 GitHub Pages。
首次启用：仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions** 即可。
