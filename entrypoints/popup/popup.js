// 引入频道关联管理工具
import { channelAssociation, ChannelAssociationManager } from '../../utils/channelAssociation.js';

// 获取当前标签页信息
async function getCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// 解析B站视频ID
function parseBilibiliUrl(url) {
    const match = url.match(/bilibili\.com\/video\/(BV\w+)/);
    return match ? match[1] : null;
}

// 获取YouTube视频ID
function getYouTubeVideoId(url) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
}

// 加载社交图标配置
async function loadSocialIconsConfig() {
    try {
        // 默认配置（作为fallback）
        const defaultConfig = {
            enableGrayscaleFilter: false,
            socialLinks: []
        };

        // 可以在这里添加远程配置URL
        const configUrl =
            'https://raw.githubusercontent.com/ahaduoduoduo/bilibili-youtube-danmaku/refs/heads/main/social-config.json'; // 例如: 'https://example.com/social-config.json'

        if (configUrl) {
            try {
                const response = await fetch(configUrl);
                if (response.ok) {
                    const config = await response.json();
                    return config;
                }
            } catch (error) {
                console.log('远程配置加载失败，使用默认配置:', error);
            }
        }

        return defaultConfig;
    } catch (error) {
        console.error('加载社交图标配置失败:', error);
        return { enableGrayscaleFilter: false, socialLinks: [] };
    }
}

// 渲染社交图标
function renderSocialIcons(config) {
    const socialIconsContainer = document.getElementById('social-icons');
    const socialIconsSimpleContainer = document.getElementById('social-icons-simple');

    const containers = [socialIconsContainer, socialIconsSimpleContainer].filter(Boolean);

    if (!config || !config.socialLinks || config.socialLinks.length === 0) {
        containers.forEach((container) => {
            container.style.display = 'none';
        });
        return;
    }

    containers.forEach((container) => {
        // 清空容器
        container.innerHTML = '';

        // 应用滤镜设置
        if (config.enableGrayscaleFilter) {
            container.classList.add('grayscale-filter');
        } else {
            container.classList.remove('grayscale-filter');
        }

        // 渲染每个图标
        config.socialLinks.forEach((link) => {
            const iconElement = document.createElement('div');
            iconElement.className = 'social-icon';
            const tooltipText = link.tooltip || link.name;
            iconElement.setAttribute('data-tooltip', tooltipText);

            const imgElement = document.createElement('img');
            imgElement.src = link.icon;
            imgElement.alt = link.name;
            imgElement.onerror = () => {
                // 如果图片加载失败，隐藏该图标
                iconElement.style.display = 'none';
            };

            iconElement.appendChild(imgElement);

            // 添加点击事件
            iconElement.addEventListener('click', () => {
                if (link.url) {
                    browser.tabs.create({ url: link.url });
                }
            });

            container.appendChild(iconElement);
        });

        // 显示容器
        container.style.display = 'flex';
    });
}

// 初始化社交图标
async function initSocialIcons() {
    try {
        const config = await loadSocialIconsConfig();
        renderSocialIcons(config);
    } catch (error) {
        console.error('初始化社交图标失败:', error);
    }
}

// 显示状态信息
function showStatus(message, type = 'loading') {
    const statusBar = document.getElementById('status-bar');
    statusBar.textContent = message;
    statusBar.className = `status-bar show ${type}`;

    if (type !== 'loading') {
        setTimeout(() => {
            statusBar.classList.remove('show');
        }, 3000);
    }
}

// 更新弹幕信息
function updateDanmakuInfo(count) {
    const info = document.getElementById('danmaku-info');
    if (count > 0) {
        info.textContent = `已加载 ${count} 条弹幕`;
        info.classList.add('show');
    } else {
        info.classList.remove('show');
    }
}

// 获取显示区域按钮组的值
function getDisplayAreaValue() {
    const activeBtn = document.querySelector('.display-area-btn.active');
    return parseInt(activeBtn ? activeBtn.dataset.value : '100');
}

