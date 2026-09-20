const state = {
  view: 'subtitles', lines: [], savedWords: {}, videoId: null, aiResult: null,
  knowledgeBase: {}, aiResults: {}, tagFilter: 'ALL', expandedIds: {}, highlightWord: null,
  selectedIndex: 0, focusMode: 'line', selectedWordIndex: 0, wordFilter: 'current', checkInDates: [], reviewMode: false, reviewCards: [], reviewIndex: 0, reviewFlipped: false, reviewInitialCount: 0, reviewStats: { mastered: 0, again: 0, skipped: 0 },
  aiResultSource: null
};
const tooltip = document.getElementById('tooltip');
const contentEl = document.getElementById('content');
const statusEl = document.getElementById('status');
const apiKeyInput = document.getElementById('apiKey');
const kbFilterEl = document.getElementById('kb-filter');
const saveDialogEl = document.getElementById('save-dialog');
let hoverTimer = null;
const translationCache = {};

async function loadStorage() {
  const data = await chrome.storage.local.get(['savedWords', 'apiKey', 'knowledgeBase', 'aiResults', 'checkInDates']);
  state.savedWords = data.savedWords || {};
  state.knowledgeBase = data.knowledgeBase || {};
  state.aiResults = data.aiResults || {};
  state.checkInDates = data.checkInDates || [];
  if (data.apiKey) apiKeyInput.value = data.apiKey;
}
async function saveSavedWords() { await chrome.storage.local.set({ savedWords: state.savedWords }); }
async function saveKnowledgeBase() { await chrome.storage.local.set({ knowledgeBase: state.knowledgeBase }); }
async function saveAiResults() { await chrome.storage.local.set({ aiResults: state.aiResults }); }

async function saveCheckInDates() { await chrome.storage.local.set({ checkInDates: state.checkInDates }); }

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function markToday() {
  const today = formatDate(new Date());
  if (state.checkInDates.includes(today)) return;
  state.checkInDates.push(today);
  // 只保留最近 365 天
  const cutoff = formatDate(getDateNDaysAgo(365));
  state.checkInDates = state.checkInDates.filter(d => d >= cutoff);
  await saveCheckInDates();
}

function calcStreak() {
  const dates = state.checkInDates;
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = formatDate(getDateNDaysAgo(i));
    if (dates.includes(d)) streak++;
    else {
      // 如果今天没打卡但昨天打了，仍然算连续
      if (i === 0) continue;
      break;
    }
  }
  return streak;
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function normalizeWord(w) { return w.toLowerCase().replace(/[^a-z'-]/g, ''); }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function parseTags(input) { return input.split(/[,，]/).map(s => s.trim()).filter(Boolean); }
function getWordsForVideo(videoId) { return Object.values(state.savedWords).filter(w => w.videoId === videoId); }

async function getVideoId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  try { return new URL(tab.url).searchParams.get('v'); } catch (_) { return null; }
}

async function translateWord(word) {
  const key = word.toLowerCase();
  if (translationCache[key] !== undefined && translationCache[key] !== '...') return translationCache[key];
  translationCache[key] = '...';
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(word);
    const res = await fetch(url);
    const data = await res.json();
    let translated = '';
    if (data && data[0]) for (const part of data[0]) if (part[0]) translated += part[0];
    translationCache[key] = (!translated || translated.toLowerCase() === word.toLowerCase()) ? '（未找到）' : translated;
  } catch (e) { translationCache[key] = '（翻译失败）'; }
  return translationCache[key];
}
function showTooltip(text, x, y) {
  tooltip.textContent = text; tooltip.style.display = 'block';
  const rect = tooltip.getBoundingClientRect();
  tooltip.style.left = Math.min(x + 12, window.innerWidth - rect.width - 8) + 'px';
  tooltip.style.top = Math.min(y + 12, window.innerHeight - rect.height - 8) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

function showTooltipForElement(text, el) {
  if (!el) return;
  tooltip.textContent = text;
  tooltip.style.display = 'block';
  const rect = el.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  let top;
  if (rect.bottom + tipRect.height + 8 < window.innerHeight) {
    top = rect.bottom + 8;
  } else {
    top = rect.top - tipRect.height - 8;
  }
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function speakWord(word) {
  if (!word) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
    statusEl.textContent = '🔊 正在朗读：' + word;
  } catch (e) {
    console.error('TTS error:', e);
    statusEl.textContent = '❌ 朗读失败';
  }
}

async function toggleWordSaved(key, original, line) {
  if (state.savedWords[key]) {
    delete state.savedWords[key];
  } else {
    state.savedWords[key] = {
      word: key, original: original, sentence: line.text, startMs: line.start,
      videoId: state.videoId, addedAt: Date.now(), aiInfo: null, googleZh: null
    };
  }
  state.aiResult = null;
  await saveSavedWords();
  await markToday();
}

function buildWordSpans(text, line, lineIndex) {
  const frag = document.createDocumentFragment();
  const tokens = text.split(/(\b[A-Za-z][A-Za-z'-]*\b)/);
  let wordIdx = 0;
  tokens.forEach(tok => {
    if (/^[A-Za-z][A-Za-z'-]*$/.test(tok) && tok.length > 1) {
      const span = document.createElement('span');
      const key = normalizeWord(tok);
      span.className = 'word' + (state.savedWords[key] ? ' saved' : '');
      span.textContent = tok;
      span.dataset.lineIndex = lineIndex;
      span.dataset.wordIndex = wordIdx;
      wordIdx++;
      span.addEventListener('mouseenter', (e) => {
        const x = e.clientX, y = e.clientY;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(async () => {
          const cached = translationCache[tok.toLowerCase()];
          if (cached && cached !== '...') showTooltip(tok + '：' + cached, x, y);
          else { showTooltip(tok + '：翻译中…', x, y); const r = await translateWord(tok); showTooltip(tok + '：' + r, x, y); }
        }, 180);
      });
      span.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); hideTooltip(); });
      span.addEventListener('mousemove', (e) => {
        if (tooltip.style.display === 'block') {
          const rect = tooltip.getBoundingClientRect();
          tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - rect.width - 8) + 'px';
          tooltip.style.top = Math.min(e.clientY + 12, window.innerHeight - rect.height - 8) + 'px';
        }
      });
      span.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleWordSaved(key, tok, line);
        renderSubtitles();
      });
      frag.appendChild(span);
    } else frag.appendChild(document.createTextNode(tok));
  });
  return frag;
}

function scrollToCenter(target) {
  if (!target) return;
  const containerRect = contentEl.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetCenterInContent = contentEl.scrollTop + (targetRect.top - containerRect.top) + targetRect.height / 2;
  const newTop = targetCenterInContent - contentEl.clientHeight / 2;
  contentEl.scrollTo({ top: newTop, behavior: 'smooth' });
}

function renderSubtitles() {
  contentEl.innerHTML = '';
  if (state.lines.length === 0) { contentEl.innerHTML = '<div class="ai-block">还没有字幕数据，点 📺 字幕 获取。</div>'; return; }
  state.lines.forEach((line, idx) => {
    const btn = document.createElement('button');
    btn.className = 'item' + (idx === state.selectedIndex ? ' selected' : '');
    btn.dataset.lineIndex = idx;
    const time = document.createElement('span'); time.className = 'time'; time.textContent = formatTime(line.start);
    btn.appendChild(time);
    btn.appendChild(buildWordSpans(line.text, line, idx));
    btn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: line.start });
      });
    });
    contentEl.appendChild(btn);
  });
  applyWordFocus();
}

