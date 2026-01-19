/**
 * Quark 网盘视频播放器弹幕支持
 * 简化版：不需要频道关联，不自动弹出 popup
 * 用户手动输入 B 站链接下载弹幕
 * 新增：自动搜索 B 站视频并显示浮窗
 */

import './danmaku.css';
import DanmakuEngine from '../../utils/danmaku-engine.js';

export default defineContentScript({
    matches: ['*://pan.quark.cn/*'],
    cssInjectionMode: 'manifest',
    runAt: 'document_end',
    main(ctx) {
        let danmakuEngine = null;
        let currentVideoId = null;
        let resizeObserver = null;
        let savedVideoRect = null; // 保存正确的 video 尺寸
        let cachedSearchResults = null; // 缓存搜索结果
        let cachedSearchKeyword = ''; // 缓存搜索关键词
        let danmakuButtonAdded = false; // 是否已添加按钮

        // ==================== B站弹幕按钮和浮窗相关函数 ====================

        // 清理夸克视频标题（去掉后缀、日期前缀等）
        function cleanQuarkVideoTitle(title) {
            if (!title) return '';
            
            let cleaned = title;
            
            // 去掉常见视频后缀
            cleaned = cleaned.replace(/\.(mp4|mkv|avi|flv|wmv|mov|webm|m4v|rmvb|rm|3gp)$/i, '');
            
            // 去掉日期前缀 (如 "2025-08-15" 或 "2025.08.15" 或 "20250815")
            cleaned = cleaned.replace(/^\d{4}[-./]?\d{2}[-./]?\d{2}\s*/, '');
            
            // 去掉开头的特殊标记（如序号）
            cleaned = cleaned.replace(/^[\d\s._-]+/, '');
            
            // 去掉多余空格
            cleaned = cleaned.trim();
            
            console.log(`[Quark] 标题清理: "${title}" → "${cleaned}"`);
            return cleaned;
        }

        // 获取视频标题
        function getVideoTitle() {
            // 夸克网盘页面标题选择器（按优先级排序）
            const selectors = [
                '[class*="header-tit"]',      // 页面顶部标题 header--header-tit--xxx
                '.show-fileName',              // 播放器内标题
                '[class*="file-name"]',        // 其他文件名元素
            ];
            
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent?.trim() || el.innerText?.trim();
                    if (text && text.length > 0) {
                        console.log(`[Quark] 找到标题 (${selector}): "${text}"`);
                        return text;
                    }
                }
            }
            
            console.log('[Quark] 未找到视频标题');
            return null;
        }

        // 添加"B站弹幕"按钮（使用固定定位，放在播放历史右侧）
        function addDanmakuButton() {
            if (danmakuButtonAdded) return;
            
            // 查找播放历史按钮
            const historyBtn = document.querySelector('[class*="header-toolbar-history"]');
            if (!historyBtn) {
                console.log('[Quark] 未找到播放历史按钮');
                return;
            }

            // 检查是否已存在
            if (document.getElementById('qb-danmaku-btn')) {
                danmakuButtonAdded = true;
                return;
            }

            // 创建B站弹幕按钮（使用固定定位）
            const danmakuBtn = document.createElement('div');
            danmakuBtn.id = 'qb-danmaku-btn';
            danmakuBtn.className = 'qb-danmaku-btn';
            danmakuBtn.innerHTML = `
                <svg class="qb-danmaku-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M17.813 4.653h0.854c1.51 0.054 2.769 0.578 3.773 1.574 1.004 0.995 1.524 2.249 1.56 3.76v7.36c-0.036 1.51 -0.556 2.769 -1.56 3.773s-2.262 1.524 -3.773 1.56H5.333c-1.51 -0.036 -2.769 -0.556 -3.773 -1.56S0.036 18.858 0 17.347v-7.36c0.036 -1.511 0.556 -2.765 1.56 -3.76 1.004 -0.996 2.262 -1.52 3.773 -1.574h0.774l-1.174 -1.12a1.234 1.234 0 0 1 -0.373 -0.906c0 -0.356 0.124 -0.658 0.373 -0.907l0.027 -0.027c0.267 -0.249 0.573 -0.373 0.92 -0.373 0.347 0 0.653 0.124 0.92 0.373L9.653 4.44c0.071 0.071 0.134 0.142 0.187 0.213h4.267a0.836 0.836 0 0 1 0.16 -0.213l2.853 -2.747c0.267 -0.249 0.573 -0.373 0.92 -0.373 0.347 0 0.662 0.151 0.929 0.4 0.267 0.249 0.391 0.551 0.391 0.907 0 0.355 -0.124 0.657 -0.373 0.906zM5.333 7.24c-0.746 0.018 -1.373 0.276 -1.88 0.773 -0.506 0.498 -0.769 1.13 -0.786 1.894v7.52c0.017 0.764 0.28 1.395 0.786 1.893 0.507 0.498 1.134 0.756 1.88 0.773h13.334c0.746 -0.017 1.373 -0.275 1.88 -0.773 0.506 -0.498 0.769 -1.129 0.786 -1.893v-7.52c-0.017 -0.765 -0.28 -1.396 -0.786 -1.894 -0.507 -0.497 -1.134 -0.755 -1.88 -0.773zM8 11.107c0.373 0 0.684 0.124 0.933 0.373 0.25 0.249 0.383 0.569 0.4 0.96v1.173c-0.017 0.391 -0.15 0.711 -0.4 0.96 -0.249 0.25 -0.56 0.374 -0.933 0.374s-0.684 -0.125 -0.933 -0.374c-0.25 -0.249 -0.383 -0.569 -0.4 -0.96V12.44c0 -0.373 0.129 -0.689 0.386 -0.947 0.258 -0.257 0.574 -0.386 0.947 -0.386zm8 0c0.373 0 0.684 0.124 0.933 0.373 0.25 0.249 0.383 0.569 0.4 0.96v1.173c-0.017 0.391 -0.15 0.711 -0.4 0.96 -0.249 0.25 -0.56 0.374 -0.933 0.374s-0.684 -0.125 -0.933 -0.374c-0.25 -0.249 -0.383 -0.569 -0.4 -0.96V12.44c0.017 -0.391 0.15 -0.711 0.4 -0.96 0.249 -0.249 0.56 -0.373 0.933 -0.373Z"/>
                </svg>
                <span class="qb-danmaku-text">B站弹幕</span>
            `;

            // 创建弹窗容器
            const popover = document.createElement('div');
            popover.id = 'qb-danmaku-popover';
            popover.className = 'qb-danmaku-popover';
            popover.innerHTML = `
                <div class="qb-popover-arrow"></div>
                <div class="qb-popover-header">
                    <span class="qb-popover-header-title">B站弹幕</span>
                    <div class="qb-popover-search">
                        <input type="text" id="qb-search-input" placeholder="搜索关键词..." />
                        <button id="qb-search-btn" title="搜索">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="qb-popover-content" id="qb-popover-content">
                    <div class="qb-popover-loading">正在搜索...</div>
                </div>
            `;

            // 添加到 body（使用固定定位）
            document.body.appendChild(danmakuBtn);
            document.body.appendChild(popover);

            // 更新按钮位置（放在播放历史右侧）
            function updateButtonPosition() {
                const historyRect = historyBtn.getBoundingClientRect();
                const btnRect = danmakuBtn.getBoundingClientRect();
                // 垂直居中对齐：使用播放历史的垂直中心
                const historyCenterY = historyRect.top + historyRect.height / 2;
                const btnHeight = btnRect.height || 21; // 按钮高度，fallback to line-height
                danmakuBtn.style.top = `${historyCenterY - btnHeight / 2}px`;
                danmakuBtn.style.left = `${historyRect.right + 32}px`;
            }
            
            // 初始定位
            updateButtonPosition();
            
            // 监听窗口变化，更新位置
            window.addEventListener('resize', updateButtonPosition);
            
            // 使用 MutationObserver 监听 DOM 变化
            const observer = new MutationObserver(() => {
                requestAnimationFrame(updateButtonPosition);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });

            // 绑定悬浮事件
            let hideTimeout = null;
            
            const showPopover = () => {
                clearTimeout(hideTimeout);
                updateButtonPosition(); // 确保位置正确
                const btnRect = danmakuBtn.getBoundingClientRect();
                popover.style.top = `${btnRect.bottom + 10}px`;
                popover.style.left = `${btnRect.left}px`;
                popover.classList.add('qb-popover-visible');
                
                // 如果有缓存的搜索结果，显示它们
                if (cachedSearchResults && cachedSearchResults.length > 0) {
                    renderSearchResults(cachedSearchResults);
                }
            };
            
            const hidePopover = () => {
                hideTimeout = setTimeout(() => {
                    popover.classList.remove('qb-popover-visible');
                }, 200);
            };

            danmakuBtn.addEventListener('mouseenter', showPopover);
            danmakuBtn.addEventListener('mouseleave', hidePopover);
            popover.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
            popover.addEventListener('mouseleave', hidePopover);

            // 绑定搜索事件
            const searchInput = document.getElementById('qb-search-input');
            const searchBtn = document.getElementById('qb-search-btn');
            
            searchInput.value = cachedSearchKeyword;
            
            const doSearch = async () => {
                const keyword = searchInput.value.trim();
                if (!keyword) return;
                
                cachedSearchKeyword = keyword;
                const content = document.getElementById('qb-popover-content');
                content.innerHTML = '<div class="qb-popover-loading"><span class="qb-loading-spinner"></span>正在搜索...</div>';
                
                try {
                    const response = await browser.runtime.sendMessage({
                        type: 'searchBilibiliVideoAllV2',
                        keyword: keyword
                    });
                    
                    console.log('[Quark] B站搜索结果:', response);
                    
                    if (response.success && response.results && response.results.length > 0) {
                        cachedSearchResults = response.results;
                        renderSearchResults(response.results);
                    } else {
                        content.innerHTML = '<div class="qb-popover-empty">未找到相关视频</div>';
                    }
                } catch (error) {
                    console.error('[Quark] 搜索失败:', error);
                    content.innerHTML = '<div class="qb-popover-error">搜索失败</div>';
                }
            };
            
            searchBtn.addEventListener('click', doSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') doSearch();
            });

            danmakuButtonAdded = true;
            console.log('[Quark] B站弹幕按钮已添加');
        }

        // 渲染搜索结果到弹窗
        function renderSearchResults(results) {
            const content = document.getElementById('qb-popover-content');
            if (!content) return;
            
            content.innerHTML = results.map((video, index) => `
                <div class="qb-popover-item" data-bvid="${video.bvid}" data-index="${index}">
                    <div class="qb-popover-item-cover">
                        <img src="${video.pic}" alt="" referrerpolicy="no-referrer" />
                        <div class="qb-popover-item-overlay" style="display:none;">
                            <span class="qb-loading-spinner"></span>
                        </div>
                    </div>
                    <div class="qb-popover-item-info">
                        <div class="qb-popover-item-title" title="${video.title.replace(/"/g, '&quot;')}">${video.title}</div>
                        <div class="qb-popover-item-author">UP: ${video.author} · ${video.duration}</div>
                    </div>
                </div>
            `).join('');
            
            // 绑定点击事件
            content.querySelectorAll('.qb-popover-item').forEach(item => {
                item.addEventListener('click', () => handleItemClick(item));
            });
        }

        // 处理列表项点击（下载弹幕）
        async function handleItemClick(itemElement) {
            const bvid = itemElement.dataset.bvid;
            const videoId = getQuarkVideoId();
            if (!videoId || !bvid) return;
            
            // 显示加载覆盖层
            const overlay = itemElement.querySelector('.qb-popover-item-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.innerHTML = '<span class="qb-loading-spinner"></span>';
            }
            
            try {
                const video = document.querySelector('video');
                const videoDuration = video ? video.duration : null;

                const response = await browser.runtime.sendMessage({
                    type: 'downloadDanmakuForQuark',
                    bvid: bvid,
                    quarkVideoId: videoId,
                    videoDuration: videoDuration
                });

                if (response.success) {
                    console.log(`[Quark] 弹幕下载成功: ${response.count} 条`);
                    
                    // 显示成功状态
                    if (overlay) {
                        overlay.innerHTML = `<span class="qb-success-icon">✓</span><span>${response.count}条</span>`;
                        overlay.classList.add('qb-overlay-success');
                    }

                    // 初始化弹幕引擎并加载弹幕
                    if (!danmakuEngine) {
                        await initDanmakuEngine();
                    }
                    await loadDanmakuForVideo(videoId);

                    // 2秒后隐藏覆盖层
                    setTimeout(() => {
                        if (overlay) {
                            overlay.style.display = 'none';
                            overlay.classList.remove('qb-overlay-success');
                        }
                    }, 2000);
                } else {
                    throw new Error(response.error || '下载失败');
                }
            } catch (error) {
                console.error('[Quark] 弹幕下载失败:', error);
                if (overlay) {
                    overlay.innerHTML = '<span class="qb-error-icon">✗</span>';
                    overlay.classList.add('qb-overlay-error');
                    setTimeout(() => {
                        overlay.style.display = 'none';
                        overlay.classList.remove('qb-overlay-error');
                    }, 2000);
                }
            }
        }

        // 后台自动搜索（不显示浮窗）
        async function backgroundSearchBilibiliVideo() {
            const videoId = getQuarkVideoId();
            if (!videoId) return;

            // 获取并清理视频标题
            const rawTitle = getVideoTitle();
            if (!rawTitle) return;

            const cleanedTitle = cleanQuarkVideoTitle(rawTitle);
            if (!cleanedTitle || cleanedTitle.length < 2) return;

            cachedSearchKeyword = cleanedTitle;
            
            // 更新搜索框的值
            const searchInput = document.getElementById('qb-search-input');
            if (searchInput) {
                searchInput.value = cleanedTitle;
            }

            console.log(`[Quark] 后台搜索: "${cleanedTitle}"`);

            try {
                const response = await browser.runtime.sendMessage({
                    type: 'searchBilibiliVideoAllV2',
                    keyword: cleanedTitle
                });

                console.log('[Quark] B站搜索结果:', response);

                if (response.success && response.results && response.results.length > 0) {
                    cachedSearchResults = response.results;
                    // 不自动显示，只缓存结果
                    console.log(`[Quark] 已缓存 ${response.results.length} 个搜索结果`);
                }
            } catch (error) {
                console.error('[Quark] 后台搜索失败:', error);
            }
        }

        // ==================== 原有功能 ====================

        // 从 URL 获取 Quark 视频 ID
        function getQuarkVideoId() {
            const hash = window.location.hash;
            const match = hash.match(/#\/video\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        }

        // 检查是否在视频播放页面
        function isVideoPage() {
            return window.location.hash.includes('#/video/');
        }

        // 等待 video 元素真正准备好
        function waitForVideo(maxAttempts = 30) {
            return new Promise((resolve) => {
                let attempts = 0;
                
                const check = () => {
                    attempts++;
                    const video = document.querySelector('video');
                    
                    if (!video) {
                        if (attempts < maxAttempts) {
                            setTimeout(check, 500);
                        } else {
                            console.log('[Quark] 等待 video 元素超时');
                            resolve(null);
                        }
                        return;
                    }
                    
                    // 获取视频和屏幕尺寸
                    const videoRect = video.getBoundingClientRect();
                    const screenWidth = window.innerWidth;
                    const screenHeight = window.innerHeight;
                    
                    // 检查视频是否真正准备好：
                    // 1. readyState >= 1 (有元数据)
                    // 2. 视频尺寸不等于全屏尺寸（非全屏状态下）
                    const isFullscreenMode = document.fullscreenElement || document.webkitFullscreenElement;
                    const isVideoReady = video.readyState >= 1;
                    const isNotFullscreenSize = isFullscreenMode || 
                        (videoRect.width < screenWidth * 0.99 || videoRect.height < screenHeight * 0.99);
                    
                    console.log('[Quark] 检查 video 状态:', {
                        attempt: attempts,
                        readyState: video.readyState,
                        videoSize: `${videoRect.width.toFixed(0)} x ${videoRect.height.toFixed(0)}`,
                        screenSize: `${screenWidth} x ${screenHeight}`,
                        isVideoReady,
                        isNotFullscreenSize,
                        isFullscreenMode: !!isFullscreenMode
                    });
                    
                    if (isVideoReady && isNotFullscreenSize && videoRect.width > 0 && videoRect.height > 0) {
                        console.log('[Quark] video 已准备好，尺寸:', videoRect.width.toFixed(0), 'x', videoRect.height.toFixed(0));
                        // 保存正确的 video 尺寸
                        savedVideoRect = {
                            width: videoRect.width,
                            height: videoRect.height,
                            left: videoRect.left,
                            top: videoRect.top
                        };
                        resolve(video);
                    } else if (attempts < maxAttempts) {
                        setTimeout(check, 300);
                    } else {
                        console.log('[Quark] 等待 video 准备超时，尝试使用当前尺寸');
                        // 超时也要保存尺寸（可能不准确，但比 null 好）
                        if (videoRect.width > 0 && videoRect.height > 0) {
                            savedVideoRect = {
                                width: videoRect.width,
                                height: videoRect.height,
                                left: videoRect.left,
                                top: videoRect.top
                            };
                        }
                        resolve(video);
                    }
                };
                
                check();
            });
        }

        // 同步弹幕容器位置与 video 元素
        function syncStageWithVideo() {
            const video = document.querySelector('video');
            const container = document.getElementById('quark-danmaku-container');
            if (!video || !container) return;

            const videoRect = video.getBoundingClientRect();

            // 更新容器位置（跟随 video）
            container.style.left = `${videoRect.left}px`;
            container.style.top = `${videoRect.top}px`;

            console.log('[Quark] 同步弹幕位置:', {
                left: videoRect.left,
                top: videoRect.top
            });
        }

        // 初始化弹幕引擎
        async function initDanmakuEngine() {
            if (!isVideoPage()) {
                console.log('[Quark] 非视频播放页面，跳过初始化');
                return false;
            }

            // 检查是否已经有正确的弹幕容器
            const existingContainer = document.getElementById('quark-danmaku-container');
            if (existingContainer && danmakuEngine) {
                console.log('[Quark] 弹幕引擎已存在，跳过重复初始化');
                return true;
            }

            // 等待 video 元素出现
            const video = await waitForVideo();
            if (!video) {
                console.log('[Quark] 未找到 video 元素');
                return false;
            }

            // 检查 savedVideoRect 是否有效
            if (!savedVideoRect || savedVideoRect.width <= 0 || savedVideoRect.height <= 0) {
                console.log('[Quark] savedVideoRect 无效');
                return false;
            }

            console.log('[Quark] 准备创建弹幕容器，尺寸:', savedVideoRect);

            // 销毁旧的引擎和观察者
            if (danmakuEngine) {
                danmakuEngine.destroy();
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            // 创建一个固定尺寸的容器（使用保存的 video 尺寸）
            let fixedContainer = document.getElementById('quark-danmaku-container');
            if (fixedContainer) {
                fixedContainer.remove();
            }
            fixedContainer = document.createElement('div');
            fixedContainer.id = 'quark-danmaku-container';
            fixedContainer.style.cssText = `
                position: fixed;
                width: ${savedVideoRect.width}px;
                height: ${savedVideoRect.height}px;
                left: ${savedVideoRect.left}px;
                top: ${savedVideoRect.top}px;
                pointer-events: none;
                z-index: 99999;
                overflow: hidden;
            `;
            document.body.appendChild(fixedContainer);

            // 创建新引擎（使用固定尺寸的容器）
            danmakuEngine = new DanmakuEngine(fixedContainer);

            // 禁用 DanmakuEngine 的自动尺寸监听
            if (danmakuEngine.resizeObserver) {
                danmakuEngine.resizeObserver.disconnect();
            }

            console.log('[Quark] 弹幕容器已创建，尺寸:', savedVideoRect.width, 'x', savedVideoRect.height);

            // 监听滚动事件（非全屏时 fixed 定位需要跟随位置）
            window.addEventListener('scroll', () => {
                const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
                if (!fullscreenElement) {
                    syncStageWithVideo();
                }
            }, { passive: true });

            // 监听全屏变化
            const fullscreenHandler = () => {
                const container = document.getElementById('quark-danmaku-container');
                if (!container) return;

                const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
                
                if (fullscreenElement) {
                    // 进入全屏：把容器移到全屏元素内，使用 absolute 定位
                    console.log('[Quark] 进入全屏模式');
                    fullscreenElement.appendChild(container);
                    container.style.position = 'absolute';
                    container.style.left = '0';
                    container.style.top = '0';
                    container.style.width = '100%';
                    container.style.height = '100%';
                    
                    // 重新初始化轨道（使用全屏尺寸）
                    setTimeout(() => {
                        if (danmakuEngine) {
                            danmakuEngine.initTracks();
                        }
                    }, 100);
                } else {
                    // 退出全屏：移回 body，恢复 fixed 定位和原始尺寸
                    console.log('[Quark] 退出全屏模式');
                    document.body.appendChild(container);
                    container.style.position = 'fixed';
                    container.style.width = `${savedVideoRect.width}px`;
                    container.style.height = `${savedVideoRect.height}px`;
                    container.style.left = `${savedVideoRect.left}px`;
                    container.style.top = `${savedVideoRect.top}px`;
                    
                    // 重新初始化轨道（使用原始尺寸）
                    setTimeout(() => {
                        if (danmakuEngine) {
                            danmakuEngine.initTracks();
                        }
                    }, 100);
                }
            };
            document.addEventListener('fullscreenchange', fullscreenHandler);
            document.addEventListener('webkitfullscreenchange', fullscreenHandler);

            // 加载设置
            await loadSettings();

            // 尝试加载当前视频的弹幕
            const videoId = getQuarkVideoId();
            if (videoId) {
                currentVideoId = videoId;
                await loadDanmakuForVideo(videoId);
            }
            
            console.log('[Quark] 弹幕引擎初始化完成');
            return true;
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
                weightThreshold: 0
            };

            if (danmakuEngine) {
                danmakuEngine.updateSettings(settings);
            }
        }

        // 加载视频弹幕
        async function loadDanmakuForVideo(videoId) {
            try {
                const storageKey = `quark_${videoId}`;
                const result = await browser.storage.local.get(storageKey);
                
                if (result[storageKey] && result[storageKey].danmakus) {
                    const data = result[storageKey];
                    console.log(`[Quark] 加载弹幕数据: ${data.danmakus.length} 条`);

                    if (danmakuEngine) {
                        danmakuEngine.loadDanmakus(data.danmakus);
                    }
                    return true;
                } else {
                    console.log('[Quark] 没有找到弹幕数据');
                    return false;
                }
            } catch (error) {
                console.error('[Quark] 加载弹幕失败:', error);
                return false;
            }
        }

        // 监听 URL 变化（Quark 是 SPA，使用 hash 路由）
        let lastHash = location.hash;
        
        window.addEventListener('hashchange', () => {
            const newHash = location.hash;
            if (newHash !== lastHash) {
                lastHash = newHash;
                handleHashChange();
            }
        });

        // 处理 hash 变化
        function handleHashChange() {
            const videoId = getQuarkVideoId();
            
            if (videoId && videoId !== currentVideoId) {
                console.log('[Quark] 视频切换:', { from: currentVideoId, to: videoId });
                currentVideoId = videoId;
                
                // 延迟初始化，等待页面加载
                setTimeout(initDanmakuEngine, 1000);
            } else if (!videoId && currentVideoId) {
                // 离开视频页面
                console.log('[Quark] 离开视频页面');
                if (danmakuEngine) {
                    danmakuEngine.destroy();
                    danmakuEngine = null;
                }
                currentVideoId = null;
            }
        }

        // 监听来自 popup 的消息
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
                // Quark 使用带前缀的 key
                const videoId = getQuarkVideoId();
                if (videoId) {
                    (async () => {
                        // 如果弹幕引擎还没初始化，先初始化
                        if (!danmakuEngine) {
                            console.log('[Quark] 弹幕引擎未初始化，正在初始化...');
                            await initDanmakuEngine();
                        }
                        // 直接加载弹幕，不要重新同步尺寸
                        await loadDanmakuForVideo(videoId);
                    })();
                }
            } else if (request.type === 'getPageInfo') {
                // 返回 Quark 页面信息
                const videoId = getQuarkVideoId();
                const videoTitle = document.querySelector('[class*="video-title"], [class*="file-name"]')?.textContent?.trim() || '';
                
                sendResponse({
                    success: true,
                    data: {
                        platform: 'quark',
                        videoId: videoId,
                        videoTitle: videoTitle,
                        url: window.location.href,
                        timestamp: Date.now()
                    }
                });
                return true;
            } else if (request.type === 'seekToTime') {
                const video = document.querySelector('video');
                if (video) {
                    video.currentTime = request.time;
                }
            }

            return true;
        });

        // 页面加载完成后初始化
        console.log('[Quark] 弹幕脚本开始加载, URL:', window.location.href);
        console.log('[Quark] 是否在视频页面:', isVideoPage());
        
        // 初始化函数
        async function initAll() {
            // 初始化弹幕引擎
            const success = await initDanmakuEngine();
            console.log('[Quark] 初始化结果:', success);
            
            // 添加B站弹幕按钮
            setTimeout(() => {
                addDanmakuButton();
                // 后台搜索（不显示浮窗）
                backgroundSearchBilibiliVideo();
            }, 500);
        }
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('[Quark] DOMContentLoaded, 准备初始化弹幕引擎');
                setTimeout(initAll, 1500);
            });
        } else {
            console.log('[Quark] 文档已加载, 准备初始化弹幕引擎');
            setTimeout(initAll, 1500);
        }

        console.log('[Quark] 弹幕脚本已加载完成');
    }
});