// 设置显示区域按钮组的值
function setDisplayAreaValue(value) {
    // 移除所有按钮的选中状态
    document.querySelectorAll('.display-area-btn').forEach((btn) => {
        btn.classList.remove('active');
    });

    // 设置对应按钮为选中状态
    const targetBtn = document.querySelector(`.display-area-btn[data-value="${value}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }
}

// 保存设置
async function saveSettings() {
    // 优先使用输入框的值，如果没有则使用滑块的值
    const timeOffsetInput = document.getElementById('time-offset-input');
    const timeOffset =
        timeOffsetInput && timeOffsetInput.value !== ''
            ? parseFloat(timeOffsetInput.value) || 0
            : parseFloat(document.getElementById('time-offset').value);

    const settings = {
        enabled: document.getElementById('enable-danmaku').checked,
        timeOffset: timeOffset,
        opacity: parseInt(document.getElementById('opacity').value),
        fontSize: parseInt(document.getElementById('font-size').value),
        speed: parseFloat(document.getElementById('speed').value),
        trackSpacing: parseInt(document.getElementById('track-spacing').value),
        displayAreaPercentage: getDisplayAreaValue(),
        weightThreshold: parseInt(document.getElementById('weight-threshold').value)
    };

    await browser.storage.local.set({ danmakuSettings: settings });

    // 通知content script更新设置
    const tab = await getCurrentTab();
    if (tab && tab.url.includes('youtube.com')) {
        browser.tabs.sendMessage(tab.id, {
            type: 'updateSettings',
            settings: settings
        });
    }
}

// 加载设置
async function loadSettings() {
    const result = await browser.storage.local.get('danmakuSettings');
    const settings = result.danmakuSettings || {
        enabled: true,
        timeOffset: 0,
        opacity: 100,
        fontSize: 24,
        speed: 1.0,
        trackSpacing: 8,
        displayAreaPercentage: 100,
        weightThreshold: 5
    };

    document.getElementById('enable-danmaku').checked = settings.enabled;
    document.getElementById('time-offset').value = settings.timeOffset;

    // 同步手动输入框
    const timeOffsetInput = document.getElementById('time-offset-input');
    if (timeOffsetInput) {
        timeOffsetInput.value = settings.timeOffset;
    }

    document.getElementById('opacity').value = settings.opacity;
    document.getElementById('font-size').value = settings.fontSize;
    document.getElementById('speed').value = settings.speed || 1.0;
    document.getElementById('track-spacing').value = settings.trackSpacing || 8;
    setDisplayAreaValue(settings.displayAreaPercentage || 100);
    document.getElementById('weight-threshold').value = settings.weightThreshold ?? 5;

    updateSliderValues();
}

// 更新重置按钮显示状态
function updateResetButtonVisibility() {
    const timeOffsetValue = parseFloat(document.getElementById('time-offset').value) || 0;
    const resetBtn = document.getElementById('time-offset-reset');

    if (resetBtn) {
        resetBtn.style.display = timeOffsetValue !== 0 ? 'inline-block' : 'none';
    }
}

// 更新滑块显示值
function updateSliderValues() {
    const timeOffsetValue = document.getElementById('time-offset').value;

    // 更新手动输入框
    const timeOffsetInput = document.getElementById('time-offset-input');
    if (timeOffsetInput) {
        timeOffsetInput.value = timeOffsetValue;
    }

    // 更新重置按钮显示状态
    updateResetButtonVisibility();

    document.getElementById('opacity-value').textContent =
        document.getElementById('opacity').value + '%';
    document.getElementById('font-size-value').textContent =
        document.getElementById('font-size').value + 'px';
    document.getElementById('speed-value').textContent =
        document.getElementById('speed').value + 'x';
    document.getElementById('track-spacing-value').textContent =
        document.getElementById('track-spacing').value + 'px';

    const weightValue = document.getElementById('weight-threshold').value;
    document.getElementById('weight-threshold-value').textContent =
        weightValue === '0' ? '0（显示全部）' : `不显示${weightValue}级以下`;
}

// 下载弹幕
async function downloadDanmaku() {
    const url = document.getElementById('bilibili-url').value.trim();
    if (!url) {
        showStatus('请输入B站视频链接', 'error');
        return;
    }

    const bvid = parseBilibiliUrl(url);
    if (!bvid) {
        showStatus('无效的B站视频链接', 'error');
        return;
    }

    const tab = await getCurrentTab();
    if (!tab || !tab.url.includes('youtube.com/watch')) {
        showStatus('请在YouTube视频页面使用', 'error');
        return;
    }

    const youtubeVideoId = getYouTubeVideoId(tab.url);
    if (!youtubeVideoId) {
        showStatus('无法获取YouTube视频ID', 'error');
        return;
    }

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = true;
    showStatus('正在获取弹幕数据...', 'loading');

    try {
        // 发送消息给background script下载弹幕
        const response = await browser.runtime.sendMessage({
            type: 'downloadDanmaku',
            bvid: bvid,
            youtubeVideoId: youtubeVideoId
        });

        if (response.success) {
            showStatus(`成功下载 ${response.count} 条弹幕`, 'success');
            updateDanmakuInfo(response.count);

            // 重新加载当前页面的弹幕数据
            await checkCurrentPageDanmaku();

            // 通知content script加载弹幕
            browser.tabs.sendMessage(tab.id, {
                type: 'loadDanmaku',
                youtubeVideoId: youtubeVideoId
            });
        } else {
            showStatus(response.error || '下载失败', 'error');
        }
    } catch (error) {
        showStatus('下载出错：' + error.message, 'error');
    } finally {
        downloadBtn.disabled = false;
    }
}

// 检查当前页面弹幕状态
async function checkCurrentPageDanmaku() {
    const tab = await getCurrentTab();
    if (!tab || !tab.url.includes('youtube.com/watch')) {
        updateManualInputUI(false);
        return;
    }

    const youtubeVideoId = getYouTubeVideoId(tab.url);
    if (!youtubeVideoId) {
        updateManualInputUI(false);
        return;
    }

    // 检查是否已有弹幕数据
    const result = await browser.storage.local.get(youtubeVideoId);
    if (result[youtubeVideoId] && result[youtubeVideoId].danmakus) {
        const data = result[youtubeVideoId];
        document.getElementById('bilibili-url').value = data.bilibili_url || '';
        updateDanmakuInfo(data.danmakus.length);
        displayDanmakuList(data.danmakus);
        updateManualInputUI(true, data.bilibili_url);

        // 当检测到有弹幕数据时，清理可能残留的未匹配状态数据
        await browser.storage.local.remove(['pendingNoMatchResults', 'pendingSearchResults']);
    } else {
        updateManualInputUI(false);
    }
}

// 更新手动输入区域UI状态
function updateManualInputUI(hasData, bilibiliUrl = '', noMatchData = null) {
    const label = document.getElementById('bilibili-url-label');
    const viewBtn = document.getElementById('view-bilibili-btn');
    const spaceBtn = document.getElementById('view-bilibili-space-btn');

    if (noMatchData) {
        // 未匹配状态：显示提示和B站空间按钮
        label.textContent = '未匹配到B站视频，请手动输入视频链接';
        viewBtn.style.display = 'none';
        spaceBtn.style.display = 'block';
        spaceBtn.textContent = `查看 ${noMatchData.channelInfo.channelName} 的B站空间`;
        viewBtn.onclick = null;
        spaceBtn.onclick = () => openBilibiliSpace(noMatchData);
    } else if (hasData && bilibiliUrl) {
        // 有数据状态：显示已匹配视频
        label.textContent = '已匹配到B站视频，输入链接可手动匹配';
        viewBtn.style.display = 'block';
        spaceBtn.style.display = 'none';
        viewBtn.onclick = () => openBilibiliVideo(bilibiliUrl);
        spaceBtn.onclick = null;
    } else {
        // 默认状态：显示手动输入提示
        label.textContent = '或手动输入B站视频链接：';
        viewBtn.style.display = 'none';
        spaceBtn.style.display = 'none';
        viewBtn.onclick = null;
        spaceBtn.onclick = null;
    }
}

// 打开B站视频页面
function openBilibiliVideo(url) {
    if (url) {
        browser.tabs.create({ url: url });
    }
}

// 打开B站空间页面
async function openBilibiliSpace(noMatchData) {
    try {
        // 获取频道映射信息
        const association = await channelAssociation.getChannelAssociation(
            noMatchData.channelInfo.channelId
        );

        if (association && association.bilibiliUID) {
            const spaceUrl = `https://space.bilibili.com/${association.bilibiliUID}/video`;
            browser.tabs.create({ url: spaceUrl });
        } else {
            // 如果没有关联信息，显示提示
            showStatus('该频道尚未关联B站UP主，请先在关联区域设置', 'error');
        }
    } catch (error) {
        console.error('打开B站空间失败:', error);
        showStatus('打开B站空间失败', 'error');
    }
}