let wordTooltipTimer = null;
function applyWordFocus() {
  contentEl.querySelectorAll('.word').forEach(el => {
    el.classList.remove('focused');
    el.style.fontWeight = '';
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.borderRadius = '';
  });
  if (state.focusMode !== 'word') {
    if (wordTooltipTimer) { clearTimeout(wordTooltipTimer); wordTooltipTimer = null; }
    hideTooltip();
    return;
  }
  const btn = contentEl.querySelector('.item[data-line-index="' + state.selectedIndex + '"]');
  if (!btn) return;
  const words = btn.querySelectorAll('.word');
  const target = words[state.selectedWordIndex];
  if (target) {
    target.classList.add('focused');
    target.style.fontWeight = '700';
    target.style.outline = '2px solid #0066cc';
    target.style.outlineOffset = '1px';
    target.style.borderRadius = '3px';

    // 延迟 300ms 显示翻译气泡（跟随选中词）
    const wordText = target.textContent;
    if (wordTooltipTimer) clearTimeout(wordTooltipTimer);
    hideTooltip();
    wordTooltipTimer = setTimeout(async () => {
      const cached = translationCache[wordText.toLowerCase()];
      if (cached && cached !== '...') {
        showTooltipForElement(wordText + '：' + cached, target);
      } else {
        showTooltipForElement(wordText + '：翻译中…', target);
        const r = await translateWord(wordText);
        // 再次确认焦点还在同一个词上
        if (target.classList.contains('focused')) {
          showTooltipForElement(wordText + '：' + r, target);
        }
      }
    }, 300);
  }
}
function getFilteredWords() {
  const all = Object.values(state.savedWords).sort((a, b) => b.addedAt - a.addedAt);
  if (state.wordFilter === 'current') {
    return all.filter(w => w.videoId === state.videoId);
  }
  return all;
}

function renderWordFilter() {
  const el = document.getElementById('word-filter');
  if (!el) return;
  el.innerHTML = '';
  if (state.view !== 'words') { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  const allWords = Object.values(state.savedWords);
  const currentCount = allWords.filter(w => w.videoId === state.videoId).length;
  const totalCount = allWords.length;

  const makeChip = (label, value) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (state.wordFilter === value ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => {
      state.wordFilter = value;
      state.selectedIndex = 0;
      renderWordsAsync();
    });
    return chip;
  };

  el.appendChild(makeChip('当前视频 (' + currentCount + ')', 'current'));
  el.appendChild(makeChip('全部 (' + totalCount + ')', 'all'));

  // 右上角：已掌握 / 总数
  const masteredCount = allWords.filter(w => w.mastered).length;
  const hint = document.createElement('span');
  hint.className = 'word-filter-hint';
  hint.style.marginLeft = 'auto';
  hint.textContent = '已掌握 ' + masteredCount + ' / ' + totalCount;
  el.appendChild(hint);
}

function updateWordSelectionOnly() {
  const cards = contentEl.querySelectorAll('.wordcard');
  cards.forEach((card, i) => {
    if (i === state.selectedIndex) card.classList.add('selected');
    else card.classList.remove('selected');
  });
  scrollToCenter(cards[state.selectedIndex]);
}

async function renderWordsAsync() {
  contentEl.innerHTML = '';
  const words = getFilteredWords();
  if (state.selectedIndex >= words.length) state.selectedIndex = Math.max(0, words.length - 1);
  renderWordFilter();

  if (words.length === 0) {
    const msg = state.wordFilter === 'current'
      ? '当前视频还没有标记生词。在 📺 字幕 里点击单词加入，或切到「全部」查看历史。'
      : '生词本是空的。在 📺 字幕 里点击单词即可加入。';
    contentEl.innerHTML = '<div class="ai-block">' + msg + '</div>';
    return;
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const div = document.createElement('div');
    div.className = 'wordcard' + (i === state.selectedIndex ? ' selected' : '') + (w.mastered ? ' mastered' : '');
    div.dataset.word = w.word;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.textContent = '移除';
    removeBtn.addEventListener('click', async () => {
      delete state.savedWords[w.word];
      await saveSavedWords(); renderWordsAsync(); updateStatus();
    });

    // 未掌握的词：hover 时显示"✓ 已掌握"按钮
    if (!w.mastered) {
      const markBtn = document.createElement('button');
      markBtn.className = 'mark-master-btn';
      markBtn.textContent = '✓ 已掌握';
      markBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        w.mastered = true;
        await saveSavedWords();
        renderWordsAsync();
        updateStatus();
      });
      div.appendChild(markBtn);
    }

    // 只有已掌握的词才显示"取消掌握"按钮
    if (w.mastered) {
      const masterBtn = document.createElement('button');
      masterBtn.className = 'mini-btn unmaster';
      masterBtn.style.marginLeft = '6px';
      masterBtn.style.marginTop = '0';
      masterBtn.style.fontSize = '10px';
      masterBtn.textContent = '↺ 取消掌握';
      masterBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        w.mastered = false;
        await saveSavedWords();
        renderWordsAsync();
        updateStatus();
      });
      div.appendChild(masterBtn);
    }

    const h = document.createElement('h4');
    h.textContent = w.original || w.word;
    const speakBtn = document.createElement('button');
    speakBtn.className = 'mini-btn';
    speakBtn.style.marginLeft = '6px';
    speakBtn.style.marginTop = '0';
    speakBtn.textContent = '🔊';
    speakBtn.title = '朗读单词';
    speakBtn.addEventListener('click', (e) => { e.stopPropagation(); speakWord(w.original || w.word); });
    h.appendChild(speakBtn);

    div.appendChild(removeBtn);
    div.appendChild(h);

    const cn = document.createElement('div'); cn.className = 'cn';
    cn.textContent = '中文：加载中…';
    div.appendChild(cn);
    (async () => {
      const t = await translateWord(w.original || w.word);
      cn.textContent = '中文：' + t;
      if (state.savedWords[w.word] && !state.savedWords[w.word].googleZh) {
        state.savedWords[w.word].googleZh = t;
        await saveSavedWords();
      }
    })();

    const ctx = document.createElement('div'); ctx.className = 'ctx';
    ctx.textContent = '📍 ' + formatTime(w.startMs) + '  "' + (w.sentence || '').slice(0, 70) + '..."';
    ctx.title = '点击跳转到视频对应位置';
    ctx.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: w.startMs });
      });
    });
    div.appendChild(ctx);

    if (w.videoId) {
      const linkRow = document.createElement('div');
      linkRow.className = 'video-link-row';
      const a = document.createElement('a');
      a.className = 'video-link';
      a.href = 'https://www.youtube.com/watch?v=' + w.videoId;
      a.target = '_blank';
      a.textContent = '🔗 打开视频';
      linkRow.appendChild(a);
      div.appendChild(linkRow);
    }

    const aiArea = document.createElement('div'); aiArea.className = 'ai-area';
    div.appendChild(aiArea);

    const renderAIInfo = () => {
      aiArea.innerHTML = '';
      if (w.aiInfo) {
        if (w.aiInfo.phonetic || w.aiInfo.pos) {
          const p = document.createElement('div'); p.className = 'ai';
          p.textContent = [w.aiInfo.phonetic, w.aiInfo.pos].filter(Boolean).join('  ');
          aiArea.appendChild(p);
        }
        if (w.aiInfo.definition) { const d = document.createElement('div'); d.className = 'ai'; d.textContent = '释义：' + w.aiInfo.definition; aiArea.appendChild(d); }
        if (w.aiInfo.example) { const ex = document.createElement('div'); ex.className = 'ai'; ex.textContent = '例句：' + w.aiInfo.example; aiArea.appendChild(ex); }
        const redo = document.createElement('button'); redo.className = 'mini-btn'; redo.textContent = '🔄 重新解释';
        redo.addEventListener('click', () => explainOne(w, renderAIInfo));
        aiArea.appendChild(redo);
      } else {
        const btn = document.createElement('button'); btn.className = 'mini-btn primary'; btn.textContent = '🤖 AI 解释';
        btn.addEventListener('click', () => explainOne(w, renderAIInfo));
        aiArea.appendChild(btn);
      }
    };
    renderAIInfo();
    contentEl.appendChild(div);
  }

  if (state.highlightWord) {
    const target = contentEl.querySelector('.wordcard[data-word="' + state.highlightWord + '"]');
    if (target) {
      setTimeout(() => {
        scrollToCenter(target);
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1600);
      }, 60);
    }
    state.highlightWord = null;
  }
}

