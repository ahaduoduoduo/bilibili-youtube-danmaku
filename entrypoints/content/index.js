import './danmaku.css';
import { channelAssociation } from '../../utils/channelAssociation.js';
import DanmakuEngine from '../../utils/danmaku-engine.js';
import {
    getExtensionEnabled,
    applyNetworkAndTimerGuards,
    applyStorageGuards
} from '../../utils/globalToggle.js';

export default defineContentScript({
    matches: ['*://*.youtube.com/*'],
    cssInjectionMode: 'manifest',
    runAt: 'document_end',
    main(ctx) {
        let danmakuEngine = null;
        let currentVideoId = null;
        let currentPageInfo = null;
        let pageInfoCache = new Map();
        let activeInitToken = 0;
        let pendingInitTimeout = null;
        let extensionEnabled = true;
        let urlObserver = null;
        const channelNameSelectors = [
            'yt-formatted-string.ytd-channel-name a',
            '#channel-name .ytd-channel-name a',
            '.ytd-video-owner-renderer .ytd-channel-name a',
            'ytd-channel-name a',
            '#owner-sub-count a',
            '.ytd-channel-name a'
        ];
        const channelLinkFallbackSelectors = ['a[href*="/@"]', 'a[href*="/channel/"]'];
        const channelAvatarSelectors = [
            '#avatar img',
            '.ytd-video-owner-renderer img',
            'yt-img-shadow img[alt*="avatar"]',
            'yt-img-shadow img[alt*="Avatar"]'
        ];
        const channelRootSelectors = ['ytd-watch-metadata', '#owner', 'ytd-video-owner-renderer'];

        // 获取YouTube视频ID
        function getVideoId() {
            const match = window.location.href.match(/[?&]v=([^&]+)/);
            return match ? match[1] : null;
        }

        function extractChannelIdFromHref(href) {
            if (!href) {
                return '';
            }

            let match = href.match(/@([^\/\?#]+)/);
            if (match) {
                return '@' + match[1];
            }

            match = href.match(/channel\/([^\/\?#]+)/);
            return match ? match[1] : '';
        }

        function getVisibleElements(selectors, root = document) {
            const elements = [];
            const seen = new Set();

            for (const selector of selectors) {
                const matches = root.querySelectorAll(selector);
                for (const element of matches) {
                    if (seen.has(element) || !isVisibleElement(element)) {
                        continue;
                    }

                    seen.add(element);
                    elements.push(element);
                }
            }

            return elements;
        }

        function findChannelLinkCandidate() {
            const visibleRoots = getVisibleElements(channelRootSelectors);

            for (const root of visibleRoots) {
                const scopedLinks = getVisibleElements(channelNameSelectors, root);
                const completeLink = scopedLinks.find((element) => {
                    return element.textContent.trim() && extractChannelIdFromHref(element.href);
                });

                if (completeLink) {
                    return completeLink;
                }
            }

            const globalCandidates = [
                ...getVisibleElements(channelNameSelectors),
                ...getVisibleElements(channelLinkFallbackSelectors)
            ];

            return (
                globalCandidates.find((element) => {
                    return element.textContent.trim() && extractChannelIdFromHref(element.href);
                }) || globalCandidates[0] || null
            );
        }

        function getChannelAvatar(channelLink) {
            const avatarSearchRoots = [];
            const ownerRoot = channelLink?.closest('#owner, ytd-video-owner-renderer, ytd-watch-metadata');

            if (ownerRoot) {
                avatarSearchRoots.push(ownerRoot);
            }

            avatarSearchRoots.push(...getVisibleElements(channelRootSelectors));

            for (const root of avatarSearchRoots) {
                const avatar = getVisibleElements(channelAvatarSelectors, root).find(
                    (element) => !!element.src
                );
                if (avatar) {
                    return avatar.src;
                }
            }

            const fallbackAvatar = getVisibleElements(channelAvatarSelectors).find(
                (element) => !!element.src
            );
            return fallbackAvatar ? fallbackAvatar.src : '';
        }

        // 获取YouTube频道信息（增强版）
        function getChannelInfo(retryCount = 0) {
            try {
                // 尝试多种方式获取频道信息
                let channelName = '';
                let channelId = '';
                let channelAvatar = '';

                const channelLink = findChannelLinkCandidate();
                if (channelLink) {
                    channelName = channelLink.textContent.trim();
                    channelId = extractChannelIdFromHref(channelLink.href);
                    channelAvatar = getChannelAvatar(channelLink);
                }

                // 如果信息不完整且重试次数小于2，则重试
                if ((!channelId || !channelName) && retryCount < 2) {
                    console.log(
                        `频道信息不完整，${500 * (retryCount + 1)}ms后重试 (${retryCount + 1}/2)`
                    );
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
        async function updateCurrentPageInfo({ forceRefresh = false } = {}) {
            try {
                const videoId = getVideoId();
                if (!videoId) {
                    console.log('无法获取视频ID');
                    return null;
                }

                // 检查缓存
                if (!forceRefresh && pageInfoCache.has(videoId)) {
                    const cached = pageInfoCache.get(videoId);
                    // 如果缓存时间在30秒内，直接使用
                    if (Date.now() - cached.timestamp < 30000) {
                        currentPageInfo = cached;
                        return cached;
                    }
                }

                console.log('更新页面信息:', videoId);

                // 获取频道信息（可能需要重试）
                const initialChannelInfo = await getChannelInfo();

                // 获取视频标题
                const videoTitle = await getEnhancedVideoTitle(videoId);

                const currentVideoId = getVideoId();
                if (currentVideoId !== videoId) {
                    console.log('页面信息更新期间视频已切换，忽略过期结果:', {
                        requestedVideoId: videoId,
                        currentVideoId: currentVideoId
                    });
                    return null;
                }

                // YouTube SPA 切换时，频道 DOM 可能会比标题更晚稳定，发布前再校验一次。
                const revalidatedChannelInfo = await getChannelInfo();
                const channelInfo = revalidatedChannelInfo.success
                    ? revalidatedChannelInfo
                    : initialChannelInfo;

                if (
                    initialChannelInfo.success &&
                    revalidatedChannelInfo.success &&
                    (initialChannelInfo.channelId !== revalidatedChannelInfo.channelId ||
                        initialChannelInfo.channelName !== revalidatedChannelInfo.channelName)
                ) {
                    console.log('页面信息更新期间频道信息发生变化，使用重新校验后的结果:', {
                        videoId: videoId,
                        initialChannelId: initialChannelInfo.channelId,
                        initialChannelName: initialChannelInfo.channelName,
                        revalidatedChannelId: revalidatedChannelInfo.channelId,
                        revalidatedChannelName: revalidatedChannelInfo.channelName
                    });
                }

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
                    browser.runtime
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
                const response = await browser.runtime.sendMessage({
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
        function isVisibleElement(element) {
            if (!element) {
                return false;
            }

            if (!element.isConnected || element.closest('[hidden], [aria-hidden="true"]')) {
                return false;
            }

            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        function findVideoContainer() {
            // 最佳目标：直接包裹 <video> 元素的容器
            const videoContainer = document.querySelector('.html5-video-container');
            if (isVisibleElement(videoContainer)) {
                return videoContainer;
            }

            // 备选方案：优先使用 <video> 最近的播放器容器
            const video = document.querySelector('video');
            if (video) {
                const closestContainer = video.closest('.html5-video-container');
                if (isVisibleElement(closestContainer)) {
                    return closestContainer;
                }

                if (isVisibleElement(video.parentElement)) {
                    return video.parentElement;
                }
            }

            // 最后的备选：旧版播放器ID，兼容性考虑
            const moviePlayer = document.querySelector('#movie_player');
            if (isVisibleElement(moviePlayer)) {
                return moviePlayer;
            }

            return null;
        }

        function isInitTokenCurrent(token) {
            return token === activeInitToken;
        }

        function resetDanmakuEngineState() {
            if (danmakuEngine) {
                danmakuEngine.destroy();
                danmakuEngine = null;
            }

            stopAdStatusMonitoring();
        }

        async function waitForVideoContainer(token, maxAttempts = 20, delay = 500) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (!isInitTokenCurrent(token)) {
                    return null;
                }

                const container = findVideoContainer();
                if (container) {
                    return container;
                }

                if (attempt === 1 || attempt === maxAttempts || attempt % 5 === 0) {
                    const video = document.querySelector('video');
                    const rect = video ? video.getBoundingClientRect() : null;
                    console.log('等待视频容器...', {
                        attempt,
                        hasVideo: !!video,
                        videoReadyState: video ? video.readyState : null,
                        videoSize: rect
                            ? `${Math.round(rect.width)}x${Math.round(rect.height)}`
                            : 'N/A'
                    });
                }

                await new Promise((resolve) => setTimeout(resolve, delay));
            }

            return null;
        }

        function scheduleDanmakuEngineInit({ delay = 1000, updatePageInfo = false } = {}) {
            if (!extensionEnabled) {
                return;
            }

            activeInitToken += 1;
            const token = activeInitToken;

            if (pendingInitTimeout) {
                clearTimeout(pendingInitTimeout);
            }

            pendingInitTimeout = setTimeout(async () => {
                pendingInitTimeout = null;

                const initialized = await initDanmakuEngine(token);
                if (initialized && updatePageInfo && isInitTokenCurrent(token)) {
                    await updateCurrentPageInfo();

                    setTimeout(() => {
                        if (!isInitTokenCurrent(token)) {
                            return;
                        }

                        updateCurrentPageInfo({ forceRefresh: true }).catch((error) => {
                            console.log('延迟复查页面信息失败:', error);
                        });
                    }, 1500);
                }
            }, delay);
        }

        // 初始化弹幕引擎
        async function initDanmakuEngine(token = activeInitToken) {
            if (!extensionEnabled) {
                return false;
            }

            if (!isInitTokenCurrent(token)) {
                return false;
            }

            const container = await waitForVideoContainer(token);
            if (!isInitTokenCurrent(token)) {
                return false;
            }

            if (!container) {
                console.log('未找到视频容器');
                return false;
            }

            console.log('找到视频容器:', {
                id: container.id,
                className: container.className,
                width: container.offsetWidth,
                height: container.offsetHeight
            });

            resetDanmakuEngineState();

            // 创建新引擎
            danmakuEngine = new DanmakuEngine(container);

            // 加载设置
            await loadSettings();

            if (!isInitTokenCurrent(token)) {
                return false;
            }

            // 尝试加载当前视频的弹幕
            const videoId = getVideoId();
            if (videoId) {
                const hasExistingDanmaku = await loadDanmakuForVideo(videoId);

                if (!isInitTokenCurrent(token)) {
                    return false;
                }

                // 如果没有现有弹幕，触发自动检测
                if (!hasExistingDanmaku) {
                    // 延迟执行自动检测，确保页面完全加载
                    setTimeout(() => {
                        if (isInitTokenCurrent(token)) {
                            autoCheckAndDownloadDanmaku(token);
                        }
                    }, 1000);
                }
            }

            if (!isInitTokenCurrent(token)) {
                return false;
            }

            // 启动广告状态监控
            startAdStatusMonitoring();

            return true;
        }

        // 加载设置
        async function loadSettings() {
            const result = await browser.storage.local.get('danmakuSettings');
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
                const result = await browser.storage.local.get(videoId);
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
        async function autoCheckAndDownloadDanmaku(token = activeInitToken) {
            try {
                if (!isInitTokenCurrent(token)) {
                    return;
                }

                const videoId = getVideoId();
                if (!videoId) {
                    console.log('无法获取视频ID，跳过自动检测');
                    return;
                }

                // 获取频道信息
                const channelInfo = await getChannelInfo();
                if (!isInitTokenCurrent(token)) {
                    return;
                }

                if (!channelInfo.success || !channelInfo.channelId) {
                    console.log('无法获取频道信息，跳过自动检测');
                    return;
                }

                // 获取增强的视频标题（支持多语言原始标题）
                const videoTitle = await getEnhancedVideoTitle(videoId);
                if (!isInitTokenCurrent(token)) {
                    return;
                }

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
                            const response = await browser.runtime.sendMessage({
                                type: 'downloadBangumiDanmaku',
                                title: parseResult.title,
                                episodeNumber: parseResult.episode,
                                youtubeVideoId: videoId
                            });

                            if (!isInitTokenCurrent(token)) {
                                return;
                            }

                            if (response.success) {
                                console.log(`番剧弹幕自动下载成功: ${response.count} 条`);

                                // 异步触发清理过期弹幕数据
                                browser.runtime
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
                const association = await channelAssociation.getChannelAssociation(
                    channelInfo.channelId
                );

                if (!isInitTokenCurrent(token)) {
                    return;
                }

                if (!association) {
                    console.log('频道未关联B站UP主，跳过自动检测');
                    return;
                }

                // 获取YouTube视频长度
                const video = document.querySelector('video');
                const youtubeVideoDuration = video ? video.duration : null;
                console.log('YouTube视频长度:', youtubeVideoDuration);

                console.log('检测到已关联频道，自动更新弹幕...', {
                    channelId: channelInfo.channelId,
                    channelName: channelInfo.channelName,
                    videoTitle: videoTitle,
                    bilibiliUID: association.bilibiliUID,
                    youtubeVideoDuration: youtubeVideoDuration
                });

                // 发送搜索请求到background script
                const searchResponse = await browser.runtime.sendMessage({
                    type: 'searchBilibiliVideo',
                    bilibiliUID: association.bilibiliUID,
                    videoTitle: videoTitle,
                    youtubeVideoId: videoId,
                    youtubeVideoDuration: youtubeVideoDuration
                });

                if (!isInitTokenCurrent(token)) {
                    return;
                }

                if (searchResponse.success && searchResponse.results.length > 0) {
                    console.log(`找到 ${searchResponse.results.length} 个匹配视频`);

                    // 如果只有一个结果，自动下载
                    if (searchResponse.results.length === 1) {
                        const bvid = searchResponse.results[0].bvid;
                        console.log('只有一个匹配结果，自动下载弹幕:', bvid);

                        const downloadResponse = await browser.runtime.sendMessage({
                            type: 'downloadDanmaku',
                            bvid: bvid,
                            youtubeVideoId: videoId,
                            youtubeVideoDuration: youtubeVideoDuration
                        });

                        if (!isInitTokenCurrent(token)) {
                            return;
                        }

                        if (downloadResponse.success) {
                            console.log(`自动下载弹幕成功: ${downloadResponse.count} 条`);

                            // 异步触发清理过期弹幕数据
                            browser.runtime
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
                        browser.runtime.sendMessage({
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
                    browser.runtime.sendMessage({
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

        // 页面信息监控器
        let pageInfoMonitor = null;
        let lastKnownPageInfo = null;
        let monitoringRunCount = 0;

        // 启动页面信息持续监控
        function startPageInfoMonitoring() {
            if (!extensionEnabled) {
                return;
            }

            console.log('启动页面信息持续监控');

            // 停止现有的监控器防止重复
            if (pageInfoMonitor) {
                clearInterval(pageInfoMonitor);
                pageInfoMonitor = null;
            }

            // 重置运行计数
            monitoringRunCount = 0;

            pageInfoMonitor = setInterval(async () => {
                monitoringRunCount++;
                console.log(`页面信息监控运行第 ${monitoringRunCount} 次`);

                // 运行3次后自动停止
                if (monitoringRunCount >= 3) {
                    console.log('页面信息监控已运行3次，自动停止');
                    stopPageInfoMonitoring();
                    return;
                }
                try {
                    const currentUrl = window.location.href;
                    const videoId = getVideoId();

                    // 如果不在YouTube视频页面，停止监控
                    if (!videoId || !currentUrl.includes('youtube.com/watch')) {
                        console.log('不在YouTube视频页面，停止监控');
                        stopPageInfoMonitoring();
                        return;
                    }

                    // 检查是否需要更新页面信息
                    const needsUpdate =
                        !lastKnownPageInfo ||
                        lastKnownPageInfo.videoId !== videoId ||
                        lastKnownPageInfo.url !== currentUrl ||
                        !lastKnownPageInfo.channel ||
                        !lastKnownPageInfo.channel.success ||
                        !lastKnownPageInfo.channel.channelId;

                    if (needsUpdate) {
                        console.log('检测到页面信息需要更新:', {
                            videoId,
                            lastKnownVideoId: lastKnownPageInfo?.videoId,
                            urlChanged: lastKnownPageInfo?.url !== currentUrl,
                            noChannelInfo: !lastKnownPageInfo?.channel?.success
                        });

                        // 强制更新页面信息
                        currentPageInfo = null;
                        pageInfoCache.delete(videoId);

                        await updateCurrentPageInfo();

                        if (currentPageInfo) {
                            lastKnownPageInfo = { ...currentPageInfo };

                            // 立即通知background更新
                            browser.runtime
                                .sendMessage({
                                    type: 'pageInfoUpdated',
                                    pageInfo: currentPageInfo
                                })
                                .catch((error) => console.log('通知页面信息更新失败:', error));
                        }
                    }
                } catch (error) {
                    console.error('页面信息监控出错:', error);
                    // 发生错误时停止监控，避免持续错误
                    if (
                        error.message &&
                        (error.message.includes('Extension context invalidated') ||
                            error.message.includes('Could not establish connection') ||
                            error.message.includes('The message port closed'))
                    ) {
                        console.log('扩展上下文失效或连接断开，停止监控');
                        stopPageInfoMonitoring();
                    }
                }
            }, 2000); // 每2秒检查一次
        }

        // 停止页面信息监控
        function stopPageInfoMonitoring() {
            if (pageInfoMonitor) {
                clearInterval(pageInfoMonitor);
                pageInfoMonitor = null;
                monitoringRunCount = 0;
                console.log('停止页面信息监控');
            }
        }

        // 监听URL变化（按开关控制）
        function setupUrlObserver() {
            if (urlObserver) return;
            let lastUrl = location.href;
            urlObserver = new MutationObserver(() => {
                if (!extensionEnabled) return;
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    handleUrlChange();
                }
            });
            urlObserver.observe(document, { subtree: true, childList: true });
        }

        function teardownUrlObserver() {
            if (urlObserver) {
                try {
                    urlObserver.disconnect();
                } catch (e) {}
                urlObserver = null;
            }
        }

        // 处理URL变化（增强版）
        function handleUrlChange() {
            const videoId = getVideoId();
            if (videoId && videoId !== currentVideoId) {
                const oldVideoId = currentVideoId;
                currentVideoId = videoId;

                console.log('视频切换:', { from: oldVideoId, to: videoId });

                // 立即清除旧的页面信息和缓存
                currentPageInfo = null;
                lastKnownPageInfo = null; // 清除监控器的记录
                if (oldVideoId) {
                    pageInfoCache.delete(oldVideoId);
                }

                resetDanmakuEngineState();
                console.log('已清除页面信息缓存');

                // 通知background script页面切换
                browser.runtime
                    .sendMessage({
                        type: 'pageChanged',
                        videoId: videoId,
                        oldVideoId: oldVideoId,
                        url: window.location.href
                    })
                    .catch((error) => console.log('通知页面切换失败:', error));

                // 重启页面信息监控
                startPageInfoMonitoring();

                // 延迟初始化，等待页面加载
                scheduleDanmakuEngineInit({ delay: 1000, updatePageInfo: true });
            }
        }

        // 监听来自popup的消息
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'updateSettings') {
                if (danmakuEngine) {
                    danmakuEngine.updateSettings(request.settings);
                }
            } else if (request.type === 'getVideoDuration') {
                const video = document.querySelector('video');
                sendResponse({ duration: video ? video.duration : null });
                return true;
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
                            const cacheAge = Date.now() - currentPageInfo.timestamp;
                            if (cacheAge > 1500) {
                                console.log('使用缓存的页面信息');
                                sendResponse({
                                    success: true,
                                    data: currentPageInfo
                                });
                                return;
                            }

                            console.log('页面信息刚更新，重新校验频道信息...', {
                                videoId: videoId,
                                cacheAge: cacheAge
                            });
                        }

                        // 重新获取页面信息
                        console.log('重新获取页面信息...');
                        await updateCurrentPageInfo({ forceRefresh: !!currentPageInfo });

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

                return true;
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
                广告持续时长:
                    adDuration !== null ? Math.round(adDuration * 100) / 100 + 's' : 'N/A',
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
        function initializePage() {
            if (!extensionEnabled) {
                return;
            }

            scheduleDanmakuEngineInit({ delay: 1000 });
            setTimeout(() => {
                if (extensionEnabled) {
                    startPageInfoMonitoring();
                }
            }, 1000);
        }

        function startEnabledFeatures() {
            setupUrlObserver();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializePage, { once: true });
            } else {
                initializePage();
            }
        }

        function teardownDisabledState() {
            activeInitToken += 1;
            if (pendingInitTimeout) {
                clearTimeout(pendingInitTimeout);
                pendingInitTimeout = null;
            }
            stopPageInfoMonitoring();
            resetDanmakuEngineState();
            teardownUrlObserver();
        }

        // 页面卸载时清理资源
        window.addEventListener('beforeunload', () => {
            console.log('页面卸载，清理监控器');
            teardownDisabledState();
        });

        // 可见性变化时的处理
        document.addEventListener('visibilitychange', () => {
            if (!extensionEnabled) {
                return;
            }

            if (document.visibilityState === 'hidden') {
                console.log('页面隐藏，暂停监控器');
                stopPageInfoMonitoring();
            } else if (document.visibilityState === 'visible') {
                console.log('页面可见，恢复监控器');
                setTimeout(() => {
                    if (extensionEnabled && window.location.href.includes('youtube.com/watch')) {
                        startPageInfoMonitoring();
                    }
                }, 1000);
            }
        });

        // 热切换监听（不占用消息通道）
        browser.runtime.onMessage.addListener((request) => {
            if (request && request.type === 'EXTENSION_GLOBAL_TOGGLE') {
                extensionEnabled = !!request.enabled;
                if (extensionEnabled) {
                    // Re-enable: remove guards first, then start features
                    applyNetworkAndTimerGuards(false);
                    applyStorageGuards(false);
                    startEnabledFeatures();
                } else {
                    // Disable: teardown first while clearInterval/clearTimeout still original
                    teardownDisabledState();
                    applyNetworkAndTimerGuards(true);
                    applyStorageGuards(true);
                }
            }
        });

        // 启动时读取总开关
        (async () => {
            try {
                const enabled = await getExtensionEnabled();
                extensionEnabled = !!enabled;
            } catch (e) {
                extensionEnabled = true;
            }
            applyNetworkAndTimerGuards(!extensionEnabled);
            applyStorageGuards(!extensionEnabled);
            if (extensionEnabled) {
                startEnabledFeatures();
            } else {
                teardownDisabledState();
            }
        })();
    }
});
