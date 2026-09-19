(function() {
  function report(url) {
    if (typeof url === 'string' && url.includes('/api/timedtext') && url.includes('pot=')) {
      window.postMessage({ type: 'YT_HELPER_POT_URL', url: url }, '*');
      console.log('[YT Helper MAIN] 已捕获并广播 PoToken 字幕地址:', url);
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await origFetch.apply(this, args);
    try {
      const url = args[0]?.url ?? args[0];
      report(url);
    } catch (_) {}
    return response;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__ytHelperUrl = url;
    return origOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try { report(this.__ytHelperUrl); } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();