async function explainOne(w, refresh) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) { statusEl.textContent = '请先在右上角 ⚙️ API 填入 DeepSeek API Key'; return; }
  statusEl.textContent = '🤖 正在解释 "' + (w.original || w.word) + '"…';
  try {
    const prompt = '你是一位英语词典助手。请对英文单词 "' + (w.original || w.word) + '" 给出信息。\n' +
      '它出现在这个句子里：' + (w.sentence || '(无上下文)') + '\n\n' +
      '请以纯 JSON 返回（不要 markdown 代码块，不要其他文字）：\n' +
      '{ "phonetic": "IPA 音标", "pos": "词性缩写如 n./v./adj./adv.", "definition": "在该句中的中文释义", "example": "一个简单的英文例句" }';
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || JSON.stringify(data));
    const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const parsed = tryParseJson(raw);
    if (!parsed) throw new Error('AI 返回不是有效 JSON');
    w.aiInfo = { phonetic: parsed.phonetic || '', pos: parsed.pos || '', definition: parsed.definition || '', example: parsed.example || '' };
    await saveSavedWords();
    refresh();
    statusEl.textContent = '✅ 已解释 "' + (w.original || w.word) + '"';
  } catch (e) {
    console.error(e);
    statusEl.textContent = '❌ 解释失败：' + e.message;
  }
}
function tryParseJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {} }
  return null;
}

function renderAIResult(result) {
  contentEl.innerHTML = '';
  saveDialogEl.innerHTML = '';
  const div = document.createElement('div'); div.className = 'ai-block';
  const sourceBadge = state.aiResultSource === 'api'
    ? '<span class="source-badge api">🌐 API 调用</span>'
    : '<span class="source-badge cache">📦 缓存</span>';
  let html = '<h4>📝 视频摘要 ' + sourceBadge + '</h4>';
  html += escapeHtml(result.summary || '（无摘要）').replace(/\n/g, '<br>');
  html += '<h4>💡 核心知识点</h4>';
  if (result.takeaways && result.takeaways.length) {
    html += '<ul style="margin:4px 0;padding-left:18px;">';
    for (const t of result.takeaways) html += '<li>' + escapeHtml(t) + '</li>';
    html += '</ul>';
  } else html += '<div>（无知识点）</div>';
  html += '<div style="margin-top:10px;text-align:right;"><button id="saveKB" class="mini-btn primary">💾 保存到知识库 (S)</button></div>';
  div.innerHTML = html;
  contentEl.appendChild(div);
  const saveBtn = div.querySelector('#saveKB');
  if (saveBtn) saveBtn.addEventListener('click', showSaveDialog);
}

function showSaveDialog() {
  const videoId = state.videoId;
  const existing = state.knowledgeBase[videoId];
  if (existing) {
    const oldTags = (existing.tags || []).join(', ');
    doSaveToKB(oldTags);
    statusEl.textContent = '✅ 已更新知识库（保留原标签：' + (oldTags || '无') + '）';
    return;
  }
  saveDialogEl.innerHTML = '';
  const dlg = document.createElement('div'); dlg.className = 'dlg';
  const label = document.createElement('div');
  label.style.fontSize = '11px'; label.style.color = '#333'; label.style.marginBottom = '4px';
  label.textContent = '为这条记录添加标签（可选，用逗号分隔多个）：';
  dlg.appendChild(label);
  const input = document.createElement('input');
  input.type = 'text'; input.placeholder = '例如：AI, 编程, 教程'; input.value = '';
  dlg.appendChild(input);
  const btnrow = document.createElement('div'); btnrow.className = 'btnrow';
  const confirmBtn = document.createElement('button'); confirmBtn.className = 'mini-btn primary';
  confirmBtn.textContent = '保存';
  confirmBtn.addEventListener('click', () => doSaveToKB(input.value));
  btnrow.appendChild(confirmBtn);
  const cancelBtn = document.createElement('button'); cancelBtn.className = 'mini-btn'; cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => { saveDialogEl.innerHTML = ''; });
  btnrow.appendChild(cancelBtn);
  dlg.appendChild(btnrow);
  saveDialogEl.appendChild(dlg);
  input.focus();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSaveToKB(input.value);
    if (e.key === 'Escape') saveDialogEl.innerHTML = '';
    e.stopPropagation();
  });
}

async function doSaveToKB(tagInput) {
  const videoId = state.videoId;
  if (!videoId) { statusEl.textContent = '请先获取字幕'; return; }
  if (!state.aiResult) { statusEl.textContent = '请先生成 AI 整理结果'; return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const existing = state.knowledgeBase[videoId];
  const tags = parseTags(tagInput || '');
  state.knowledgeBase[videoId] = {
    videoId, title: (tab && tab.title) || 'Untitled', url: (tab && tab.url) || '',
    summary: state.aiResult.summary || '', takeaways: state.aiResult.takeaways || [],
    tags, savedAt: existing ? existing.savedAt : Date.now(), updatedAt: Date.now(),
    transcript: state.lines.length > 0 ? state.lines.map(l => ({ start: l.start, text: l.text })) : (existing && existing.transcript) || []
  };
  await saveKnowledgeBase();
  saveDialogEl.innerHTML = '';
  statusEl.textContent = existing ? '✅ 知识库记录已更新' : '✅ 已保存到知识库';
}

async function callAI(force) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) { statusEl.textContent = '请先在右上角 ⚙️ API 填入 DeepSeek API Key'; return; }
  await chrome.storage.local.set({ apiKey });
  const videoId = state.videoId;
  if (!videoId) { statusEl.textContent = '请先获取字幕'; return; }

  if (!force) {
    if (state.aiResult) { setView('ai'); statusEl.textContent = '✅ 显示已生成的整理结果（Shift+Enter 重新生成）'; return; }
    if (state.aiResults[videoId]) {
      state.aiResult = state.aiResults[videoId];
      state.aiResultSource = 'cache';
      setView('ai');
      statusEl.textContent = '✅ 已加载缓存的整理结果（Shift+Enter 重新生成）';
      return;
    }
  }
  if (state.lines.length === 0) { statusEl.textContent = '请先点 📺 字幕 获取字幕'; return; }
  const transcript = state.lines.map(l => l.text).join(' ').slice(0, 12000);
  const prompt = '你是一位英语学习助手。请分析下面的 YouTube 英文字幕，以纯 JSON 格式返回（不要 markdown 代码块包裹）：\n\n' +
    '{\n  "summary": "中文 3-5 句话总结核心内容，最后一行加「❓ 核心问题：...」",\n  "takeaways": ["中文知识点1", "中文知识点2", "..."]\n}\n\n' +
    '要求：takeaways 给 3-6 条。只返回 JSON，不要其他文字。\n\n完整字幕：\n' + transcript;
  statusEl.textContent = '🤖 AI 正在思考，请稍候…';
  state.view = 'ai';
  document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
  document.getElementById('btnAI').classList.add('active');
  kbFilterEl.style.display = 'none';
  const wfHide = document.getElementById('word-filter');
  if (wfHide) wfHide.style.display = 'none';
  saveDialogEl.innerHTML = '';
  contentEl.innerHTML = '<div class="ai-block">AI 正在思考，请稍候…（约 10-20 秒）</div>';
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || JSON.stringify(data));
    const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const parsed = tryParseJson(raw);
    if (!parsed) { contentEl.innerHTML = '<div class="ai-block">⚠️ AI 返回非 JSON：<br>' + escapeHtml(raw) + '</div>'; statusEl.textContent = '⚠️ 返回格式异常'; return; }
    state.aiResult = parsed;
    state.aiResultSource = 'api';
    state.aiResults[videoId] = parsed;
    await saveAiResults();
    await markToday();
    renderAIResult(parsed);
    statusEl.textContent = '✅ 摘要和知识点已生成（已缓存）';
  } catch (e) {
    console.error('AI error', e);
    contentEl.innerHTML = '<div class="ai-block">❌ AI 调用失败：' + escapeHtml(e.message) + '</div>';
    statusEl.textContent = '❌ AI 调用失败';
  }
}

function collectAllTags() {
  const set = new Set();
  Object.values(state.knowledgeBase).forEach(e => { if (Array.isArray(e.tags)) e.tags.forEach(t => set.add(t)); });
  return Array.from(set).sort();
}

function renderKbFilter() {
  kbFilterEl.innerHTML = '';
  const tags = collectAllTags();
  if (tags.length === 0) { kbFilterEl.style.display = 'none'; return; }
  kbFilterEl.style.display = 'flex';
  const makeChip = (label, value) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (state.tagFilter === value ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => { state.tagFilter = value; state.selectedIndex = 0; renderKnowledgeBase(); });
    return chip;
  };
  kbFilterEl.appendChild(makeChip('全部', 'ALL'));
  tags.forEach(t => kbFilterEl.appendChild(makeChip(t, t)));
}

