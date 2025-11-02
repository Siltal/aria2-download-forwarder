// 保存选项到 chrome.storage
function save_options() {
  const rpcUrl = document.getElementById('rpc-url').value;
  const rpcSecret = document.getElementById('rpc-secret').value;
  const isEnabled = document.getElementById('interception-enabled').checked;
  const showNotifications = document.getElementById('show-notifications').checked;

  chrome.storage.sync.set({
    rpcUrl: rpcUrl,
    rpcSecret: rpcSecret,
    isEnabled: isEnabled,
    showNotifications: showNotifications
  }, () => {
    // 更新状态消息
    const status = document.getElementById('status');
    status.textContent = '设置已保存。';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

// 从 chrome.storage 加载已保存的选项
function restore_options() {
  // 设置默认值
  chrome.storage.sync.get({
    rpcUrl: 'http://127.0.0.1:6800/jsonrpc',
    rpcSecret: '',
    isEnabled: true,
    showNotifications: true
  }, (items) => {
    document.getElementById('rpc-url').value = items.rpcUrl;
    document.getElementById('rpc-secret').value = items.rpcSecret;
    document.getElementById('interception-enabled').checked = items.isEnabled;
    document.getElementById('show-notifications').checked = items.showNotifications;
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);