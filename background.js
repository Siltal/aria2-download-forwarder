// --- 首次安装时的逻辑 ---
chrome.runtime.onInstalled.addListener(() => {
  // 设置所有默认值
  chrome.storage.sync.set({
    isEnabled: true,
    showNotifications: true, // 新增
    rpcUrl: 'http://127.0.0.1:6800/jsonrpc',
    rpcSecret: ''
  });

  // 创建右键菜单项
  chrome.contextMenus.create({
    id: "saveWithAria2",
    title: "使用 Aria2 保存图片",
    contexts: ["image"]
  });
});


// --- 小工具：去掉路径取文件名 ---
function basename(p) {
  if (!p) return "download";
  try {
    // 既兼容 / 也兼容 \\
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || "download";
  } catch {
    return "download";
  }
}

// --- 防重入集合，避免同一下载被多次处理 ---
const handled = new Set();


// --- 监听右键菜单点击事件 ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveWithAria2") {
    // 获取所有需要的设置
    chrome.storage.sync.get(['rpcUrl', 'rpcSecret', 'showNotifications'], (settings) => {
      if (!settings.rpcUrl) {
        if (settings.showNotifications) {
          chrome.notifications.create({
            type: 'basic', iconUrl: 'icons/icon128.png',
            title: 'Aria2 操作失败', message: '请先在扩展选项中配置 RPC 地址。'
          });
        }
        return;
      }

      const headers = [];
      if (info.pageUrl) headers.push(`Referer: ${info.pageUrl}`);

      // 从图片 URL 猜一个文件名作为 out（不如 downloads 的建议名准确，但对右键图片足够）
      const guessOut = basename(new URL(info.srcUrl).pathname);

      sendToAria2(info.srcUrl, settings, { header: headers, out: guessOut });
    });
  }
});


chrome.downloads.onCreated.addListener((downloadItem) => {
  chrome.storage.sync.get(['isEnabled', 'showNotifications'], (settings) => {
    if (downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) {
      if (settings.showNotifications) {
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: '提示：使用浏览器默认下载',
          message: '此下载类型(blob/data)无法被接管，已自动切换为浏览器下载。'
        });
      }
      return;
    }
  });
});


chrome.downloads.onDeterminingFilename.addListener((item, _suggest) => {
  // 读取设置
  chrome.storage.sync.get(['isEnabled', 'showNotifications', 'rpcUrl', 'rpcSecret'], (settings) => {
    // 关闭、无 RPC、或 blob/data：不接管
    const u = item.finalUrl || item.url || '';
    if (!settings.isEnabled || !settings.rpcUrl || u.startsWith('blob:') || u.startsWith('data:')) {
      return;
    }

    // 防止重复
    if (handled.has(item.id)) {
      return;
    }
    handled.add(item.id);

    const outName = basename(item.filename);

    chrome.downloads.cancel(item.id, () => {
      chrome.downloads.erase({ id: item.id }, () => {
        // 发送到 aria2，设置 out
        sendToAria2(u, settings, { out: outName })
          .then(() => {
            if (settings.showNotifications) {
              chrome.notifications.create({
                type: 'basic', iconUrl: 'icons/icon128.png',
                title: '下载任务已发送至 Aria2',
                message: `任务已添加：${outName}`
              });
            }
          })
          .catch((error) => {
            console.error('Failed to connect to Aria2 RPC service:', error);
            if (settings.showNotifications) {
              chrome.notifications.create({
                type: 'basic', iconUrl: 'icons/icon128.png',
                title: '无法连接到 Aria2',
                message: '请确保 Aria2 正在运行且配置正确。'
              });
            }
          });
      });
    });
  });
});


// --- 增强后的辅助函数：发送下载任务到 Aria2 ---
async function sendToAria2(downloadUrl, settings, options = {}) {
  if (!settings.rpcUrl) {
    console.error('Aria2 RPC URL not configured.');
    return;
  }

  // 组装 aria2.addUri 的 options
  const rpcOptions = {};
  if (options.header) rpcOptions.header = options.header;
  if (options.out) rpcOptions.out = options.out; // 关键：把最终文件名传给 aria2

  const rpcAuth = settings.rpcSecret ? `token:${settings.rpcSecret}` : undefined;

  const params = [[downloadUrl], rpcOptions];
  if (rpcAuth) params.unshift(rpcAuth);

  const rpcPayload = {
    jsonrpc: '2.0',
    id: `chrome-ext-${Date.now()}`,
    method: 'aria2.addUri',
    params
  };

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
    return;
  }

  console.log('Successfully sent to Aria2, GID:', data.result);
}
