document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const toggleNotifications = document.getElementById('toggleNotifications');
    const optionsLink = document.getElementById('openOptionsPage');

    // 启动时，从存储中加载所有相关状态
    chrome.storage.sync.get(['isEnabled', 'showNotifications'], (data) => {
        toggleSwitch.checked = data.isEnabled;
        toggleNotifications.checked = data.showNotifications;
    });

    // 监听“下载拦截”开关
    toggleSwitch.addEventListener('change', () => {
        chrome.storage.sync.set({ isEnabled: toggleSwitch.checked });
    });

    // 监听“显示通知”开关
    toggleNotifications.addEventListener('change', () => {
        chrome.storage.sync.set({ showNotifications: toggleNotifications.checked });
    });

    // 监听设置图标点击
    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
});