# YouTube Learning Helper

一个自用的 YouTube 英语学习 Chrome 扩展。看视频的同时记生词、练发音、用 AI 整理知识、建个人知识库。

配合 **EasyInput AI 键盘**（8 键 + 1 旋钮），可以做到无鼠标操作。

---

## ✨ 功能

### 📺 字幕
- 自动抓取当前视频的英文字幕（含 PoToken 拦截）
- 每条字幕显示时间戳，点击跳转到视频对应位置并暂停
- 鼠标悬停任意英文单词显示中文释义（Google 翻译）
- 点击单词标记为生词（黄色高亮）

### 📖 生词本
- 全局生词本，跨视频保存
- 顶部筛选栏：当前视频 / 全部
- 每张生词卡显示：单词、Google 中文、原句（可点击跳转）、所属视频链接
- 🔊 一键朗读单词（浏览器 TTS）
- 🤖 按需 AI 解释：音标、词性、语境释义、例句
- 按 Space 跳回原句 + 朗读
- 跨视频时只朗读、不跳转

### 🤖 AI 整理
- 一键把整篇字幕发给 DeepSeek，生成摘要 + 核心知识点
- 结果缓存到本地，切走再回来秒显示（不重复扣费）
- 来源徽章：缓存 / API 调用
- 按 Shift + Enter 强制重新生成

### 📚 知识库
- 按视频保存摘要、知识点、生词、完整字幕
- 自定义标签，支持按标签筛选
- 卡片可折叠/展开
- 同一视频重复保存直接覆盖，保留原标签
- 点击生词跳到生词本对应卡片

### 📤 导出
- 一键复制 Markdown 到剪贴板
- 三种范围：当前 / 标签 / 全部
- 可直接粘贴到飞书、Notion、Obsidian
- 可选是否包含完整字幕

---
## ⌨️ 键盘映射（EasyInput）

| 硬件 | 发送按键 | 插件行为 |
| :--- | :--- | :--- |
| KEY1 | 语音输入 | （保留） |
| KEY2 | 语音编辑 | （保留） |
| KEY3 | Enter | 确认 / 跳转 / AI 解释 |
| KEY4 | Tab | 切换视图 |
| KEY5 | Esc | 返回 / 收起 |
| KEY6 | Space | 标记生词 / 跳转 + 朗读 |
| KEY7 | P | 播放 / 暂停视频 |
| KEY8 | S | 保存到知识库 |
| 旋钮旋转 | ↑ ↓ | 上下移动 / 滚动 |
| 旋钮短按 | 切换方向 | 上下 ↔ 左右 |
| 左右模式 | ← → | 生词本：切换筛选 |

---
## 🛠️ 安装（开发者模式）

1. 下载或克隆本仓库：`git clone https://github.com/sil1021yan-ai/youtube-learning-helper.git`
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 打开右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本仓库所在的文件夹
6. 打开 YouTube 视频页 → 点扩展图标 → 侧边栏打开

---

## 🚀 首次使用

1. 打开扩展侧边栏 → 点右上角 ⚙️ API
2. 填入 DeepSeek API Key（申请地址：https://platform.deepseek.com/）
3. 打开任意 YouTube 视频，字幕自动加载

---

## 🧱 技术栈

- Chrome Extension Manifest V3
- 无构建工具，纯原生 JS / HTML / CSS
- 数据存储：chrome.storage.local
- AI：DeepSeek API（OpenAI 兼容格式）
- 翻译：Google Translate 免费接口
- 发音：浏览器原生 speechSynthesis

---

## 📁 文件结构

```n
youtube-learning-extension/
├── manifest.json
├── background.js
├── content.js
├── page_script.js
├── popup.html
└── popup.js
```

---

## ⚠️ 已知限制

- 视频必须有 CC 字幕（英文优先）
- DeepSeek API Key 由用户自己填写，扩展不内置
- 仅支持 Chrome / Edge（Chromium 内核）

---

## 📌 更新日志

### v1.0（2026-09-20）
- 首次发布
- 字幕抓取、生词本、AI 整理、知识库、导出、键盘适配

---

## 📄 License

个人使用，未指定开源协议。