// 显示弹幕列表
function displayDanmakuList(danmakus) {
    const container = document.getElementById('danmaku-list-container');
    const list = document.getElementById('danmaku-list');

    if (!danmakus || danmakus.length === 0) {
        container.classList.remove('show');
        return;
    }

    container.classList.add('show');

    // 格式化时间
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // 渲染弹幕列表
    const renderList = (filterText = '') => {
        const filtered = filterText
            ? danmakus.filter((d) => d.text.toLowerCase().includes(filterText.toLowerCase()))
            : danmakus;

        list.innerHTML = filtered
            .map(
                (danmaku) => `
            <div class="danmaku-item" data-time="${danmaku.time}">
                <span class="danmaku-time">${formatTime(danmaku.time)}</span>
                <span class="danmaku-text">${danmaku.text}</span>
            </div>
        `
            )
            .join('');
    };

    renderList();

    // 搜索功能
    const searchInput = document.getElementById('danmaku-search');
    searchInput.addEventListener('input', (e) => {
        renderList(e.target.value);
    });

    // 点击跳转功能
    list.addEventListener('click', async (e) => {
        const item = e.target.closest('.danmaku-item');
        if (!item) return;

        const time = parseFloat(item.dataset.time);
        const tab = await getCurrentTab();

        if (tab && tab.url.includes('youtube.com')) {
            browser.tabs.sendMessage(tab.id, {
                type: 'seekToTime',
                time: time
            });
        }
    });
}

// 获取YouTube页面信息（增强版）
async function getPageInfo(useCache = true) {
    try {
        const tab = await getCurrentTab();
        if (!tab || !tab.url.includes('youtube.com/watch')) {
            return null;
        }

        // 优先从background获取缓存的准确信息
        if (useCache) {
            try {
                const backgroundResponse = await browser.runtime.sendMessage({
                    type: 'getPageInfoFromBackground'
                });

                if (backgroundResponse && backgroundResponse.success) {
                    console.log('从background获取页面信息成功:', {
                        videoId: backgroundResponse.data.videoId,
                        fromCache: backgroundResponse.fromCache
                    });

                    // 验证获取到的信息是否与当前页面匹配
                    const currentVideoId = getYouTubeVideoId(tab.url);
                    if (backgroundResponse.data.videoId === currentVideoId) {
                        return backgroundResponse.data;
                    } else {
                        console.warn('background缓存的视频ID与当前不匹配，fallback到直接获取');
                    }
                }
            } catch (error) {
                console.warn('从background获取页面信息失败，fallback到直接获取:', error);
            }
        }

        // fallback：直接从content script获取
        console.log('直接从content script获取页面信息');
        const response = await browser.tabs.sendMessage(tab.id, {
            type: 'getPageInfo'
        });

        if (response && response.success) {
            // 验证获取到的信息
            const currentVideoId = getYouTubeVideoId(tab.url);
            if (response.data.videoId === currentVideoId) {
                return response.data;
            } else {
                console.error('获取到的页面信息与当前页面不匹配', {
                    expected: currentVideoId,
                    actual: response.data.videoId
                });
                return null;
            }
        }
        return null;
    } catch (error) {
        console.error('获取页面信息失败:', error);
        return null;
    }
}

// 智能搜索并关联功能
async function smartSearchAndAssociate() {
    try {
        const pageInfo = await getPageInfo();
        if (!pageInfo || !pageInfo.channel.success) {
            showStatus('无法获取当前频道信息', 'error');
            return;
        }

        const channelName = pageInfo.channel.channelName;
        const videoTitle = pageInfo.videoTitle;
        const videoId = pageInfo.videoId;

        if (!channelName || !videoTitle) {
            showStatus('无法获取频道名称或视频标题', 'error');
            return;
        }

        showStatus('正在搜索B站UP主...', 'loading');

        // 第一步：搜索UP主
        const userSearchResponse = await browser.runtime.sendMessage({
            type: 'searchBilibiliUser',
            keyword: channelName
        });

        if (userSearchResponse.success && userSearchResponse.results.length > 0) {
            // 找到UP主，显示搜索结果
            displayUserSearchResults(userSearchResponse.results, pageInfo);
        } else {
            // 没找到UP主，进行视频全站搜索
            showStatus('未找到对应UP主，正在搜索相关视频...', 'loading');

            const videoSearchResponse = await browser.runtime.sendMessage({
                type: 'searchBilibiliVideoGlobal',
                keyword: videoTitle
            });

            if (videoSearchResponse.success && videoSearchResponse.results.length > 0) {
                displayVideoSearchResults(videoSearchResponse.results, videoId);
            } else {
                showStatus('未找到匹配的UP主或视频', 'error');
            }
        }
    } catch (error) {
        console.error('智能搜索失败:', error);
        showStatus('智能搜索失败：' + error.message, 'error');
    }
}

