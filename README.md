
## ⌨️ 键盘映射（EasyInput）

### 通用操作

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
| 左右模式 | ← → | 单词本：切换筛选 |

### 复习模式

| 按键 | 行为 |
| :--- | :--- |
| Space | 翻转卡片 |
| Enter | 已掌握 → 下一张 |
| ← | 再看一遍（塞回队尾） |
| → | 跳过 |
| Esc | 退出复习 |

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

> ⚠️ API Key 保存在浏览器本地（chrome.storage.local），不会上传到任何服务器。

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

### v1.3（2026-09-21）
- 「生词」重命名为「单词本」
- 已掌握分组默认折叠，键盘默认跳过
- 知识库卡片「生词」改为「单词集」
- 复习模式：Space 翻转时自动朗读

### v1.2（2026-09-20）
- Notion 风格 UI 重构：颜色、间距、圆角统一
- Emoji 全面替换为 SVG 图标
- 状态栏彩色圆点（成功 / 警告 / 错误 / 加载中 / 普通）
- 侧边栏自适应布局

### v1.1（2026-09-20）
- 复习模式：闪卡翻转、已掌握、再看一遍、跳过
- 统计视图：打卡、进度条、7 天图表、Top 5
- 打卡系统：标记单词 / AI 整理 / 复习都算打卡
- 已掌握标记 + 进度条

### v1.0（2026-09-20）
- 首次发布
- 字幕抓取、单词本、AI 整理、知识库、导出、键盘适配

---

## 📄 License

个人使用，未指定开源协议。