function jumpToWordCard(word) {
  const key = normalizeWord(word);
  state.highlightWord = key;
  state.selectedIndex = 0;
  state.wordFilter = 'all';
  setView('words');
}

function buildKbCard(entry, idx) {
  const expanded = !!state.expandedIds[entry.videoId];
  const card = document.createElement('div');
  card.className = 'kb-card' + (idx === state.selectedIndex ? ' selected' : '');
  const videoWords = getWordsForVideo(entry.videoId);
  const title = document.createElement('div');
  title.className = 'kb-title';
  title.style.cursor = 'pointer';
  const arrow = document.createElement('span'); arrow.className = 'kb-arrow'; arrow.textContent = expanded ? '▼' : '▶';
  title.appendChild(arrow);
  const titleText = document.createElement('span');
  titleText.textContent = entry.title.length > 38 ? entry.title.slice(0, 38) + '…' : entry.title;
  titleText.title = entry.title;
  title.appendChild(titleText);
  const delBtn = document.createElement('button'); delBtn.className = 'mini-btn'; delBtn.textContent = '🗑️'; delBtn.style.marginTop = '0';
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条知识库记录吗？')) return;
    delete state.knowledgeBase[entry.videoId];
    delete state.expandedIds[entry.videoId];
    await saveKnowledgeBase();
    renderKnowledgeBase(); updateStatus();
  });
  title.appendChild(delBtn);
  title.addEventListener('click', () => { state.expandedIds[entry.videoId] = !expanded; renderKnowledgeBase(); });
  card.appendChild(title);
  if (entry.tags && entry.tags.length) {
    const tagsDiv = document.createElement('div'); tagsDiv.className = 'kb-tags';
    entry.tags.forEach(t => { const span = document.createElement('span'); span.className = 'kb-tag'; span.textContent = '#' + t; tagsDiv.appendChild(span); });
    card.appendChild(tagsDiv);
  }
  if (!expanded) {
    const previewText = (entry.summary || '').replace(/\n/g, ' ').trim();
    const preview = previewText.length > 60 ? previewText.slice(0, 60) + '…' : previewText;
    const sumPreview = document.createElement('div'); sumPreview.className = 'kb-section'; sumPreview.style.color = '#666';
    sumPreview.textContent = '📝 ' + (preview || '（无摘要）');
    card.appendChild(sumPreview);
    const stats = document.createElement('div'); stats.className = 'kb-section'; stats.style.color = '#888';
    const tkCount = (entry.takeaways && entry.takeaways.length) || 0;
    stats.textContent = '💡 ' + tkCount + ' 个知识点   📖 ' + videoWords.length + ' 个生词';
    card.appendChild(stats);
    const foot = document.createElement('div'); foot.className = 'kb-foot';
    const link = document.createElement('a'); link.href = entry.url; link.target = '_blank'; link.textContent = '🔗 打开视频';
    link.addEventListener('click', (e) => e.stopPropagation());
    foot.appendChild(link);
    const date = document.createElement('span'); date.textContent = new Date(entry.updatedAt).toLocaleString('zh-CN');
    foot.appendChild(date);
    card.appendChild(foot);
  } else {
    const sum = document.createElement('div'); sum.className = 'kb-section';
    sum.innerHTML = '<b>📝 摘要</b><br>' + escapeHtml(entry.summary).replace(/\n/g, '<br>');
    card.appendChild(sum);
    if (entry.takeaways && entry.takeaways.length) {
      const tk = document.createElement('div'); tk.className = 'kb-section';
      let tkHtml = '<b>💡 核心知识点</b><ul style="margin:4px 0;padding-left:18px;">';
      for (const t of entry.takeaways) tkHtml += '<li>' + escapeHtml(t) + '</li>';
      tkHtml += '</ul>'; tk.innerHTML = tkHtml; card.appendChild(tk);
    }
    const wd = document.createElement('div'); wd.className = 'kb-section';
    wd.innerHTML = '<b>📖 生词 (' + videoWords.length + ')</b><div style="margin-top:4px;"></div>';
    card.appendChild(wd);
    const wordContainer = wd.querySelector('div');
    if (videoWords.length === 0) {
      const empty = document.createElement('div'); empty.style.fontSize = '11px'; empty.style.color = '#999';
      empty.textContent = '这个视频还没有标记生词。';
      wordContainer.appendChild(empty);
    } else {
      videoWords.forEach(w => {
        const span = document.createElement('span');
        span.className = 'kb-word'; span.style.cursor = 'pointer';
        span.textContent = (w.original || w.word) + ' / 加载中…';
        span.title = '点击跳到生词本查看详情';
        span.addEventListener('click', (e) => { e.stopPropagation(); jumpToWordCard(w.word); });
        wordContainer.appendChild(span);
        (async () => { const t = await translateWord(w.original || w.word); span.textContent = (w.original || w.word) + ' / ' + t; })();
      });
    }
    const foot = document.createElement('div'); foot.className = 'kb-foot';
    const link = document.createElement('a'); link.href = entry.url; link.target = '_blank'; link.textContent = '🔗 打开视频';
    foot.appendChild(link);
    const date = document.createElement('span'); date.textContent = new Date(entry.updatedAt).toLocaleString('zh-CN');
    foot.appendChild(date);
    card.appendChild(foot);
  }
  return card;
}

function renderKnowledgeBase() {
  contentEl.innerHTML = '';
  saveDialogEl.innerHTML = '';
  const allEntries = Object.values(state.knowledgeBase).sort((a, b) => b.updatedAt - a.updatedAt);
  if (allEntries.length === 0) {
    kbFilterEl.style.display = 'none';
    contentEl.innerHTML = '<div class="ai-block">知识库是空的。先在 🤖 整理 视图生成结果，再按 S 保存。</div>';
    return;
  }
  renderKbFilter();
  const entries = state.tagFilter === 'ALL' ? allEntries : allEntries.filter(e => Array.isArray(e.tags) && e.tags.includes(state.tagFilter));
  if (entries.length === 0) { contentEl.innerHTML = '<div class="ai-block">没有带该标签的记录。</div>'; return; }
  if (state.selectedIndex >= entries.length) state.selectedIndex = 0;
  entries.forEach((entry, idx) => contentEl.appendChild(buildKbCard(entry, idx)));
}