// 显示UP主搜索结果
function displayUserSearchResults(users, pageInfo) {
    const searchResults = document.getElementById('search-results');
    const searchStatus = document.getElementById('search-status');
    const searchList = document.getElementById('search-list');

    searchResults.style.display = 'block';
    searchStatus.textContent = `找到${users.length}个可能的UP主，请选择：`;

    searchList.innerHTML = users
        .map(
            (user) => `
        <div class="search-item user-item" data-mid="${user.mid}" data-space-url="${user.spaceUrl}">
            <div class="search-item-cover">
                <img src="${user.face.startsWith('https:') ? user.face : 'https:' + user.face}" alt="${user.uname}" onerror="this.style.display='none'">
            </div>
            <div class="search-item-content">
                <div class="search-item-title">${user.uname}</div>
                <div class="search-item-info">
                    ${user.fans > 10000 ? (user.fans / 10000).toFixed(1) + '万' : user.fans} 粉丝 · ${user.videos} 个视频
                </div>
                ${user.usign ? `<div class="search-item-info">${user.usign}</div>` : ''}
            </div>
        </div>
    `
        )
        .join('');

    // 绑定点击事件
    searchList.querySelectorAll('.user-item').forEach((item) => {
        item.addEventListener('click', async () => {
            const mid = item.dataset.mid;
            const spaceUrl = item.dataset.spaceUrl;

            // 关联UP主
            const associationData = {
                bilibiliUID: mid,
                bilibiliName: item.querySelector('.search-item-title').textContent,
                bilibiliSpaceUrl: spaceUrl
            };

            const success = await channelAssociation.saveChannelAssociation(
                pageInfo.channel.channelId,
                associationData
            );
            if (success) {
                showStatus('关联成功', 'success');
                searchResults.style.display = 'none';
                checkAssociation(pageInfo.channel.channelId);

                // 关联成功后自动搜索弹幕
                setTimeout(() => {
                    autoSearchDanmaku(true);
                }, 500);
            } else {
                showStatus('关联失败', 'error');
            }
        });
    });
}

// 显示全站视频搜索结果
function displayVideoSearchResults(videos, youtubeVideoId) {
    const searchResults = document.getElementById('search-results');
    const searchStatus = document.getElementById('search-status');
    const searchList = document.getElementById('search-list');

    searchResults.style.display = 'block';
    searchStatus.textContent = `找到${videos.length}个相关视频：`;

    searchList.innerHTML = videos
        .map(
            (video) => `
        <div class="search-item video-item" data-bvid="${video.bvid}" data-mid="${video.mid}" data-author="${video.author}">
            <div class="search-item-cover">
                <img src="${video.pic}" alt="${video.title}" onerror="this.style.display='none'">
            </div>
            <div class="search-item-content">
                <div class="search-item-title">${video.title}</div>
                <div class="search-item-info">UP主: ${video.author} · ${video.pubdate}</div>
            </div>
        </div>
    `
        )
        .join('');

    // 绑定点击事件
    searchList.querySelectorAll('.video-item').forEach((item) => {
        item.addEventListener('click', () => {
            const bvid = item.dataset.bvid;
            const mid = item.dataset.mid;
            const author = item.dataset.author;

            // 显示选项：直接下载弹幕或关联UP主
            if (
                confirm(
                    `是否关联UP主 "${author}"？\n\n点击"确定"将关联此UP主，方便后续自动搜索。\n点击"取消"仅下载本视频弹幕。`
                )
            ) {
                // 关联UP主
                (async () => {
                    const pageInfo = await getPageInfo();
                    if (pageInfo && pageInfo.channel.success) {
                        const associationData = {
                            bilibiliUID: mid,
                            bilibiliName: author,
                            bilibiliSpaceUrl: `https://space.bilibili.com/${mid}`
                        };

                        const success = await channelAssociation.saveChannelAssociation(
                            pageInfo.channel.channelId,
                            associationData
                        );
                        if (success) {
                            showStatus('关联成功，正在下载弹幕...', 'loading');
                            downloadDanmakuFromBV(bvid, youtubeVideoId);
                        }
                    }
                })();
            } else {
                // 仅下载弹幕
                downloadDanmakuFromBV(bvid, youtubeVideoId);
            }
        });
    });
}

// 显示频道信息
function displayChannelInfo(pageInfo) {
    const channelInfoDiv = document.getElementById('channel-info');
    const associationSection = document.getElementById('association-section');
    const manualInputSection = document.getElementById('manual-input');

    if (!pageInfo || !pageInfo.channel.success) {
        channelInfoDiv.style.display = 'none';
        associationSection.style.display = 'none';
        return;
    }

    const { channel } = pageInfo;

    // 检查是否为MadeByBilibili频道
    const isBangumiChannel =
        channel.channelId === '@MadeByBilibili' || channel.channelName === 'MadeByBilibili';

    // 显示频道信息
    document.getElementById('channel-avatar').src = channel.channelAvatar || '';
    // 番剧频道显示特殊名称
    document.getElementById('channel-name').textContent = isBangumiChannel
        ? '哔哩哔哩动画'
        : channel.channelName || '未知频道';
    document.getElementById('channel-id').textContent = `ID: ${channel.channelId || '未知'}`;

    channelInfoDiv.style.display = 'block';

    if (isBangumiChannel) {
        // 显示番剧专用UI，隐藏关联相关区域
        associationSection.style.display = 'none';
        manualInputSection.style.display = 'none';

        // 隐藏关联状态（未关联按钮等）
        const associationStatus = document.getElementById('association-status');
        if (associationStatus) {
            associationStatus.style.display = 'none';
        }

        displayBangumiInterface(pageInfo);
    } else {
        // 显示普通关联UI
        associationSection.style.display = 'block';
        manualInputSection.style.display = 'block';

        // 显示关联状态
        const associationStatus = document.getElementById('association-status');
        if (associationStatus) {
            associationStatus.style.display = 'block';
        }

        // 检查是否已关联
        checkAssociation(channel.channelId);
    }
}

