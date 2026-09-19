console.log('[YT Learning Helper] content script loaded');

let capturedPotUrl = null;
let capturedVideoId = null;

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.type === 'YT_HELPER_POT_URL') {
    capturedPotUrl = event.data.url;
    try {
      const u = new URL(event.data.url);
      capturedVideoId = u.searchParams.get('v');
    } catch (_) { capturedVideoId = null; }
  }
});

function getCurrentVideoId() {
  try { return new URL(location.href).searchParams.get('v'); } catch (_) { return null; }
}

function getCaptionUrl() {
  const nowVid = getCurrentVideoId();
  // 视频切换后，缓存的 PoToken 失效，重置
  if (capturedVideoId && nowVid && capturedVideoId !== nowVid) {
    capturedPotUrl = null;
    capturedVideoId = null;
  }
  if (capturedPotUrl && capturedVideoId === nowVid) return capturedPotUrl;
  // 兜底：从 ytInitialPlayerResponse 读基础地址（不带 pot）
  try {
    const pr = window.ytInitialPlayerResponse;
    if (pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer) {
      const tracks = pr.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (tracks && tracks.length > 0) {
        const enTrack = tracks.find(t => t.languageCode === 'en') || tracks[0];
        if (enTrack) return enTrack.baseUrl;
      }
    }
  } catch (e) { console.error('Error reading caption tracks:', e); }
  return null;
}

async function fetchAndParseSubtitle(url) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.events) return [];
    const lines = [];
    for (const ev of data.events) {
      if (ev.segs && typeof ev.tStartMs === 'number') {
        const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
        if (text) lines.push({ start: ev.tStartMs, text: text });
      }
    }
    return lines;
  } catch (e) { console.error('Fetch subtitle error:', e); return null; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SUBTITLE_INFO') {
    let attempts = 0;
    const maxAttempts = 24; // 最多等 12 秒
    const check = () => {
      attempts++;
      const url = getCaptionUrl();
      if (url && url.includes('pot=')) {
        fetchAndParseSubtitle(url).then(lines => {
          if (lines && lines.length > 0) {
            sendResponse({ found: true, lines: lines, count: lines.length });
          } else {
            // 拿到地址但内容为空，重试
            if (attempts < maxAttempts) setTimeout(check, 500);
            else sendResponse({ found: false, message: '字幕内容为空，请稍后重试或换一个视频。' });
          }
        });
        return;
      }
      if (attempts < maxAttempts) setTimeout(check, 500);
      else sendResponse({ found: false, message: '等待字幕超时，请刷新页面重试。' });
    };
    check();
    return true;
  }

  if (msg.type === 'SEEK_TO') {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = msg.timeMs / 1000;
      video.pause();
      sendResponse({ ok: true });
    } else sendResponse({ ok: false, message: '找不到视频元素' });
    return true;
  }

  if (msg.type === 'TOGGLE_PLAY') {
    const video = document.querySelector('video');
    if (video) {
      if (video.paused) video.play(); else video.pause();
      sendResponse({ ok: true, playing: !video.paused });
    } else sendResponse({ ok: false });
    return true;
  }
});