// ============ 导出功能 ============
function generateVideoMarkdown(entry, includeTranscript) {
  const lines = [];
  lines.push('# ' + (entry.title || 'Untitled'));
  lines.push('');
  lines.push('- 🔗 ' + (entry.url || ''));
  if (entry.tags && entry.tags.length) lines.push('- 🏷️ ' + entry.tags.map(t => '#' + t).join(' '));
  if (entry.updatedAt) lines.push('- 📅 ' + new Date(entry.updatedAt).toLocaleString('zh-CN'));
  lines.push('');
  lines.push('## 📝 视频摘要');
  lines.push('');
  lines.push(entry.summary || '（无摘要）');
  lines.push('');
  if (entry.takeaways && entry.takeaways.length) {
    lines.push('## 💡 核心知识点');
    lines.push('');
    entry.takeaways.forEach((t, i) => { lines.push((i + 1) + '. ' + t); });
    lines.push('');
  }
  const words = getWordsForVideo(entry.videoId);
  if (words.length) {
    lines.push('## 📖 生词本 (' + words.length + ')');
    lines.push('');
    lines.push('| 单词 | 音标 | 词性 | 释义 | 例句 |');
    lines.push('|------|------|------|------|------|');
    words.forEach(w => {
      const info = w.aiInfo || {};
      const definition = info.definition || w.googleZh || '';
      const row = [w.original || w.word, info.phonetic || '', info.pos || '', definition, info.example || ''];
      const safe = row.map(v => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '));
      lines.push('| ' + safe.join(' | ') + ' |');
    });
    lines.push('');
  }
  if (includeTranscript && entry.transcript && entry.transcript.length > 0) {
    lines.push('## 📺 完整字幕');
    lines.push('');
    entry.transcript.forEach(line => { lines.push('[' + formatTime(line.start) + '] ' + line.text); });
    lines.push('');
  }
  return lines.join('\n');
}

function generateMultiMarkdown(entries, includeTranscript, headerTitle) {
  const lines = [];
  lines.push('# ' + headerTitle);
  lines.push('');
  lines.push('> 导出时间：' + new Date().toLocaleString('zh-CN'));
  lines.push('> 共 ' + entries.length + ' 个视频');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 目录');
  entries.forEach((e, i) => { lines.push((i + 1) + '. ' + (e.title || 'Untitled')); });
  lines.push('');
  lines.push('---');
  lines.push('');
  entries.forEach((e, i) => {
    lines.push('## ' + (i + 1) + '. ' + (e.title || 'Untitled'));
    lines.push('');
    const single = generateVideoMarkdown(e, includeTranscript);
    const withoutTitle = single.replace(/^# [^\n]*\n/, '');
    lines.push(withoutTitle.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  return lines.join('\n');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) { return false; }
  }
}
function renderStats() {
  contentEl.innerHTML = '';
  saveDialogEl.innerHTML = '';
  kbFilterEl.style.display = 'none';
  const wfHide = document.getElementById('word-filter');
  if (wfHide) wfHide.style.display = 'none';

  const allWords = Object.values(state.savedWords);
  const totalWords = allWords.length;
  const streak = calcStreak();
  const today = formatDate(new Date());
  const checkedToday = state.checkInDates.includes(today);

  const wrapper = document.createElement('div');
  let html = '';

  // 第一排：连续打卡 + 数据概览（左右并排）
  html += '<div class="stat-row">';

  // 左：连续打卡
  html += '<div class="stat-card">';
  html += '<h4>🔥 连续打卡</h4>';
  html += '<div class="streak-row"><span class="num">' + streak + '</span><span class="unit">天</span></div>';
  html += checkedToday
    ? '<div style="font-size:11px;color:#4caf50;margin-top:4px;">✅ 今天已打卡</div>'
    : '<div style="font-size:11px;color:#f57c00;margin-top:4px;">⚠️ 今天还没打卡</div>';
  html += '</div>';

  // 右：数据概览（含进度条）
  const masteredCount = allWords.filter(w => w.mastered).length;
  const masterPct = totalWords === 0 ? 0 : Math.round((masteredCount / totalWords) * 100);
  html += '<div class="stat-card">';
  html += '<h4>📈 数据概览</h4>';
  html += '<div><span class="stat-big">' + totalWords + '</span><span class="stat-label">生词</span></div>';
  if (totalWords > 0) {
    html += '<div class="master-progress"><div class="master-fill" style="width:' + masterPct + '%"></div></div>';
    html += '<div class="master-text"><span class="green">已掌握 ' + masteredCount + '</span><span>' + masterPct + '%</span></div>';
  }
  html += '<div style="font-size:11px;color:#666;margin-top:4px;">' + Object.keys(state.knowledgeBase).length + ' 个视频</div>';
  html += '</div>';

  html += '</div>'; // end stat-row

  // 最近 7 天新增（从新到旧）
  const last7 = [];
  for (let i = 0; i <= 6; i++) {
    const d = getDateNDaysAgo(i);
    const dateStr = formatDate(d);
    const count = allWords.filter(w => w.addedAt && formatDate(new Date(w.addedAt)) === dateStr).length;
    last7.push({ date: dateStr, count: count });
  }
  const maxCount = Math.max(1, ...last7.map(x => x.count));
  html += '<div class="stat-card">';
  html += '<h4>📅 最近 7 天新增</h4>';
  last7.forEach(item => {
    const displayDate = item.date.slice(5);
    const pct = (item.count / maxCount) * 100;
    html += '<div class="bar-row">';
    html += '<span class="bar-date">' + displayDate + '</span>';
    html += '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>';
    html += '<span class="bar-count">' + item.count + '</span>';
    html += '</div>';
  });
  html += '</div>';

  // Top 5 视频
  const byVideo = {};
  allWords.forEach(w => {
    if (!w.videoId) return;
    byVideo[w.videoId] = (byVideo[w.videoId] || 0) + 1;
  });
  const top5 = Object.entries(byVideo).sort((a, b) => b[1] - a[1]).slice(0, 5);
  html += '<div class="stat-card">';
  html += '<h4>🏆 Top 5 视频</h4>';
  if (top5.length === 0) {
    html += '<div style="font-size:11px;color:#888;">还没有标记生词</div>';
  } else {
    top5.forEach((pair, i) => {
      const vid = pair[0];
      const count = pair[1];
      const kb = state.knowledgeBase[vid];
      const title = kb ? kb.title : ('视频 ' + vid);
      const shortTitle = title.length > 30 ? title.slice(0, 30) + '…' : title;
      html += '<div class="top-video">';
      html += '<span class="rank">' + (i + 1) + '.</span>';
      html += '<span class="title" title="' + escapeHtml(title) + '">' + escapeHtml(shortTitle) + '</span>';
      html += '<span class="count">' + count + ' 词</span>';
      html += '</div>';
    });
  }
  html += '</div>';

  wrapper.innerHTML = html;
  contentEl.appendChild(wrapper);

  // 复习按钮渲染到底部固定区域
  const bottomAction = document.getElementById('bottom-action');
  if (bottomAction) {
    bottomAction.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'review-btn';
    btn.id = 'btnStartReview';
    if (totalWords === 0) {
      btn.disabled = true;
      btn.textContent = '🔁 先去标记生词';
    } else {
      btn.textContent = '🔁 开始复习';
      btn.addEventListener('click', () => {
        startReview();
      });
    }
    bottomAction.appendChild(btn);
    bottomAction.style.display = 'block';
  }
}

function startReview() {
  const allWords = Object.values(state.savedWords).filter(w => !w.mastered);
  if (allWords.length === 0) {
    statusEl.textContent = '🎉 没有待复习的词（全部已掌握）';
    return;
  }
  // 按最久没复习排序：没复习过的用 addedAt 兜底
  const sorted = allWords.slice().sort((a, b) => {
    const aTime = a.lastReviewedAt || a.addedAt || 0;
    const bTime = b.lastReviewedAt || b.addedAt || 0;
    return aTime - bTime;
  });
  state.reviewCards = sorted.slice(0, 10);
  state.reviewInitialCount = state.reviewCards.length;
  state.reviewIndex = 0;
  state.reviewFlipped = false;
  state.reviewStats = { mastered: 0, again: 0, skipped: 0 };
  state.reviewMode = true;
  renderReview();
}

function renderReview() {
  const bottomAction = document.getElementById('bottom-action');
  if (bottomAction) { bottomAction.innerHTML = ''; bottomAction.style.display = 'none'; }
  kbFilterEl.style.display = 'none';
  const wfHide = document.getElementById('word-filter');
  if (wfHide) wfHide.style.display = 'none';

  contentEl.innerHTML = '';

  // 复习结束
  if (state.reviewIndex >= state.reviewCards.length) {
    renderReviewComplete();
    return;
  }

  const card = state.reviewCards[state.reviewIndex];
  const total = state.reviewCards.length;
  const idx = state.reviewIndex + 1;
  const info = card.aiInfo || {};
  const definition = info.definition || card.googleZh || '（无释义，可稍后 AI 解释）';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; height:100%; padding:4px 2px; box-sizing:border-box;';

  // 头部进度
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#888; margin-bottom:8px;';
  header.innerHTML = '<span>🔁 复习中</span><span>' + idx + ' / ' + total + '</span>';
  wrapper.appendChild(header);

  // 卡片
  const cardBox = document.createElement('div');
  cardBox.style.cssText = 'flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:16px; background:#fafafa; border-radius:8px; text-align:center;';

  let cardHtml = '<div style="font-size:26px; font-weight:700; color:#1976d2; word-break:break-all;">' + escapeHtml(card.original || card.word) + '</div>';
  if (info.phonetic) cardHtml += '<div style="font-size:13px; color:#666; margin-top:6px;">' + escapeHtml(info.phonetic) + '</div>';
  if (info.pos) cardHtml += '<div style="font-size:12px; color:#888; margin-top:4px;">' + escapeHtml(info.pos) + '</div>';

  if (state.reviewFlipped) {
    cardHtml += '<div style="width:60%; border-top:1px solid #ddd; margin:16px 0;"></div>';
    cardHtml += '<div style="font-size:13px; color:#333; line-height:1.6;">释义：' + escapeHtml(definition) + '</div>';
    if (info.example) cardHtml += '<div style="font-size:12px; color:#555; margin-top:8px; font-style:italic;">例句：' + escapeHtml(info.example) + '</div>';
    if (card.sentence) {
      const shortSent = card.sentence.length > 70 ? card.sentence.slice(0, 70) + '…' : card.sentence;
      cardHtml += '<div style="font-size:11px; color:#888; margin-top:8px;">原文："' + escapeHtml(shortSent) + '"</div>';
    }
    if (card.videoId) {
      cardHtml += '<div style="margin-top:10px;"><a href="https://www.youtube.com/watch?v=' + card.videoId + '" target="_blank" style="font-size:11px; color:#1976d2; text-decoration:none;">🔗 打开原视频</a></div>';
    }
  } else {
    cardHtml += '<div style="font-size:12px; color:#aaa; margin-top:24px;">[ Space 显示释义 ]</div>';
  }

  cardBox.innerHTML = cardHtml;
  wrapper.appendChild(cardBox);

  // 底部提示
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px; color:#888; text-align:center; margin-top:10px; line-height:1.6;';
  hint.innerHTML = state.reviewFlipped
    ? 'Space 收起 · Enter 已掌握 · ← 再看一遍 · → 跳过 · Esc 退出'
    : 'Space 翻转 · ← 再看一遍 · → 跳过 · Esc 退出';
  wrapper.appendChild(hint);

  contentEl.appendChild(wrapper);

  // 更新状态栏
  statusEl.textContent = state.reviewFlipped
    ? '🔁 ' + idx + '/' + total + ' · 已翻转 · Enter 已掌握 · ← 再看 · → 跳过'
    : '🔁 ' + idx + '/' + total + ' · Space 翻转 · Esc 退出';
}

function renderReviewComplete() {
  // 打卡
  markToday();
  statusEl.textContent = '🎉 复习完成';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; padding:20px; text-align:center;';

  const streak = calcStreak();
  let html = '<div style="font-size:40px; margin-bottom:8px;">🎉</div>';
  html += '<div style="font-size:18px; font-weight:600; color:#1976d2; margin-bottom:16px;">复习完成</div>';
  const initCount = state.reviewInitialCount || state.reviewCards.length;
  const newCount = initCount - state.reviewStats.mastered - state.reviewStats.skipped;
  html += '<div style="font-size:13px; color:#333; line-height:2;">';
  html += '初始卡片：' + initCount + ' 张<br>';
  html += '✅ 已掌握：' + state.reviewStats.mastered + ' 张<br>';
  html += '🔁 再看一遍：' + state.reviewStats.again + ' 次<br>';
  html += '➡️ 跳过：' + state.reviewStats.skipped + ' 张<br>';
  html += '⏳ 还没掌握：' + Math.max(0, newCount) + ' 张<br>';
  html += '</div>';
  html += '<div style="margin-top:20px; padding:10px 16px; background:#fff7e0; border-radius:8px; font-size:13px; color:#f57c00;">';
  html += '🔥 连续打卡 <b style="font-size:18px;">' + streak + '</b> 天';
  html += '</div>';
  html += '<div style="margin-top:24px; font-size:12px; color:#888;">按 Esc 或 Enter 返回统计</div>';

  wrapper.innerHTML = html;
  contentEl.appendChild(wrapper);
}

function updateStatus() {
  if (state.view === 'subtitles') statusEl.textContent = '✅ 共 ' + state.lines.length + ' 行。' + (state.focusMode === 'word' ? '词模式：Space 标记，Esc 退出' : '行模式：Space 跳转，→ 选词');
  else if (state.view === 'words') {
    const filtered = getFilteredWords().length;
    statusEl.textContent = '📖 生词本（' + (state.wordFilter === 'current' ? '当前视频' : '全部') + '）：' + filtered + ' 个。Enter=AI解释，Space=跳转+朗读';
  }
  else if (state.view === 'ai') statusEl.textContent = '🤖 Enter=生成/重新生成，S=保存，Space=翻页';
  else if (state.view === 'knowledge') {
    const total = Object.keys(state.knowledgeBase).length;
    const filtered = state.tagFilter === 'ALL' ? total : Object.values(state.knowledgeBase).filter(e => e.tags && e.tags.includes(state.tagFilter)).length;
    statusEl.textContent = state.tagFilter === 'ALL' ? '📚 知识库共 ' + total + ' 条。Enter=展开/收起，Space=翻页' : '📚 标签「' + state.tagFilter + '」下共 ' + filtered + ' 条';
  }
  else if (state.view === 'stats') statusEl.textContent = '📊 学习统计。Tab 切换视图';
}

function setView(view) {
  // 如果从统计视图切走，且正在复习，自动退出复习
  if (state.reviewMode && view !== 'stats') {
    state.reviewMode = false;
    state.reviewFlipped = false;
    state.reviewCards = [];
    state.reviewIndex = 0;
  }
  const prevView = state.view;
  state.view = view;
  if (prevView !== view) {
    state.selectedIndex = 0;
    state.focusMode = 'line';
    state.selectedWordIndex = 0;
  }
  document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
  saveDialogEl.innerHTML = '';
  if (view !== 'knowledge') kbFilterEl.style.display = 'none';
  const wf = document.getElementById('word-filter');
  if (wf && view !== 'words') wf.style.display = 'none';
  const ba = document.getElementById('bottom-action');
  if (ba && view !== 'stats') { ba.style.display = 'none'; ba.innerHTML = ''; }
  const kbExportEl = document.getElementById('kb-export');
  if (kbExportEl) kbExportEl.style.display = (view === 'knowledge') ? 'block' : 'none';

  if (view === 'subtitles') { document.getElementById('btnCheck').classList.add('active'); renderSubtitles(); }
  else if (view === 'words') {
    document.getElementById('btnWords').classList.add('active');
    if (!state.highlightWord) state.wordFilter = 'current';
    renderWordsAsync();
  }
  else if (view === 'ai') {
    document.getElementById('btnAI').classList.add('active');
    if (state.aiResult) renderAIResult(state.aiResult);
    else contentEl.innerHTML = '<div class="ai-block">还没有 AI 整理结果，按 Enter 生成。</div>';
  } else if (view === 'knowledge') {
    document.getElementById('btnKB').classList.add('active');
    renderKnowledgeBase();
  } else if (view === 'stats') {
    document.getElementById('btnStats').classList.add('active');
    renderStats();
  }
  updateStatus();
}

async function autoFetchSubtitles() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) { statusEl.textContent = '请打开一个 YouTube 视频页'; return; }
  if (!tab.url.includes('youtube.com/watch')) {
    statusEl.textContent = '请在 YouTube 视频页使用（当前不是视频页）';
    contentEl.innerHTML = '<div class="ai-block">请在 YouTube 视频页使用（当前不是视频页）</div>';
    return;
  }
  statusEl.textContent = '正在获取字幕…';
  state.videoId = await getVideoId();
  chrome.tabs.sendMessage(tab.id, { type: 'GET_SUBTITLE_INFO' }, (res) => {
    if (chrome.runtime.lastError) {
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_SUBTITLE_INFO' }, (res2) => {
          if (chrome.runtime.lastError) { statusEl.textContent = '请刷新 YouTube 页面再试'; return; }
          if (res2 && res2.found && res2.lines) {
            state.lines = res2.lines;
            state.aiResult = state.aiResults[state.videoId] || null;
            state.aiResultSource = state.aiResult ? 'cache' : null;
            state.selectedIndex = 0; state.focusMode = 'line'; state.view = 'subtitles';
            document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
            document.getElementById('btnCheck').classList.add('active');
            kbFilterEl.style.display = 'none';
            const wf = document.getElementById('word-filter'); if (wf) wf.style.display = 'none';
            saveDialogEl.innerHTML = '';
            renderSubtitles(); updateStatus();
          } else { statusEl.textContent = '❌ ' + ((res2 && res2.message) || '未知错误'); }
        });
      }, 1000);
      return;
    }
    if (res && res.found && res.lines) {
      state.lines = res.lines;
      state.aiResult = state.aiResults[state.videoId] || null;
      state.aiResultSource = state.aiResult ? 'cache' : null;
      state.selectedIndex = 0; state.focusMode = 'line'; state.view = 'subtitles';
      document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
      document.getElementById('btnCheck').classList.add('active');
      kbFilterEl.style.display = 'none';
      const wf = document.getElementById('word-filter'); if (wf) wf.style.display = 'none';
      saveDialogEl.innerHTML = '';
      renderSubtitles(); updateStatus();
    } else { statusEl.textContent = '❌ ' + ((res && res.message) || '未知错误'); }
  });
}