// 检查关联状态
async function checkAssociation(channelId) {
    try {
        const association = await channelAssociation.getChannelAssociation(channelId);

        const statusText = document.querySelector('.status-text');
        const associationSection = document.getElementById('association-section');
        const associatedInfoDiv = document.getElementById('associated-info');
        const associatedUid = document.getElementById('associated-uid');

        if (association) {
            // 已关联 - 隐藏关联卡片，显示UID信息
            statusText.style.display = 'none';
            associationSection.style.display = 'none';
            associatedInfoDiv.style.display = 'flex';

            const originalText = `已关联：${association.bilibiliUID}`;
            associatedUid.textContent = originalText;

            // 绑定点击取消关联事件
            associatedInfoDiv.onclick = () => unassociateUploader();

            // 添加悬停文字变化效果
            associatedInfoDiv.onmouseenter = () => {
                associatedUid.textContent = '解除关联';
            };

            associatedInfoDiv.onmouseleave = () => {
                associatedUid.textContent = originalText;
            };
        } else {
            // 未关联
            statusText.textContent = '未关联';
            statusText.style.display = 'inline-block';
            statusText.classList.remove('associated');
            associationSection.style.display = 'block';
            associatedInfoDiv.style.display = 'none';
            associatedInfoDiv.onclick = null;
            associatedInfoDiv.onmouseenter = null;
            associatedInfoDiv.onmouseleave = null;
        }
    } catch (error) {
        console.error('检查关联状态失败:', error);
    }
}

// 解析B站空间链接 - 现在使用工具类方法
function parseBilibiliSpaceUrl(url) {
    if (typeof channelAssociation !== 'undefined') {
        return channelAssociation.parseBilibiliSpaceUrl(url);
    }
    // 降级处理
    const match = url.match(/space\.bilibili\.com\/(\d+)/);
    return match ? match[1] : null;
}

// 关联UP主
async function associateUploader() {
    const spaceUrl = document.getElementById('bilibili-space-url').value.trim();
    if (!spaceUrl) {
        showStatus('请输入B站UP主空间链接', 'error');
        return;
    }

    const bilibiliUID = parseBilibiliSpaceUrl(spaceUrl);
    if (!bilibiliUID) {
        showStatus('无效的B站空间链接', 'error');
        return;
    }

    try {
        // 获取当前频道信息
        const pageInfo = await getPageInfo();
        if (!pageInfo || !pageInfo.channel.success) {
            showStatus('无法获取当前频道信息', 'error');
            return;
        }

        const channelId = pageInfo.channel.channelId;

        // 验证B站空间是否有效（可选）
        showStatus('正在验证B站空间...', 'loading');

        // 保存关联
        const associationData = {
            bilibiliUID: bilibiliUID,
            bilibiliName: '', // 可以后续获取
            bilibiliSpaceUrl: spaceUrl
        };

        const success = await channelAssociation.saveChannelAssociation(channelId, associationData);
        if (!success) {
            throw new Error('保存关联信息失败');
        }

        showStatus('关联成功', 'success');

        // 刷新关联状态显示
        checkAssociation(channelId);
    } catch (error) {
        console.error('关联失败:', error);
        showStatus('关联失败：' + error.message, 'error');
    }
}

// 取消关联
async function unassociateUploader() {
    try {
        const pageInfo = await getPageInfo();
        if (!pageInfo || !pageInfo.channel.success) {
            showStatus('无法获取当前频道信息', 'error');
            return;
        }

        const channelId = pageInfo.channel.channelId;

        const success = await channelAssociation.removeChannelAssociation(channelId);
        if (!success) {
            throw new Error('删除关联信息失败');
        }

        showStatus('已取消关联', 'success');

        // 刷新关联状态显示
        checkAssociation(channelId);
    } catch (error) {
        console.error('取消关联失败:', error);
        showStatus('取消关联失败：' + error.message, 'error');
    }
}

// 自动搜索弹幕
async function autoSearchDanmaku(silent = false) {
    try {
        const pageInfo = await getPageInfo();
        if (!pageInfo || !pageInfo.channel.success) {
            if (!silent) showStatus('无法获取当前频道信息', 'error');
            return false;
        }

        const channelId = pageInfo.channel.channelId;
        const videoTitle = pageInfo.videoTitle;

        if (!videoTitle) {
            if (!silent) showStatus('无法获取视频标题', 'error');
            return false;
        }

        // 获取关联信息
        const association = await channelAssociation.getChannelAssociation(channelId);

        if (!association) {
            if (!silent) showStatus('尚未关联B站UP主', 'error');
            return false;
        }

        if (!silent) showStatus('正在搜索B站视频...', 'loading');

        // 发送搜索请求到background script
        const searchResponse = await browser.runtime.sendMessage({
            type: 'searchBilibiliVideo',
            bilibiliUID: association.bilibiliUID,
            videoTitle: videoTitle,
            youtubeVideoId: pageInfo.videoId
        });

        if (searchResponse.success) {
            displaySearchResults(searchResponse.results, pageInfo.videoId);
            return true;
        } else {
            if (!silent) showStatus(searchResponse.error || '搜索失败', 'error');
            return false;
        }
    } catch (error) {
        console.error('自动搜索失败:', error);
        if (!silent) showStatus('搜索失败：' + error.message, 'error');
        return false;
    }
}

