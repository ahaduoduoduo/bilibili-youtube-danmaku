let danmakuEngine = null;
let currentVideoId = null;
let currentPageInfo = null;
let pageInfoCache = new Map();

// 获取YouTube视频ID
function getVideoId() {
    const match = window.location.href.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
}

// 获取YouTube频道信息（增强版）
function getChannelInfo(retryCount = 0) {
    try {
        // 尝试多种方式获取频道信息
        let channelName = '';
        let channelId = '';
        let channelAvatar = '';

        // 统一从频道链接元素获取名称和ID
        const nameSelectors = [
            'yt-formatted-string.ytd-channel-name a',
            '#channel-name .ytd-channel-name a',
            '.ytd-video-owner-renderer .ytd-channel-name a',
            'ytd-channel-name a',
            '#owner-sub-count a',
            '.ytd-channel-name a'
        ];

        for (const selector of nameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                channelName = element.textContent.trim();

                // 同时从该元素获取频道ID
                if (element.href) {
                    // 优先匹配 @username 格式
                    let match = element.href.match(/@([^\/\?#]+)/);
                    if (match) {
                        channelId = '@' + match[1];
                    } else {
                        // 备选：匹配 /channel/UC... 格式
                        match = element.href.match(/channel\/([^\/\?#]+)/);
                        if (match) {
                            channelId = match[1];
                        }
                    }
                }

                // 如果获取到了名称和ID，结束循环
                if (channelName && channelId) {
                    break;
                }
            }
        }

        // 如果上面没有获取到ID，尝试查找其他包含频道链接的元素
        if (!channelId) {
            const channelElements = document.querySelectorAll(
                'a[href*="/@"], a[href*="/channel/"]'
            );
            for (const element of channelElements) {
                if (element.href) {
                    // 优先匹配 @username 格式
                    let match = element.href.match(/@([^\/\?#]+)/);
                    if (match) {
                        channelId = '@' + match[1];
                        break;
                    } else {
                        // 备选：匹配 /channel/UC... 格式
                        match = element.href.match(/channel\/([^\/\?#]+)/);
                        if (match) {
                            channelId = match[1];
                            break;
                        }
                    }
                }
            }
        }

        // 获取频道头像
        const avatarSelectors = [
            '#avatar img',
            '.ytd-video-owner-renderer img',
            'yt-img-shadow img[alt*="avatar"], yt-img-shadow img[alt*="Avatar"]'
        ];

        for (const selector of avatarSelectors) {
            const element = document.querySelector(selector);
            if (element && element.src) {
                channelAvatar = element.src;
                break;
            }
        }

        // 如果信息不完整且重试次数小于2，则重试
        if ((!channelId || !channelName) && retryCount < 2) {
            console.log(`频道信息不完整，${500 * (retryCount + 1)}ms后重试 (${retryCount + 1}/2)`);
            return new Promise((resolve) => {
                setTimeout(
                    () => {
                        resolve(getChannelInfo(retryCount + 1));
                    },
                    500 * (retryCount + 1)
                );
            });
        }

        const result = {
            channelId: channelId,
            channelName: channelName,
            channelAvatar: channelAvatar,
            success: !!(channelId && channelName),
            timestamp: Date.now()
        };

        console.log('频道信息获取结果:', {
            channelId: channelId,
            channelName: channelName,
            channelAvatar: channelAvatar ? '已获取' : '未获取',
            success: result.success,
            retryCount: retryCount
        });

        return result;
    } catch (error) {
        console.error('获取频道信息失败:', error);
        return { success: false, timestamp: Date.now() };
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

// 获取视频标题
function getVideoTitle() {
    try {
        const titleSelectors = [
            'h1.ytd-watch-metadata yt-formatted-string',
            'h1.ytd-video-primary-info-renderer',
            'h1[data-title]',
            '.watch-main-col h1'
        ];

        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }

        // 从页面标题获取（去掉" - YouTube"后缀）
        const pageTitle = document.title;
        if (pageTitle && pageTitle.includes(' - YouTube')) {
            return pageTitle.replace(' - YouTube', '').trim();
        }

        return '';
    } catch (error) {
        console.error('获取视频标题失败:', error);
        return '';
    }
}

// 更新当前页面信息
async function updateCurrentPageInfo() {
    try {
        const videoId = getVideoId();
        if (!videoId) {
            console.log('无法获取视频ID');
            return null;
        }

        // 检查缓存
        if (pageInfoCache.has(videoId)) {
            const cached = pageInfoCache.get(videoId);
            // 如果缓存时间在30秒内，直接使用
            if (Date.now() - cached.timestamp < 30000) {
                currentPageInfo = cached;
                return cached;
            }
        }

        console.log('更新页面信息:', videoId);

        // 获取频道信息（可能需要重试）
        const channelInfo = await getChannelInfo();

        // 获取视频标题
        const videoTitle = await getEnhancedVideoTitle(videoId);

        if (channelInfo.success && videoTitle) {
            const pageInfo = {
                channel: channelInfo,
                videoTitle: videoTitle,
                videoId: videoId,
                timestamp: Date.now(),
                url: window.location.href
            };

            // 更新缓存和当前信息
            currentPageInfo = pageInfo;
            pageInfoCache.set(videoId, pageInfo);

            // 通知background script页面信息已更新
            chrome.runtime
                .sendMessage({
                    type: 'pageInfoUpdated',
                    pageInfo: pageInfo
                })
                .catch((error) => console.log('通知页面信息更新失败:', error));

            console.log('页面信息更新完成:', {
                videoId: videoId,
                channelId: channelInfo.channelId,
                channelName: channelInfo.channelName,
                videoTitle: videoTitle
            });

            return pageInfo;
        } else {
            console.error('页面信息获取不完整:', { channelInfo, videoTitle });
            return null;
        }
    } catch (error) {
        console.error('更新页面信息失败:', error);
        return null;
    }
}

// 通过oEmbed API获取原始视频标题
async function getOriginalVideoTitle(videoId) {
    try {
        if (!videoId) {
            return null;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;

        console.log('尝试通过oEmbed API获取原始标题:', oembedUrl);

        // 发送请求到background script处理CORS
        const response = await chrome.runtime.sendMessage({
            type: 'fetchOriginalTitle',
            oembedUrl: oembedUrl,
            videoId: videoId
        });

        if (response.success && response.title) {
            console.log('通过oEmbed API获取到原始标题:', response.title);
            return response.title;
        } else {
            console.log('oEmbed API获取标题失败:', response.error || '未知错误');
            return null;
        }
    } catch (error) {
        console.error('获取原始标题失败:', error);
        return null;
    }
}

// 获取增强的视频标题（优先使用原始标题）
async function getEnhancedVideoTitle(videoId) {
    try {
        // 首先获取当前显示的标题
        const displayedTitle = getVideoTitle();

        // 尝试获取原始标题
        const originalTitle = await getOriginalVideoTitle(videoId);

        // 如果获取到原始标题且与显示标题不同，优先使用原始标题
        if (originalTitle && originalTitle !== displayedTitle) {
            console.log('检测到多语言标题差异:', {
                显示标题: displayedTitle,
                原始标题: originalTitle,
                使用: '原始标题'
            });
            return originalTitle;
        }

        // 否则使用显示的标题
        console.log('使用显示标题:', displayedTitle);
        return displayedTitle;
    } catch (error) {
        console.error('获取增强标题失败:', error);
        return getVideoTitle(); // 回退到基础方法
    }
}

// 查找视频容器
function findVideoContainer() {
    // 最佳目标：直接包裹 <video> 元素的容器
    const videoContainer = document.querySelector('.html5-video-container');
    if (videoContainer && videoContainer.offsetHeight > 0) {
        return videoContainer;
    }

    // 备选方案：<video> 元素的直接父元素
    const video = document.querySelector('video');
    if (video && video.parentElement && video.parentElement.offsetHeight > 0) {
        return video.parentElement;
    }

    // 最后的备选：旧版播放器ID，兼容性考虑
    const moviePlayer = document.querySelector('#movie_player');
    if (moviePlayer && moviePlayer.offsetHeight > 0) {
        return moviePlayer;
    }

    return null;
}

// 初始化弹幕引擎
async function initDanmakuEngine() {
    const container = findVideoContainer();
    if (!container) {
        console.log('未找到视频容器');
        return;
    }

    console.log('找到视频容器:', {
        id: container.id,
        className: container.className,
        width: container.offsetWidth,
        height: container.offsetHeight
    });

    // 销毁旧的引擎
    if (danmakuEngine) {
        danmakuEngine.destroy();
    }

    // 停止之前的监控
    stopAdStatusMonitoring();

    // 创建新引擎
    danmakuEngine = new DanmakuEngine(container);

    // 加载设置
    await loadSettings();

    // 尝试加载当前视频的弹幕
    const videoId = getVideoId();
    if (videoId) {
        const hasExistingDanmaku = await loadDanmakuForVideo(videoId);

        // 如果没有现有弹幕，触发自动检测
        if (!hasExistingDanmaku) {
            // 延迟执行自动检测，确保页面完全加载
            setTimeout(() => {
                autoCheckAndDownloadDanmaku();
            }, 1000);
        }
    }

    // 启动广告状态监控
    startAdStatusMonitoring();
}

// 加载设置
async function loadSettings() {
    const result = await chrome.storage.local.get('danmakuSettings');
    const settings = result.danmakuSettings || {
        enabled: true,
        timeOffset: 0,
        opacity: 100,
        fontSize: 24
    };

    if (danmakuEngine) {
        danmakuEngine.updateSettings(settings);
    }
}

// 加载视频弹幕
async function loadDanmakuForVideo(videoId) {
    try {
        const result = await chrome.storage.local.get(videoId);
        if (result[videoId] && result[videoId].danmakus) {
            const data = result[videoId];
            console.log(`加载弹幕数据: ${data.danmakus.length} 条`);

            if (danmakuEngine) {
                danmakuEngine.loadDanmakus(data.danmakus);
            }
            return true;
        } else {
            console.log('没有找到弹幕数据');
            return false;
        }
    } catch (error) {
        console.error('加载弹幕失败:', error);
        return false;
    }
}

// 自动检测并下载弹幕
async function autoCheckAndDownloadDanmaku() {
    try {
        const videoId = getVideoId();
        if (!videoId) {
            console.log('无法获取视频ID，跳过自动检测');
            return;
        }

        // 获取频道信息
        const channelInfo = getChannelInfo();
        if (!channelInfo.success || !channelInfo.channelId) {
            console.log('无法获取频道信息，跳过自动检测');
            return;
        }

        // 获取增强的视频标题（支持多语言原始标题）
        const videoTitle = await getEnhancedVideoTitle(videoId);
        if (!videoTitle) {
            console.log('无法获取视频标题，跳过自动检测');
            return;
        }

        // 检查是否为番剧频道
        if (
            channelInfo.channelId === '@MadeByBilibili' ||
            channelInfo.channelName === 'MadeByBilibili'
        ) {
            console.log('检测到番剧频道，执行番剧自动下载逻辑...', {
                channelId: channelInfo.channelId,
                channelName: channelInfo.channelName,
                videoTitle: videoTitle
            });

            // 解析番剧标题和集数
            const parseResult = parseBangumiTitle(videoTitle);
            if (parseResult.isValid) {
                console.log('番剧解析成功:', {
                    title: parseResult.title,
                    episode: parseResult.episode
                });

                try {
                    // 直接调用番剧弹幕下载
                    const response = await chrome.runtime.sendMessage({
                        type: 'downloadBangumiDanmaku',
                        title: parseResult.title,
                        episodeNumber: parseResult.episode,
                        youtubeVideoId: videoId
                    });

                    if (response.success) {
                        console.log(`番剧弹幕自动下载成功: ${response.count} 条`);

                        // 异步触发清理过期弹幕数据
                        chrome.runtime
                            .sendMessage({
                                type: 'cleanupExpiredDanmaku'
                            })
                            .then(() => console.log('清理成功'))
                            .catch((error) => console.log('触发清理失败:', error));

                        // 重新加载弹幕到引擎
                        if (danmakuEngine) {
                            await loadDanmakuForVideo(videoId);
                        }
                    } else {
                        console.error('番剧弹幕自动下载失败:', response.error);
                    }
                } catch (error) {
                    console.error('番剧弹幕下载出错:', error);
                }
            } else {
                console.log('番剧标题解析失败，无法自动下载弹幕');
            }

            // 番剧处理完成，直接返回，不执行后续的普通频道逻辑
            return;
        }

        // 检查频道是否已关联 - 使用关联工具类
        const association = await getChannelAssociation(channelInfo.channelId);

        if (!association) {
            console.log('频道未关联B站UP主，跳过自动检测');
            return;
        }

        console.log('检测到已关联频道，自动更新弹幕...', {
            channelId: channelInfo.channelId,
            channelName: channelInfo.channelName,
            videoTitle: videoTitle,
            bilibiliUID: association.bilibiliUID
        });

        // 发送搜索请求到background script
        const searchResponse = await chrome.runtime.sendMessage({
            type: 'searchBilibiliVideo',
            bilibiliUID: association.bilibiliUID,
            videoTitle: videoTitle,
            youtubeVideoId: videoId
        });

        if (searchResponse.success && searchResponse.results.length > 0) {
            console.log(`找到 ${searchResponse.results.length} 个匹配视频`);

            // 如果只有一个结果，自动下载
            if (searchResponse.results.length === 1) {
                const bvid = searchResponse.results[0].bvid;
                console.log('只有一个匹配结果，自动下载弹幕:', bvid);

                const downloadResponse = await chrome.runtime.sendMessage({
                    type: 'downloadDanmaku',
                    bvid: bvid,
                    youtubeVideoId: videoId
                });

                if (downloadResponse.success) {
                    console.log(`自动下载弹幕成功: ${downloadResponse.count} 条`);

                    // 异步触发清理过期弹幕数据
                    chrome.runtime
                        .sendMessage({
                            type: 'cleanupExpiredDanmaku'
                        })
                        .then(() => console.log('清理成功'))
                        .catch((error) => console.log('触发清理失败:', error));
                    // 重新加载弹幕到引擎
                    if (danmakuEngine) {
                        await loadDanmakuForVideo(videoId);
                    }
                } else {
                    console.error('自动下载弹幕失败:', downloadResponse.error);
                }
            } else {
                console.log('找到多个匹配结果，需要用户手动选择');

                // 发送消息给background打开选择窗口
                chrome.runtime.sendMessage({
                    type: 'showMultipleResults',
                    results: searchResponse.results,
                    youtubeVideoId: videoId,
                    channelInfo: channelInfo,
                    videoTitle: videoTitle
                });
            }
        } else {
            console.log('未找到匹配的B站视频');

            // 发送消息给background打开选择窗口
            chrome.runtime.sendMessage({
                type: 'showNoMatchResults',
                youtubeVideoId: videoId,
                channelInfo: channelInfo,
                videoTitle: videoTitle
            });
        }
    } catch (error) {
        console.error('自动检测弹幕失败:', error);
    }
}

// 监听URL变化
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        handleUrlChange();
    }
}).observe(document, { subtree: true, childList: true });

// 处理URL变化（增强版）
function handleUrlChange() {
    const videoId = getVideoId();
    if (videoId && videoId !== currentVideoId) {
        const oldVideoId = currentVideoId;
        currentVideoId = videoId;

        console.log('视频切换:', { from: oldVideoId, to: videoId });

        // 立即清除旧的页面信息
        currentPageInfo = null;
        if (oldVideoId) {
            pageInfoCache.delete(oldVideoId);
        }

        // 通知background script页面切换
        chrome.runtime
            .sendMessage({
                type: 'pageChanged',
                videoId: videoId,
                oldVideoId: oldVideoId,
                url: window.location.href
            })
            .catch((error) => console.log('通知页面切换失败:', error));

        // 延迟初始化，等待页面加载
        setTimeout(async () => {
            await initDanmakuEngine();
            // 初始化完成后更新页面信息
            await updateCurrentPageInfo();
        }, 1000);
    }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'updateSettings') {
        if (danmakuEngine) {
            danmakuEngine.updateSettings(request.settings);
        }
    } else if (request.type === 'loadDanmaku') {
        loadDanmakuForVideo(request.youtubeVideoId);
    } else if (request.type === 'seekToTime') {
        const video = document.querySelector('video');
        if (video) {
            video.currentTime = request.time;
        }
    } else if (request.type === 'getPageInfo') {
        // 获取页面信息（增强版）
        (async () => {
            try {
                const videoId = getVideoId();

                // 优先使用缓存的页面信息
                if (currentPageInfo && currentPageInfo.videoId === videoId) {
                    console.log('使用缓存的页面信息');
                    sendResponse({
                        success: true,
                        data: currentPageInfo
                    });
                    return;
                }

                // 重新获取页面信息
                console.log('重新获取页面信息...');
                await updateCurrentPageInfo();

                if (currentPageInfo) {
                    sendResponse({
                        success: true,
                        data: currentPageInfo
                    });
                } else {
                    sendResponse({
                        success: false,
                        error: '无法获取页面信息'
                    });
                }
            } catch (error) {
                console.error('获取页面信息失败:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
        })();
    }

    return true; // 保持消息通道开启
});

// 广告状态监控相关函数
let adMonitorInterval = null;
let lastAdStatus = false; // 跟踪上一次的广告状态
let adStartTime = null; // 广告开始时间
let originalOpacity = null; // 保存用户原始透明度设置
let isAdHiding = false; // 标记是否因广告而隐藏弹幕

// 启动广告状态监控
function startAdStatusMonitoring() {
    // 清除之前的监控
    if (adMonitorInterval) {
        clearInterval(adMonitorInterval);
    }

    // 重置状态
    lastAdStatus = false;
    adStartTime = null;
    originalOpacity = null;
    isAdHiding = false;

    // 每500毫秒检测一次广告状态变化
    adMonitorInterval = setInterval(checkAdStatusChange, 500);
    console.log('启动广告状态监控...');
}

// 停止广告状态监控
function stopAdStatusMonitoring() {
    if (adMonitorInterval) {
        clearInterval(adMonitorInterval);
        adMonitorInterval = null;
    }
}

// 检测广告状态变化
function checkAdStatusChange() {
    const video = document.querySelector('video');
    if (!video) return;

    const currentAdStatus = detectAd();

    if (currentAdStatus !== lastAdStatus) {
        if (currentAdStatus) {
            // 广告开始
            adStartTime = video.currentTime;
            logAdStart();
        } else {
            // 广告结束
            logAdEnd();
        }
        lastAdStatus = currentAdStatus;
    }
}

// 获取弹幕引擎信息的辅助函数
function getDanmakuEngineInfo() {
    if (!danmakuEngine) {
        return { 弹幕引擎: '未初始化' };
    }

    try {
        const danmakuVideo = danmakuEngine.video;
        const timeOffset = danmakuEngine.settings ? danmakuEngine.settings.timeOffset : 0;
        const adjustedTime = danmakuVideo ? danmakuVideo.currentTime + timeOffset : null;

        return {
            弹幕引擎视频时间: danmakuVideo
                ? Math.round(danmakuVideo.currentTime * 100) / 100 + 's'
                : 'N/A',
            弹幕时间偏移: timeOffset + 's',
            弹幕调整后时间:
                adjustedTime !== null ? Math.round(adjustedTime * 100) / 100 + 's' : 'N/A',
            弹幕引擎状态: danmakuEngine.isStarted ? '运行中' : '已停止',
            弹幕数量: danmakuEngine.danmakus ? danmakuEngine.danmakus.length : 0,
            弹幕已启用: danmakuEngine.settings ? danmakuEngine.settings.enabled : false
        };
    } catch (error) {
        return { 弹幕引擎错误: error.message };
    }
}

// 广告开始时的打印
function logAdStart() {
    const video = document.querySelector('video');
    if (!video) return;

    console.log('🔴 === 广告开始 ===', {
        检测时间: new Date().toLocaleTimeString(),
        视频当前时间: Math.round(video.currentTime * 100) / 100 + 's',
        视频总时长: Math.round(video.duration * 100) / 100 + 's',
        播放速度: video.playbackRate + 'x',
        ...getDanmakuEngineInfo()
    });

    // 保存并隐藏弹幕
    if (danmakuEngine && danmakuEngine.settings && !isAdHiding) {
        originalOpacity = danmakuEngine.settings.opacity;
        isAdHiding = true;
        danmakuEngine.updateSettings({ opacity: 0 });
        console.log(`💫 隐藏弹幕: 透明度 ${originalOpacity}% → 0%`);
    }
}

// 广告结束时的打印
function logAdEnd() {
    const video = document.querySelector('video');
    if (!video) return;

    const adDuration = adStartTime !== null ? video.currentTime - adStartTime : null;

    console.log('🟢 === 广告结束 ===', {
        检测时间: new Date().toLocaleTimeString(),
        视频当前时间: Math.round(video.currentTime * 100) / 100 + 's',
        视频总时长: Math.round(video.duration * 100) / 100 + 's',
        广告持续时长: adDuration !== null ? Math.round(adDuration * 100) / 100 + 's' : 'N/A',
        播放速度: video.playbackRate + 'x',
        ...getDanmakuEngineInfo()
    });

    // 重新同步并恢复弹幕
    if (danmakuEngine && isAdHiding && originalOpacity !== null) {
        console.log('🔄 重新同步弹幕...');
        danmakuEngine.resyncDanmakus();

        // 稍微延迟恢复透明度，确保同步完成
        setTimeout(() => {
            danmakuEngine.updateSettings({ opacity: originalOpacity });
            console.log(`👁️ 恢复弹幕: 透明度 0% → ${originalOpacity}%`);

            // 重置状态
            isAdHiding = false;
            originalOpacity = null;
        }, 100);
    }
}

// 检测是否在播放广告
function detectAd() {
    const adSelectors = [
        '.video-ads',
        '.ytp-ad-player-overlay',
        '.ytp-ad-skip-button',
        '.ytp-ad-text',
        '.ytp-ad-overlay-close-button',
        '[class*="ad-showing"]',
        '.ytp-ad-player-overlay-skip-or-preview'
    ];

    // 检查广告相关元素
    const hasAdElement = adSelectors.some((selector) => {
        const element = document.querySelector(selector);
        return element && element.offsetHeight > 0;
    });

    // 检查视频标题是否包含广告标识
    const video = document.querySelector('video');
    if (video && video.duration) {
        // 如果视频时长异常短（通常广告较短），可能是广告
        const isShortDuration = video.duration < 60 && video.currentTime < video.duration;
        if (isShortDuration && hasAdElement) {
            return true;
        }
    }

    return hasAdElement;
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initDanmakuEngine, 1000);
    });
} else {
    setTimeout(initDanmakuEngine, 1000);
}