// ============ 事件绑定 ============
document.getElementById('btnCheck').addEventListener('click', autoFetchSubtitles);
document.getElementById('btnWords').addEventListener('click', () => setView('words'));
document.getElementById('btnAI').addEventListener('click', (e) => callAI(e.shiftKey));
document.getElementById('btnKB').addEventListener('click', () => setView('knowledge'));
document.getElementById('btnStats').addEventListener('click', () => setView('stats'));
apiKeyInput.addEventListener('change', () => { chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() }); });

const btnApiSettings = document.getElementById('btnApiSettings');
const apiSettingEl = document.getElementById('apiSetting');
if (btnApiSettings) {
  btnApiSettings.addEventListener('click', () => {
    apiSettingEl.style.display = apiSettingEl.style.display === 'block' ? 'none' : 'block';
    if (apiSettingEl.style.display === 'block') apiKeyInput.focus();
  });
}

// 导出按钮
(function bindKbExport() {
  const btnCurrent = document.getElementById('btnExportCurrent');
  const btnTag = document.getElementById('btnExportTag');
  const btnAll = document.getElementById('btnExportAll');
  const cbTranscript = document.getElementById('includeTranscript');
  if (!btnCurrent) return;
  const getIncludeTranscript = () => !!(cbTranscript && cbTranscript.checked);

  btnCurrent.addEventListener('click', async () => {
    const entry = state.knowledgeBase[state.videoId];
    if (!entry) { statusEl.textContent = '⚠️ 当前视频还没保存到知识库'; return; }
    const md = generateVideoMarkdown(entry, getIncludeTranscript());
    const ok = await copyToClipboard(md);
    statusEl.textContent = ok ? '✅ 已复制到剪贴板，粘到飞书即可' : '❌ 复制失败';
  });
  btnTag.addEventListener('click', async () => {
    const all = Object.values(state.knowledgeBase).sort((a, b) => b.updatedAt - a.updatedAt);
    const entries = state.tagFilter === 'ALL' ? all : all.filter(e => Array.isArray(e.tags) && e.tags.includes(state.tagFilter));
    if (entries.length === 0) { statusEl.textContent = '⚠️ 当前标签下没有记录'; return; }
    const title = state.tagFilter === 'ALL' ? 'YouTube 学习笔记（全部）' : 'YouTube 学习笔记（#' + state.tagFilter + '）';
    const md = generateMultiMarkdown(entries, getIncludeTranscript(), title);
    const ok = await copyToClipboard(md);
    statusEl.textContent = ok ? '✅ 已复制 ' + entries.length + ' 条' : '❌ 复制失败';
  });
  btnAll.addEventListener('click', async () => {
    const entries = Object.values(state.knowledgeBase).sort((a, b) => b.updatedAt - a.updatedAt);
    if (entries.length === 0) { statusEl.textContent = '⚠️ 知识库是空的'; return; }
    const md = generateMultiMarkdown(entries, getIncludeTranscript(), 'YouTube 学习笔记（全部）');
    const ok = await copyToClipboard(md);
    statusEl.textContent = ok ? '✅ 已复制全部 ' + entries.length + ' 条' : '❌ 复制失败';
  });
})();