// 显示搜索结果
function displaySearchResults(results, youtubeVideoId) {
    const searchResults = document.getElementById('search-results');
    const searchStatus = document.getElementById('search-status');
    const searchList = document.getElementById('search-list');

    searchResults.style.display = 'block';

    if (results.length === 0) {
        searchStatus.textContent = '未找到匹配的视频';
        searchList.innerHTML = '';
    } else if (results.length === 1) {
        searchStatus.textContent = '找到1个匹配视频，正在自动下载弹幕...';
        searchList.innerHTML = '';
        // 自动下载单个结果（也会自动关闭）
        downloadDanmakuFromBV(results[0].bvid, youtubeVideoId);
    } else {
        searchStatus.textContent = `找到${results.length}个匹配视频，请选择：`;
        searchList.innerHTML = results
            .map(
                (video, index) => `
            <div class="search-item" data-bvid="${video.bvid}">
                <div class="search-item-cover">
                    <img src="${video.pic || ''}" alt="视频封面" onerror="this.style.display='none'">
                </div>
                <div class="search-item-content">
                    <div class="search-item-title">${video.title}</div>
                    <div class="search-item-info">发布: ${video.pubdate}</div>
                </div>
            </div>
        `
            )
            .join('');

        // 绑定点击事件
        searchList.querySelectorAll('.search-item').forEach((item) => {
            item.addEventListener('click', () => {
                const bvid = item.dataset.bvid;

                // 立即显示loading状态
                item.classList.add('loading');

                // 禁用其他选项
                searchList.querySelectorAll('.search-item').forEach((otherItem) => {
                    if (otherItem !== item) {
                        otherItem.style.opacity = '0.3';
                        otherItem.style.pointerEvents = 'none';
                    }
                });

                // 显示下载状态
                showStatus('正在下载弹幕，请稍候...', 'loading');

                // 开始下载
                downloadDanmakuFromBV(bvid, youtubeVideoId);
            });
        });
    }
}

// 检查待显示的搜索结果（作为备用方案）
async function checkPendingSearchResults() {
    try {
        const result = await browser.storage.local.get('pendingSearchResults');
        const pendingResults = result.pendingSearchResults;

        if (pendingResults && pendingResults.results && pendingResults.results.length > 0) {
            console.log('发现待显示的搜索结果:', pendingResults.results.length);

            // 显示搜索结果
            displaySearchResults(pendingResults.results, pendingResults.youtubeVideoId);

            // 显示相关信息
            showStatus(`找到 ${pendingResults.results.length} 个匹配的B站视频，请选择：`, 'info');

            // 清理已显示的结果
            await browser.storage.local.remove('pendingSearchResults');
        }
    } catch (error) {
        console.error('检查待显示搜索结果失败:', error);
    }
}

// 检查待显示的未匹配结果（作为备用方案）
async function checkPendingNoMatchResults() {
    try {
        const result = await browser.storage.local.get('pendingNoMatchResults');
        const pendingNoMatchResults = result.pendingNoMatchResults;

        if (pendingNoMatchResults) {
            console.log('发现待显示的未匹配结果:', pendingNoMatchResults.channelInfo);

            // 更新手动输入UI显示未匹配状态
            updateManualInputUI(false, '', pendingNoMatchResults);

            // 显示相关信息
            showStatus('未找到匹配的B站视频，请手动输入或查看B站空间', 'info');

            // 清理已显示的结果
            await browser.storage.local.remove('pendingNoMatchResults');
        }
    } catch (error) {
        console.error('检查待显示未匹配结果失败:', error);
    }
}

// 解析番剧标题和集数
function parseBangumiTitle(videoTitle) {
    // 匹配 《标题》第x话：格式，确保"话"后面有冒号
    const match = videoTitle.match(/《(.+?)》第(\d+)话：/);
    if (match) {
        return {
            title: match[1].trim(),
            episode: parseInt(match[2]),
            isValid: true
        };
    }
    return { isValid: false };
}

// 显示番剧界面
function displayBangumiInterface(pageInfo) {
    // 保存当前页面信息供其他函数使用
    currentPageInfo = pageInfo;

    // 创建番剧专用的界面元素
    const existingBangumiSection = document.getElementById('bangumi-section');
    if (existingBangumiSection) {
        existingBangumiSection.remove();
    }

    // 解析当前视频标题
    const videoTitle = pageInfo.videoTitle;
    const parseResult = parseBangumiTitle(videoTitle);

    const bangumiSection = document.createElement('div');
    bangumiSection.id = 'bangumi-section';
    bangumiSection.className = 'association-section';

    if (parseResult.isValid) {
        // 解析成功：显示完整信息和更新按钮
        bangumiSection.innerHTML = `
            <div class="association-header">
                <h3>BillBili 原创番剧-《${parseResult.title}》-第${parseResult.episode}话</h3>
            </div>
            <div class="input-group">
                <div class="button-group">
                    <button id="update-bangumi-btn" style="background-color: #fb7299;">更新弹幕</button>
                </div>
            </div>
        `;

        // 插入到频道信息后面
        const channelInfo = document.getElementById('channel-info');
        channelInfo.parentNode.insertBefore(bangumiSection, channelInfo.nextSibling);

        // 绑定按钮事件和悬停效果
        const updateButton = document.getElementById('update-bangumi-btn');
        updateButton.onclick = () =>
            downloadBangumiDanmakuFromUI(parseResult.title, parseResult.episode, pageInfo.videoId);

        // 添加悬停效果
        updateButton.onmouseenter = () => {
            updateButton.style.backgroundColor = '#f25d8e';
        };
        updateButton.onmouseleave = () => {
            updateButton.style.backgroundColor = '#fb7299';
        };
    } else {
        // 解析失败：只显示标题，无按钮
        bangumiSection.innerHTML = `
            <div class="association-header">
                <h3>未识别到番剧正片</h3>
            </div>
        `;

        // 插入到频道信息后面
        const channelInfo = document.getElementById('channel-info');
        channelInfo.parentNode.insertBefore(bangumiSection, channelInfo.nextSibling);
    }
}

// 获取当前页面信息（简化版本）
let currentPageInfo = null;
function getCurrentPageInfo() {
    return currentPageInfo;
}

