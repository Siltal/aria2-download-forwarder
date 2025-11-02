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


// --- 监听右键菜单点击事件 ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveWithAria2") {
    // 获取所有需要的设置
    chrome.storage.sync.get(['rpcUrl', 'rpcSecret', 'showNotifications'], (settings) => {
      if (!settings.rpcUrl) {
          if (settings.showNotifications) { // 检查是否应显示通知
            chrome.notifications.create({
              type: 'basic', iconUrl: 'icons/icon128.png',
              title: 'Aria2 操作失败', message: '请先在扩展选项中配置 RPC 地址。'
            });
          }
          return;
      }
      const headers = [`Referer: ${info.pageUrl}`];
      sendToAria2(info.srcUrl, settings, { header: headers });
    });
  }
});


// --- 监听普通下载创建事件 ---
chrome.downloads.onCreated.addListener((downloadItem) => {
  // 获取所有需要的设置
  chrome.storage.sync.get(['isEnabled', 'showNotifications', 'rpcUrl', 'rpcSecret'], (settings) => {
    if (downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) {
      if (settings.showNotifications) { // 检查是否应显示通知
          chrome.notifications.create({
            type: 'basic', iconUrl: 'icons/icon128.png',
            title: '提示：使用浏览器默认下载', message: '此下载类型(blob/data)无法被接管，已自动切换为浏览器下载。'
          });
      }
      return;
    }

    if (!settings.isEnabled) {
      return;
    }
    
    chrome.downloads.cancel(downloadItem.id, () => {
      chrome.downloads.erase({ id: downloadItem.id });
    });
    
    sendToAria2(downloadItem.url, settings, {});
  });
});


// --- 增强后的辅助函数：发送下载任务到 Aria2 ---
async function sendToAria2(downloadUrl, settings, options = {}) {
  if (!settings.rpcUrl) {
    console.error('Aria2 RPC URL not configured.');
    return;
  }

  const rpcOptions = {};
  if (options.header) {
    rpcOptions.header = options.header;
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
    params: params
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
      if (settings.showNotifications) { // 检查是否应显示通知
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: 'Aria2 转发失败', message: `错误: ${data.error.message}`
        });
      }
    } else {
      console.log('Successfully sent to Aria2, GID:', data.result);
      if (settings.showNotifications) { // 检查是否应显示通知
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: '下载任务已发送至 Aria2', message: `任务已成功添加！`
        });
      }
    }
  } catch (error) {
    console.error('Failed to connect to Aria2 RPC service:', error);
    if (settings.showNotifications) { // 检查是否应显示通知
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon128.png',
        title: '无法连接到 Aria2', message: '请确保 Aria2 正在运行且配置正确。'
      });
    }
  }
}