// ============ 键盘 ============
const VIEW_ORDER = ['subtitles', 'words', 'ai', 'knowledge', 'stats'];

async function handleReviewKey(key) {
  // Tab：退出复习并切视图
  if (key === 'Tab') {
    state.reviewMode = false;
    state.reviewFlipped = false;
    state.reviewCards = [];
    state.reviewIndex = 0;
    await saveSavedWords();
    const idx = VIEW_ORDER.indexOf('stats');
    setView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]);
    return;
  }
  // 已完成页
  if (state.reviewIndex >= state.reviewCards.length) {
    if (key === 'Escape' || key === 'Enter' || key === ' ') {
      state.reviewMode = false;
      setView('stats');
    }
    return;
  }

  const card = state.reviewCards[state.reviewIndex];
  if (!card) { state.reviewMode = false; setView('stats'); return; }

  if (key === ' ') {
    const wasFlipped = state.reviewFlipped;
    state.reviewFlipped = !state.reviewFlipped;
    renderReview();
    // 只在从"收起 → 展开"时朗读
    if (!wasFlipped && state.reviewFlipped) {
      speakWord(card.original || card.word);
    }
    return;
  }

  if (key === 'Escape') {
    state.reviewMode = false;
    await saveSavedWords();
    setView('stats');
    statusEl.textContent = '⏸ 已退出复习（进度已保存）';
    return;
  }

  if (key === 'Enter') {
    // 已掌握
    if (state.savedWords[card.word]) {
      state.savedWords[card.word].mastered = true;
      state.savedWords[card.word].lastReviewedAt = Date.now();
    }
    state.reviewStats.mastered++;
    await saveSavedWords();
    state.reviewIndex++;
    state.reviewFlipped = false;
    renderReview();
    return;
  }

  if (key === 'ArrowLeft') {
    // 再看一遍：更新 lastReviewedAt，塞回队尾
    if (state.savedWords[card.word]) {
      state.savedWords[card.word].lastReviewedAt = Date.now();
    }
    state.reviewStats.again++;
    state.reviewCards.push(card);
    await saveSavedWords();
    state.reviewIndex++;
    state.reviewFlipped = false;
    renderReview();
    return;
  }

  if (key === 'ArrowRight') {
    // 跳过
    if (state.savedWords[card.word]) {
      state.savedWords[card.word].lastReviewedAt = Date.now();
    }
    state.reviewStats.skipped++;
    await saveSavedWords();
    state.reviewIndex++;
    state.reviewFlipped = false;
    renderReview();
    return;
  }
}