// 从UI下载番剧弹幕
async function downloadBangumiDanmakuFromUI(title, episodeNumber, youtubeVideoId) {
    try {
        const updateButton = document.getElementById('update-bangumi-btn');
        updateButton.disabled = true;
        updateButton.textContent = '更新中...';

        const response = await browser.runtime.sendMessage({
            type: 'downloadBangumiDanmaku',
            title: title,
            episodeNumber: episodeNumber,
            youtubeVideoId: youtubeVideoId
        });

        if (response.success) {
            updateDanmakuInfo(response.count);

            // 重新加载当前页面的弹幕数据
            await checkCurrentPageDanmaku();

            // 通知content script加载弹幕
            const tab = await getCurrentTab();
            if (tab && tab.url.includes('youtube.com')) {
                browser.tabs.sendMessage(tab.id, {
                    type: 'loadDanmaku',
                    youtubeVideoId: youtubeVideoId
                });
            }

            updateButton.textContent = `更新完成（${response.count}条）`;

            // 1秒后自动关闭popup
            setTimeout(() => {
                console.log('番剧弹幕下载成功，自动关闭popup');
                window.close();
            }, 1000);
        } else {
            showStatus(response.error || '下载失败', 'error');
            updateButton.textContent = '重试更新';
        }
    } catch (error) {
        console.error('下载番剧弹幕失败:', error);
        showStatus('下载失败：' + error.message, 'error');

        const updateButton = document.getElementById('update-bangumi-btn');
        updateButton.textContent = '重试更新';
    } finally {
        const updateButton = document.getElementById('update-bangumi-btn');
        updateButton.disabled = false;
    }
}

// 从BVID下载弹幕
async function downloadDanmakuFromBV(bvid, youtubeVideoId = null) {
    try {
        // 总是需要获取tab对象，因为后续需要tab.id发送消息给content script
        console.log('获取当前标签页信息...');
        const tab = await getCurrentTab();

        if (!tab || !tab.url) {
            showStatus('无法获取当前标签页信息', 'error');
            return;
        }

        // 如果没有传入youtubeVideoId，从当前标签页获取
        if (!youtubeVideoId) {
            console.log('未传入youtubeVideoId，从当前标签页获取...');
            youtubeVideoId = getYouTubeVideoId(tab.url);
        }

        if (!youtubeVideoId) {
            showStatus('无法获取YouTube视频ID', 'error');
            return;
        }

        // 验证当前确实在YouTube视频页面
        if (!tab.url.includes('youtube.com/watch')) {
            showStatus('请在YouTube视频页面使用此功能', 'error');
            return;
        }

        console.log('下载弹幕 - BVID:', bvid, 'YouTube视频ID:', youtubeVideoId);

        showStatus('正在下载弹幕...', 'loading');

        const response = await browser.runtime.sendMessage({
            type: 'downloadDanmaku',
            bvid: bvid,
            youtubeVideoId: youtubeVideoId
        });

        if (response.success) {
            showStatus(`成功下载 ${response.count} 条弹幕，正在加载...`, 'success');
            updateDanmakuInfo(response.count);

            // 重新加载当前页面的弹幕数据
            await checkCurrentPageDanmaku();

            // 通知content script加载弹幕
            browser.tabs.sendMessage(tab.id, {
                type: 'loadDanmaku',
                youtubeVideoId: youtubeVideoId
            });

            // 隐藏搜索结果
            document.getElementById('search-results').style.display = 'none';

            // 清理后台的搜索结果数据
            browser.runtime
                .sendMessage({ type: 'clearSearchResults' })
                .catch((error) => console.log('清理搜索结果失败:', error));

            // 显示完成状态，然后自动关闭popup
            setTimeout(() => {
                showStatus('弹幕已加载完成', 'success');
                setTimeout(() => {
                    console.log('下载成功，自动关闭popup');
                    window.close();
                }, 800); // 显示成功状态0.8秒后关闭
            }, 300); // 先延迟0.3秒显示完成状态
        } else {
            showStatus(response.error || '下载失败', 'error');
        }
    } catch (error) {
        console.error('下载弹幕失败:', error);
        showStatus('下载失败：' + error.message, 'error');
    }
}

// 立即设置消息监听器，不等待DOM加载
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'displayMultipleResults') {
        console.log('收到搜索结果消息:', request.data.results.length);

        // 如果DOM还未加载完成，等待一下
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                displaySearchResults(request.data.results, request.data.youtubeVideoId);
                showStatus(`找到 ${request.data.results.length} 个匹配的B站视频，请选择：`, 'info');
            });
        } else {
            // DOM已就绪，直接显示
            displaySearchResults(request.data.results, request.data.youtubeVideoId);
            showStatus(`找到 ${request.data.results.length} 个匹配的B站视频，请选择：`, 'info');
        }

        sendResponse({ success: true });
    } else if (request.type === 'displayNoMatchResults') {
        console.log('收到未匹配结果消息:', request.data);

        // 如果DOM还未加载完成，等待一下
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateManualInputUI(false, '', request.data);
                showStatus('未找到匹配的B站视频，请手动输入或查看B站空间', 'info');
            });
        } else {
            // DOM已就绪，直接显示
            updateManualInputUI(false, '', request.data);
            showStatus('未找到匹配的B站视频，请手动输入或查看B站空间', 'info');
        }

        sendResponse({ success: true });
    }

    return true; // 保持消息通道开启
});

// 消息监听器设置完成后，立即通知background popup已准备好
console.log('消息监听器已设置，通知background popup准备完成');
browser.runtime
    .sendMessage({ type: 'popupReady' })
    .then((response) => {
        if (response && response.success) {
            console.log('成功通知background popup已准备完成');
        } else {
            console.log('background暂无待显示的搜索结果');
        }
    })
    .catch((error) => {
        console.log('通知background失败:', error);
    });

