// --- 首次安装时的逻辑 ---
chrome.runtime.onInstalled.addListener(() => {
  // 设置所有默认值
  chrome.storage.sync.set({
    isEnabled: true,
    showNotifications: true,
    rpcUrl: 'http://127.0.0.1:6800/jsonrpc',
    rpcSecret: ''
  });
  // 右键菜单相关代码已全部移除
});

// --- 全局变量：用于在 webRequest 和 downloads API 之间传递请求头 ---
const requestHeadersMap = {};

// --- 小工具：从路径中提取文件名 ---
function basename(p) {
  if (!p) return "download";
  try {
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || "download";
  } catch {
    return "download";
  }
}

// --- 防重入集合，避免同一下载被多次处理 ---
const handled = new Set();


// --- API 协同第一棒：捕获并存储请求头 ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // 我们关心所有可能成为下载的请求
    if (details.type === 'main_frame' || details.type === 'sub_frame') {
      const headers = [];
      for (const header of details.requestHeaders) {
        if (header.name.toLowerCase().startsWith('sec-') || header.name.toLowerCase().startsWith('proxy-')) {
          continue;
        }
        if (['referer', 'user-agent', 'cookie'].includes(header.name.toLowerCase())) {
          headers.push(`${header.name}: ${header.value}`);
        }
      }
      if (headers.length > 0) {
        requestHeadersMap[details.url] = headers;
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);


// --- onCreated 只用于提前处理 blob/data URL ---
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) {
    chrome.storage.sync.get(['showNotifications'], (settings) => {
      if (settings.showNotifications) {
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: '提示：使用浏览器默认下载',
          message: '此下载类型(blob/data)无法被接管，已自动切换为浏览器下载。'
        });
      }
    });
  }
});


// --- API 协同第二棒：唯一的、统一的下载处理器 ---
chrome.downloads.onDeterminingFilename.addListener((item, _suggest) => {
  chrome.storage.sync.get(['isEnabled', 'showNotifications', 'rpcUrl', 'rpcSecret'], (settings) => {
    const u = item.finalUrl || item.url || '';
    
    if (!settings.isEnabled || !settings.rpcUrl || u.startsWith('blob:') || u.startsWith('data:')) {
      return;
    }

    if (handled.has(item.id)) { return; }
    handled.add(item.id);

    const outName = basename(item.filename);
    const headers = requestHeadersMap[u] || [];
    
    if (item.referrer && !headers.some(h => h.toLowerCase().startsWith('referer:'))) {
        headers.push(`Referer: ${item.referrer}`);
    }

    delete requestHeadersMap[u];

    chrome.downloads.cancel(item.id, () => {
      chrome.downloads.erase({ id: item.id }, () => {
        sendToAria2(u, settings, { out: outName, header: headers });
      });
    });
  });
  return true;
});


// --- 最终的发送函数 (无变化) ---
async function sendToAria2(downloadUrl, settings, options = {}) {
  if (!settings.rpcUrl) {
    console.error('Aria2 RPC URL not configured.');
    return;
  }

  const rpcOptions = {};
  if (options.header && options.header.length > 0) {
    rpcOptions.header = options.header;
  }
  if (options.out) {
    rpcOptions.out = options.out;
  }

  const rpcAuth = settings.rpcSecret ? `token:${settings.rpcSecret}` : undefined;

  const params = [[downloadUrl], rpcOptions];
  if (rpcAuth) {
    params.unshift(rpcAuth);
  }

  const rpcPayload = {
    jsonrpc: '2.0',
    id: `chrome-ext-${Date.now()}`,
    method: 'aria2.addUri',
    params
  };

  try {
    const response = await fetch(settings.rpcUrl, {
      method: 'POST',
      body: JSON.stringify(rpcPayload),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    if (data.error) {
      console.error('Aria2 RPC Error:', data.error);
      if (settings.showNotifications) {
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: 'Aria2 转发失败', message: `错误: ${data.error.message}`
        });
      }
    } else {
      console.log('Successfully sent to Aria2 with GID:', data.result);
      if (settings.showNotifications) {
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: '下载任务已发送至 Aria2',
          message: `文件 "${options.out || basename(downloadUrl)}" 已成功添加！`
        });
      }
    }
  } catch (error) {
    console.error('Failed to connect to Aria2 RPC service:', error);
    if (settings.showNotifications) {
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon128.png',
        title: '无法连接到 Aria2',
        message: '请确保 Aria2 正在运行且配置正确。'
      });
    }
  }
}