function handleKeyPress(key, shiftKey) {
  // 复习模式优先
  if (state.reviewMode) {
    handleReviewKey(key);
    return;
  }
  // 统计视图：Enter 触发复习
  if (key === 'Enter' && state.view === 'stats') {
    startReview();
    return;
  }
  if (key === 'Tab') { const idx = VIEW_ORDER.indexOf(state.view); setView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]); return; }
  if (key === 'p' || key === 'P') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => { if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PLAY' }); });
    statusEl.textContent = '⏯ 播放/暂停已切换'; return;
  }
  if (key === 's' || key === 'S') {
    if (state.view === 'ai' && state.aiResult) { showSaveDialog(); }
    else statusEl.textContent = '⚠️ 请先在 🤖 整理 视图生成结果';
    return;
  }
  if (key === 'Escape') {
    if (state.view === 'subtitles' && state.focusMode === 'word') { state.focusMode = 'line'; renderSubtitles(); updateStatus(); return; }
    if (state.view === 'knowledge') {
      const allEntries = Object.values(state.knowledgeBase).sort((a, b) => b.updatedAt - a.updatedAt);
      const entries = state.tagFilter === 'ALL' ? allEntries : allEntries.filter(ent => Array.isArray(ent.tags) && ent.tags.includes(state.tagFilter));
      const currentEntry = entries[state.selectedIndex];
      if (currentEntry && state.expandedIds[currentEntry.videoId]) {
        delete state.expandedIds[currentEntry.videoId];
        renderKnowledgeBase(); updateStatus();
        statusEl.textContent = '✅ 已收起';
        return;
      }
    }
    state.selectedIndex = 0; setView(state.view); return;
  }
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (state.view === 'ai') { contentEl.scrollBy({ top: (key === 'ArrowDown' ? 1 : -1) * 80, behavior: 'smooth' }); return; }
    state.focusMode = 'line';
    const delta = key === 'ArrowDown' ? 1 : -1;
    if (state.view === 'subtitles') {
      if (state.lines.length === 0) { statusEl.textContent = '⚠️ 请先点 📺 字幕'; return; }
      state.selectedIndex = Math.max(0, Math.min(state.lines.length - 1, state.selectedIndex + delta));
      state.selectedWordIndex = 0; state.focusMode = 'line';
      renderSubtitles(); updateStatus();
      const btn = contentEl.querySelector('.item[data-line-index="' + state.selectedIndex + '"]');
      if (btn) scrollToCenter(btn);
    } else if (state.view === 'words') {
      const words = getFilteredWords();
      if (words.length === 0) return;
      state.selectedIndex = Math.max(0, Math.min(words.length - 1, state.selectedIndex + delta));
      updateWordSelectionOnly(); updateStatus();
    } else if (state.view === 'knowledge') {
      const allEntries = Object.values(state.knowledgeBase).sort((a, b) => b.updatedAt - a.updatedAt);
      const entries = state.tagFilter === 'ALL' ? allEntries : allEntries.filter(ent => Array.isArray(ent.tags) && ent.tags.includes(state.tagFilter));
      if (entries.length === 0) return;
      const currentEntry = entries[state.selectedIndex];
      if (currentEntry && state.expandedIds[currentEntry.videoId]) {
        contentEl.scrollBy({ top: delta * 80, behavior: 'smooth' });
        statusEl.textContent = '📖 浏览模式';
        return;
      }
      state.selectedIndex = Math.max(0, Math.min(entries.length - 1, state.selectedIndex + delta));
      renderKnowledgeBase();
      setTimeout(() => {
        const cards = contentEl.querySelectorAll('.kb-card');
        if (cards[state.selectedIndex]) scrollToCenter(cards[state.selectedIndex]);
      }, 30);
      updateStatus(); return;
    }
    return;
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    // 生词本：左右切换筛选
    if (state.view === 'words') {
      state.wordFilter = state.wordFilter === 'current' ? 'all' : 'current';
      state.selectedIndex = 0;
      renderWordsAsync();
      statusEl.textContent = '📖 筛选：' + (state.wordFilter === 'current' ? '当前视频' : '全部');
      return;
    }
    // 字幕：左右选词
    if (state.view !== 'subtitles') return;
    const wasLineMode = state.focusMode !== 'word';
    state.focusMode = 'word';
    const btn = contentEl.querySelector('.item[data-line-index="' + state.selectedIndex + '"]');
    if (!btn) return;
    const words = btn.querySelectorAll('.word');
    if (words.length === 0) return;
    if (wasLineMode) {
      // 从行模式刚进入词模式：按 → 选第一个词，按 ← 选最后一个词
      state.selectedWordIndex = (key === 'ArrowRight') ? 0 : words.length - 1;
    } else {
      const delta = key === 'ArrowRight' ? 1 : -1;
      state.selectedWordIndex = Math.max(0, Math.min(words.length - 1, state.selectedWordIndex + delta));
    }
    applyWordFocus();
    statusEl.textContent = '🔤 词模式：' + (state.selectedWordIndex + 1) + '/' + words.length;
    return;
  }
  if (key === 'Enter') {
    if (state.view === 'subtitles') {
      if (state.lines.length === 0) { statusEl.textContent = '⚠️ 请先点 📺 字幕'; return; }
      const line = state.lines[state.selectedIndex];
      if (line) {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => { if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: line.start }); });
        statusEl.textContent = '⏸ 已跳到 ' + formatTime(line.start);
      }
    } else if (state.view === 'words') {
      const words = getFilteredWords();
      const w = words[state.selectedIndex];
      if (w) {
        const card = contentEl.querySelector('.wordcard[data-word="' + w.word + '"]');
        if (card) { const btn = card.querySelector('.mini-btn.primary') || card.querySelector('.mini-btn'); if (btn) btn.click(); }
      }
    } else if (state.view === 'ai') { callAI(!!shiftKey); }
    else if (state.view === 'knowledge') {
      const allEntries = Object.values(state.knowledgeBase).sort((a, b) => b.updatedAt - a.updatedAt);
      const entries = state.tagFilter === 'ALL' ? allEntries : allEntries.filter(ent => Array.isArray(ent.tags) && ent.tags.includes(state.tagFilter));
      const entry = entries[state.selectedIndex];
      if (entry) {
        const willExpand = !state.expandedIds[entry.videoId];
        state.expandedIds[entry.videoId] = willExpand;
        renderKnowledgeBase();
        statusEl.textContent = willExpand ? '📖 浏览模式' : '✅ 已收起';
      }
    }
    return;
  }
  if (key === ' ') {
    if (state.view === 'subtitles') {
      if (state.lines.length === 0) { statusEl.textContent = '⚠️ 请先点 📺 字幕'; return; }
      if (state.focusMode === 'word') {
        const line = state.lines[state.selectedIndex];
        if (!line) return;
        const tokens = line.text.split(/(\b[A-Za-z][A-Za-z'-]*\b)/);
        const words = tokens.filter(t => /^[A-Za-z][A-Za-z'-]*$/.test(t) && t.length > 1);
        const tok = words[state.selectedWordIndex];
        if (!tok) return;
        const wKey = normalizeWord(tok);
        toggleWordSaved(wKey, tok, line).then(() => {
          renderSubtitles();
          statusEl.textContent = state.savedWords[wKey] ? '⭐ 已加入：' + tok : '已移除：' + tok;
        });
      } else {
        // 行模式：跳转到当前行
        const line = state.lines[state.selectedIndex];
        if (line) {
          chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: line.start });
          });
          statusEl.textContent = '⏸ 已跳到 ' + formatTime(line.start);
        }
      }
    } else if (state.view === 'words') {
      const words = getFilteredWords();
      const w = words[state.selectedIndex];
      if (w) {
        if (w.videoId !== state.videoId) {
          const kbEntry = state.knowledgeBase[w.videoId];
          const title = kbEntry ? kbEntry.title : ('视频 ' + w.videoId);
          speakWord(w.original || w.word);
          statusEl.textContent = '🔊 已朗读（该词来自其他视频，未跳转。要跳转请点卡片上的 🔗 打开视频）';
          return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: w.startMs });
        });
        speakWord(w.original || w.word);
        statusEl.textContent = '⏸ 已跳到原句位置 + 🔊 朗读';
      }
    } else if (state.view === 'ai' || state.view === 'knowledge') {
      contentEl.scrollTop += Math.floor(contentEl.clientHeight * 0.5);
    }
    return;
  }
}

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const key = e.key;
  if (e.altKey && (key === 'p' || key === 'P')) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); handleKeyPress('P', false); return; }
  if (e.altKey && (key === 's' || key === 'S')) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); handleKeyPress('S', false); return; }
  const plainKeys = ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 's', 'S', 'p', 'P'];
  if (!plainKeys.includes(key)) return;
  if (e.ctrlKey || e.altKey || e.metaKey) {
    if (key === 'Enter') { /* allow shift */ } else return;
  }
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  handleKeyPress(key, e.shiftKey);
}, true);

// ============ 轮询当前视频 ============
let currentActiveVideoId = null;
let pollInFlight = false;
async function pollCurrentVideo() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) return;
    const vid = new URL(tab.url).searchParams.get('v');
    if (!vid) return;
    if (vid === currentActiveVideoId) return;
    currentActiveVideoId = vid;
    statusEl.textContent = '切换视频，正在准备字幕…';
    state.lines = [];
    await new Promise(r => setTimeout(r, 2000));
    await autoFetchSubtitles();
  } catch (_) {} finally { pollInFlight = false; }
}
setInterval(pollCurrentVideo, 1500);

async function autoBackfillCheckIn() {
  // 检查生词本里是否有今天标记的词，有的话补打卡
  const today = formatDate(new Date());
  const hasTodayWord = Object.values(state.savedWords).some(w => 
    w.addedAt && formatDate(new Date(w.addedAt)) === today
  );
  // 检查知识库里是否有今天保存的记录
  const hasTodayKB = Object.values(state.knowledgeBase).some(e => 
    e.savedAt && formatDate(new Date(e.savedAt)) === today
  );
  if ((hasTodayWord || hasTodayKB) && !state.checkInDates.includes(today)) {
    state.checkInDates.push(today);
    // 保留最近 365 天
    const cutoff = formatDate(getDateNDaysAgo(365));
    state.checkInDates = state.checkInDates.filter(d => d >= cutoff);
    await saveCheckInDates();
    console.log('[YT Helper] 自动补打卡：' + today);
  }
}

console.log('[YT Helper] popup.js loaded (v6)');
(async function init() { await loadStorage(); await autoBackfillCheckIn(); setView('subtitles'); await autoFetchSubtitles(); })();