// 检查是否为YouTube页面并切换界面
async function checkPageTypeAndToggleUI() {
    const tab = await getCurrentTab();
    const isYouTubePage = tab && tab.url && tab.url.includes('youtube.com');

    const simpleContainer = document.getElementById('simple-container');
    const mainContainer = document.getElementById('main-container');

    if (isYouTubePage) {
        // 是YouTube页面，显示完整功能界面
        mainContainer.style.display = 'block';
        simpleContainer.style.display = 'none';
        return true;
    } else {
        // 不是YouTube页面，显示简化界面
        mainContainer.style.display = 'none';
        simpleContainer.style.display = 'block';
        return false;
    }
}

// 显示页面信息刷新按钮
function showPageInfoRefreshButton() {
    const channelInfoDiv = document.getElementById('channel-info');
    if (!channelInfoDiv) return;

    // 检查是否已经有刷新按钮
    if (document.getElementById('refresh-page-info-btn')) return;

    channelInfoDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <p style="color: #666; margin-bottom: 10px;">无法获取当前页面信息</p>
            <button id="refresh-page-info-btn" style="
                background-color: #ff4444; 
                color: white; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 4px; 
                cursor: pointer;
            ">刷新页面信息</button>
        </div>
    `;

    // 绑定刷新事件
    document.getElementById('refresh-page-info-btn').addEventListener('click', async () => {
        const button = document.getElementById('refresh-page-info-btn');
        const originalText = button.textContent;

        button.textContent = '刷新中...';
        button.disabled = true;

        try {
            // 强制重新获取页面信息（不使用缓存）
            const pageInfo = await getPageInfo(false);

            if (pageInfo) {
                displayChannelInfo(pageInfo);
                showStatus('页面信息已刷新', 'success');
            } else {
                showStatus('仍无法获取页面信息，请稍后重试', 'error');
                button.textContent = originalText;
                button.disabled = false;
            }
        } catch (error) {
            console.error('刷新页面信息失败:', error);
            showStatus('刷新失败: ' + error.message, 'error');
            button.textContent = originalText;
            button.disabled = false;
        }
    });

    channelInfoDiv.style.display = 'block';
}

// 打开YouTube主页
function openYouTube() {
    browser.tabs.create({ url: 'https://www.youtube.com' });
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 首先检查页面类型并切换界面
    const isYouTubePage = await checkPageTypeAndToggleUI();

    // 初始化社交图标（无论是否为YouTube页面都显示）
    await initSocialIcons();

    // 绑定YouTube按钮事件
    document.getElementById('open-youtube-btn').addEventListener('click', openYouTube);

    // 如果不是YouTube页面，不需要执行后续的初始化逻辑
    if (!isYouTubePage) {
        return;
    }

    await loadSettings();
    await checkCurrentPageDanmaku();

    // 获取并显示页面信息
    const pageInfo = await getPageInfo();
    displayChannelInfo(pageInfo);

    // 如果获取页面信息失败，显示刷新按钮
    if (!pageInfo) {
        showPageInfoRefreshButton();
    }

    // 检查storage中的备用数据（防止遗漏）
    await checkPendingSearchResults();
    await checkPendingNoMatchResults();

    // 绑定事件
    document.getElementById('download-btn').addEventListener('click', downloadDanmaku);
    document.getElementById('associate-btn').addEventListener('click', associateUploader);
    document.getElementById('unassociate-btn').addEventListener('click', unassociateUploader);
    document.getElementById('auto-search-btn').addEventListener('click', autoSearchDanmaku);
    document.getElementById('smart-search-btn').addEventListener('click', smartSearchAndAssociate);

    // 设置变更事件
    document.getElementById('enable-danmaku').addEventListener('change', saveSettings);
    document.getElementById('time-offset').addEventListener('input', () => {
        updateSliderValues();
        saveSettings();
    });

    // 手动输入框事件监听器
    const timeOffsetInput = document.getElementById('time-offset-input');
    if (timeOffsetInput) {
        timeOffsetInput.addEventListener('input', () => {
            let value = parseFloat(timeOffsetInput.value) || 0;

            // 同步滑块（滑块有范围限制-60到60）
            const sliderValue = Math.max(-60, Math.min(60, value));
            document.getElementById('time-offset').value = sliderValue;

            // 更新重置按钮显示状态
            updateResetButtonVisibility();

            saveSettings();
        });

        timeOffsetInput.addEventListener('blur', () => {
            // 失去焦点时确保数值有效
            let value = parseFloat(timeOffsetInput.value) || 0;

            // 同步滑块（滑块有范围限制-60到60）
            const sliderValue = Math.max(-60, Math.min(60, value));
            document.getElementById('time-offset').value = sliderValue;

            // 更新重置按钮显示状态
            updateResetButtonVisibility();

            saveSettings();
        });
    }

    // 重置按钮事件监听器
    const timeOffsetResetBtn = document.getElementById('time-offset-reset');
    if (timeOffsetResetBtn) {
        timeOffsetResetBtn.addEventListener('click', () => {
            document.getElementById('time-offset').value = 0;
            if (timeOffsetInput) {
                timeOffsetInput.value = 0;
            }
            // 重置后隐藏按钮
            updateResetButtonVisibility();
            saveSettings();
        });
    }
    document.getElementById('opacity').addEventListener('input', () => {
        updateSliderValues();
        saveSettings();
    });
    document.getElementById('font-size').addEventListener('input', () => {
        updateSliderValues();
        saveSettings();
    });
    document.getElementById('speed').addEventListener('input', () => {
        updateSliderValues();
        saveSettings();
    });
    document.getElementById('track-spacing').addEventListener('input', () => {
        updateSliderValues();
        saveSettings();
    });

    // 显示区域按钮组事件
    document.querySelectorAll('.display-area-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            // 移除所有按钮的选中状态
            document.querySelectorAll('.display-area-btn').forEach((b) => {
                b.classList.remove('active');
            });

            // 设置当前按钮为选中状态
            btn.classList.add('active');

            // 保存设置
            saveSettings();
        });
    });

    document.getElementById('weight-threshold').addEventListener('input', () => {
        updateSliderValues();
        saveSettings();
    });
});
