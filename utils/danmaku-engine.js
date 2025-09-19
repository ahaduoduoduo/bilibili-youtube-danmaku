class DanmakuEngine {
    constructor(container) {
        this.container = container;
        this.stage = null;
        this.danmakus = [];
        this.tracks = [];
        this.settings = {
            enabled: true,
            timeOffset: 0,
            opacity: 100,
            fontSize: 24,
            speed: 1.0, // 添加速度控制
            trackSpacing: 8, // 轨道间距
            displayAreaPercentage: 100, // 显示区域百分比
            weightThreshold: 0 // 弹幕权重阈值
        };
        this.video = null;
        this.isStarted = false;

        // seeking/seeked 配对过滤
        this.lastVideoTime = 0;
        this.seekingThreshold = 0.5; // 时间变化阈值（秒）
        this.isRealSeeking = false; // 标记是否为真正的拖拽

        this.init();
    }

    init() {
        // 创建弹幕舞台
        this.stage = document.createElement('div');
        this.stage.className = 'bilibili-danmaku-stage';
        this.container.appendChild(this.stage);

        // 查找视频元素
        this.video = document.querySelector('video');
        if (this.video) {
            this.bindVideoEvents();
        }

        // 初始化轨道
        this.initTracks();

        // 监听容器尺寸变化
        this.observeResize();
    }

    observeResize() {
        // 使用 ResizeObserver 监听容器尺寸变化
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateStageSize();
                this.initTracks();
            });
            this.resizeObserver.observe(this.container);

            // 同时监听视频元素
            if (this.video) {
                this.resizeObserver.observe(this.video);
            }
        }

        // 同时监听全屏变化
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
    }

    updateStageSize() {
        // 确保弹幕舞台覆盖整个容器
        if (this.stage && this.container) {
            const rect = this.container.getBoundingClientRect();
            console.log(
                '弹幕容器:',
                this.container.className,
                '尺寸:',
                rect.width,
                'x',
                rect.height
            );

            // 调试模式：显示边框
            if (window.location.hash === '#debug-danmaku') {
                this.stage.style.border = '2px solid red';
                this.stage.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            }
        }
    }

    handleFullscreenChange() {
        setTimeout(() => {
            console.log('全屏状态变化 - 流畅转换弹幕');
            this.updateStageSize();
            this.initTracks();
        }, 100);
    }

    initTracks() {
        // 保存现有弹幕items
        const existingItems = [];
        if (this.tracks && this.tracks.length > 0) {
            this.tracks.forEach((track) => {
                existingItems.push(...track.items);
            });
        }

        const stageHeight = this.container.offsetHeight;
        const usableHeight = stageHeight * (this.settings.displayAreaPercentage / 100);
        const trackHeight = this.settings.fontSize + this.settings.trackSpacing;
        const trackCount = Math.floor(usableHeight / trackHeight);

        console.log('初始化弹幕轨道:', {
            容器高度: stageHeight,
            可用高度: usableHeight,
            显示区域: this.settings.displayAreaPercentage + '%',
            轨道高度: trackHeight,
            轨道数量: trackCount,
            现有弹幕数量: existingItems.length
        });

        // 重新创建轨道
        this.tracks = [];
        for (let i = 0; i < trackCount; i++) {
            this.tracks.push({
                top: i * trackHeight,
                items: []
            });
        }

        // 将现有弹幕重新分配到新轨道中
        existingItems.forEach((item) => {
            this.redistributeItemToNewTrack(item, trackHeight);
        });
    }

    redistributeItemToNewTrack(item, trackHeight) {
        if (!item.elem) return;

        // 获取弹幕当前的top位置
        const currentTop = parseInt(item.elem.style.top) || 0;

        // 计算应该分配到哪个新轨道
        const trackIndex = Math.floor(currentTop / trackHeight);

        // 检查轨道索引是否在可用范围内
        if (trackIndex >= this.tracks.length) {
            // 如果超出了可用轨道范围，移除这个弹幕
            item.elem.remove();
            console.log(`弹幕超出显示区域，已移除: ${currentTop}px`);
            return;
        }

        const targetTrack = this.tracks[trackIndex] || this.tracks[0];

        // 更新弹幕元素的top位置到新轨道
        item.elem.style.top = targetTrack.top + 'px';

        // 将item添加到新轨道
        targetTrack.items.push(item);

        console.log(`弹幕重新分配: 从${currentTop}px → 轨道${trackIndex} (${targetTrack.top}px)`);
    }

    bindVideoEvents() {
        // 初始化视频时间跟踪
        this.lastVideoTime = this.video.currentTime;
        this.pauseTime = 0;

        this.video.addEventListener('play', () => {
            this.start();
            // console.log('视频播放');
        });
        this.video.addEventListener('pause', () => {
            this.pause();
            this.pauseTime = this.video.currentTime;
            console.log('视频暂停');
        });
        this.video.addEventListener('seeking', () => {
            const currentTime = this.video.currentTime;
            let timeDiff = 0;
            if (this.pauseTime > 0) {
                timeDiff = Math.abs(currentTime - this.pauseTime);
            } else {
                timeDiff = Math.abs(currentTime - this.lastVideoTime);
            }
            console.log('时间差', timeDiff);

            if (timeDiff > this.seekingThreshold) {
                // 真正的拖拽
                console.log('真正的拖拽 - 清空弹幕', `时间差: ${timeDiff.toFixed(2)}s`);
                this.isRealSeeking = true;
                this.clear();
                this.resetDanmakuStates();
                this.isStarted = false;
            } else {
                // YouTube内部微调
                console.log('YouTube内部微调 - 忽略seeking', `时间差: ${timeDiff.toFixed(2)}s`);
                this.isRealSeeking = false;
            }

            this.lastVideoTime = currentTime;
        });
        this.video.addEventListener('seeked', () => {
            if (this.isRealSeeking) {
                // 只有真正拖拽的seeked才处理
                console.log('真正拖拽结束 - 重新同步弹幕');
                this.resyncDanmakus();
                if (!this.video.paused) {
                    this.start();
                }
            } else {
                console.log('忽略配对的seeked事件');
            }

            // 重置标记
            this.isRealSeeking = false;
        });

        // 监听播放速度变化
        this.video.addEventListener('ratechange', () => {
            this.handleSpeedChange(this.video.playbackRate);
        });
    }

    loadDanmakus(danmakus) {
        // 重置所有弹幕的发射状态
        this.danmakus = danmakus
            .map((d) => ({ ...d, emitted: false }))
            .sort((a, b) => a.time - b.time);
        this.clear();

        // 如果视频正在播放，重新同步弹幕
        if (this.video && !this.video.paused) {
            // 延迟一点再同步，确保DOM更新完成
            setTimeout(() => {
                this.resyncDanmakus();
                this.startEmitting();
            }, 100);
        }
    }

    updateSettings(settings) {
        const oldSettings = { ...this.settings };
        this.settings = { ...this.settings, ...settings };

        // 更新CSS变量
        this.stage.style.setProperty('--danmaku-font-size', `${this.settings.fontSize}px`);
        this.stage.style.setProperty('--danmaku-opacity', this.settings.opacity / 100);

        // 检查速度设置变化
        if (oldSettings.speed !== this.settings.speed) {
            console.log(`弹幕速度变化: ${oldSettings.speed} → ${this.settings.speed}`);
            this.updateAnimationSpeeds();
        }

        // 重新初始化轨道
        this.initTracks();

        // 如果禁用弹幕，清空舞台
        if (!this.settings.enabled) {
            this.clear();
            this.pause();
        } else {
            // 检查weight阈值是否发生变化
            if (oldSettings.weightThreshold !== this.settings.weightThreshold) {
                console.log(
                    `Weight阈值变化: ${oldSettings.weightThreshold} → ${this.settings.weightThreshold}`
                );
                // 异步重建弹幕，避免卡顿
                this.rebuildDanmakusAsync();
            } else if (this.video && !this.video.paused) {
                this.start();
            }
        }
    }

    // 更新所有动画的速度
    updateAnimationSpeeds() {
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation) {
                    // 计算新的duration
                    const newDuration = item.baseDuration / this.settings.speed;

                    // 获取当前进度
                    const currentTime = item.animation.currentTime || 0;
                    const oldDuration = item.animation.effect.getTiming().duration;
                    const progress = currentTime / oldDuration;

                    // 更新动画timing
                    item.animation.effect.updateTiming({ duration: newDuration });

                    // 保持相同的进度
                    item.animation.currentTime = progress * newDuration;
                }
            });
        });
    }

    // 异步重建弹幕，避免阻塞UI
    rebuildDanmakusAsync() {
        // 使用requestAnimationFrame确保不阻塞主线程
        requestAnimationFrame(() => {
            console.log('开始异步重建弹幕...');

            // 清空当前显示
            this.clear();

            // 重置弹幕状态
            this.resetDanmakuStates();

            // 如果视频正在播放，重新同步弹幕
            if (this.video && !this.video.paused) {
                this.resyncDanmakus();
                this.start();
            }

            console.log('弹幕重建完成');
        });
    }

    start() {
        if (!this.settings.enabled) return;

        this.isStarted = true;

        // 恢复所有弹幕动画
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation && item.animation.playState === 'paused') {
                    item.animation.play();
                }
            });
        });

        // 启动弹幕发射器
        this.startEmitting();
    }

    // 启动弹幕发射和清理循环
    startEmitting() {
        if (this.emittingInterval) {
            clearInterval(this.emittingInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // 使用requestAnimationFrame获得最高帧率
        this.emittingFrameId = null;
        this.cleanupFrameId = null;
        this.lastEmitTime = 0;
        this.lastCleanupTime = 0;

        const emitLoop = (currentTime) => {
            if (this.isStarted && this.video && !this.video.paused) {
                // 控制发射频率到每0.5秒一次
                if (currentTime - this.lastEmitTime >= 500) {
                    this.checkAndEmitDanmakus();
                    this.lastEmitTime = currentTime;
                }

                // 控制清理频率到每0.5秒一次
                if (currentTime - this.lastCleanupTime >= 500) {
                    this.cleanup();
                    this.lastCleanupTime = currentTime;
                }
            }

            if (this.isStarted) {
                this.emittingFrameId = requestAnimationFrame(emitLoop);
            }
        };

        this.emittingFrameId = requestAnimationFrame(emitLoop);
    }

    // 检查并发射新弹幕
    checkAndEmitDanmakus() {
        if (!this.video || !this.settings.enabled) return;

        const currentTime = this.video.currentTime + this.settings.timeOffset;

        // 发射新弹幕
        const newDanmakus = this.danmakus.filter((d) => {
            if (d.emitted) return false;

            // weight过滤
            if (this.settings.weightThreshold > 0) {
                const weight = d.weight !== undefined && d.weight !== null ? d.weight : 5;
                if (weight < this.settings.weightThreshold) {
                    return false;
                }
            }

            const timeDiff = d.time - currentTime;
            return timeDiff >= -0.5 && timeDiff <= 1.0;
        });

        // 按时间排序并限制数量
        newDanmakus
            .sort((a, b) => a.time - b.time)
            .slice(0, 10)
            .forEach((danmaku) => {
                if (!danmaku.emitted) {
                    this.emit(danmaku);
                    danmaku.emitted = true;
                }
            });
    }

    pause() {
        this.isStarted = false;

        // 停止发射器
        if (this.emittingInterval) {
            clearInterval(this.emittingInterval);
            this.emittingInterval = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.emittingFrameId) {
            cancelAnimationFrame(this.emittingFrameId);
            this.emittingFrameId = null;
        }

        // 暂停所有弹幕动画
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation && item.animation.playState === 'running') {
                    item.animation.pause();
                }
            });
        });
    }

    clear() {
        // 取消所有动画并清理DOM
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation) {
                    item.animation.cancel();
                }
                if (item.elem) {
                    item.elem.remove();
                }
            });
            track.items = [];
        });

        // 清空舞台
        this.stage.innerHTML = '';
    }

    // 重置所有弹幕的发射状态
    resetDanmakuStates() {
        if (this.danmakus && this.danmakus.length > 0) {
            this.danmakus.forEach((danmaku) => {
                danmaku.emitted = false;
            });
            console.log('已重置所有弹幕状态');
        }
    }

    // 处理播放速度变化
    handleSpeedChange(newRate) {
        console.log(`播放速度变化: ${newRate}x`);

        // Web Animations API实现：需要重新计算所有弹幕的时间进度
        // 保持弹幕视觉速度恒定，但同步到新的播放速度
        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                if (item.animation && item.danmaku) {
                    // 重新计算弹幕应该的进度
                    const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
                    const visualElapsed = (currentVideoTime - item.danmaku.time) / newRate;
                    const progressMs = Math.max(0, visualElapsed * 1000);
                    const duration = item.animation.effect.getTiming().duration;

                    if (progressMs <= duration) {
                        item.animation.currentTime = progressMs;
                    }
                }
            });
        });

        console.log('弹幕位置已根据新播放速度重新计算');
    }

    // 计算考虑播放速度的视觉经过时间
    calculateVisualElapsed(videoTime, danmakuStartTime, playbackRate) {
        const realElapsed = videoTime - danmakuStartTime;
        return realElapsed / playbackRate; // 播放速度越快，视觉经过时间越慢
    }

    // 重新同步弹幕显示
    resyncDanmakus() {
        if (!this.video || !this.settings.enabled) return;

        const currentTime = this.video.currentTime + this.settings.timeOffset;

        // 清空当前显示的弹幕
        this.clear();

        // 重置所有弹幕状态
        this.resetDanmakuStates();

        // 找出应该在当前时间点显示的弹幕（已经开始但还未结束的）
        const activeDanmakus = this.danmakus.filter((d) => {
            const timeDiff = currentTime - d.time;

            // weight过滤：如果设置了阈值，过滤掉低权重弹幕
            if (this.settings.weightThreshold > 0) {
                const weight = d.weight !== undefined && d.weight !== null ? d.weight : 5; // 默认权重5
                if (weight < this.settings.weightThreshold) {
                    return false;
                }
            }

            // 弹幕显示时长约8秒，考虑一定的缓冲时间
            return timeDiff >= -1.0 && timeDiff <= 8.0;
        });

        console.log(
            `重新同步弹幕: 当前时间=${currentTime.toFixed(2)}s, 应显示=${activeDanmakus.length}条`
        );

        // 立即发射这些弹幕，并调整它们的显示进度
        activeDanmakus.forEach((danmaku) => {
            const timeDiff = currentTime - danmaku.time;
            if (timeDiff >= 0 && timeDiff <= 8.0) {
                this.emitWithProgress(danmaku, timeDiff);
                danmaku.emitted = true;
            }
        });
    }

    // 发射弹幕并设置其进度
    emitWithProgress(danmaku, elapsed) {
        const elem = document.createElement('div');
        elem.textContent = danmaku.text;
        elem.style.color = danmaku.color || '#ffffff';
        elem.style.position = 'absolute';
        elem.style.whiteSpace = 'nowrap';
        elem.style.pointerEvents = 'none';
        elem.style.zIndex = '9999';

        // 查找可用轨道
        const track = this.findAvailableTrack();
        if (!track) return;

        elem.style.top = track.top + 'px';
        this.stage.appendChild(elem);

        // 获取弹幕宽度
        const danmakuWidth = elem.offsetWidth;
        const stageWidth = this.stage.offsetWidth;

        // 计算动画参数
        const baseDuration = 8000;
        const adjustedDuration = baseDuration / this.settings.speed;
        const currentPlaybackRate = this.video?.playbackRate || 1.0;

        // 使用Web Animations API创建动画
        const animation = elem.animate(
            [
                {
                    transform: `translateX(${stageWidth}px)`,
                    offset: 0
                },
                {
                    transform: `translateX(-${danmakuWidth}px)`,
                    offset: 1
                }
            ],
            {
                duration: adjustedDuration,
                easing: 'linear',
                fill: 'forwards'
            }
        );

        // 不设置playbackRate，让弹幕速度保持恒定
        // animation.playbackRate = currentPlaybackRate; // 移除

        // 设置动画进度到已经过的时间
        // 弹幕视觉速度保持恒定，需要根据播放速度反算实际经过时间
        const visualElapsed = elapsed / currentPlaybackRate; // 视觉上的经过时间
        const progressMs = visualElapsed * 1000;
        animation.currentTime = Math.max(0, Math.min(progressMs, adjustedDuration));

        const item = {
            elem: elem,
            animation: animation,
            startVideoTime: danmaku.time,
            baseDuration: baseDuration,
            width: danmakuWidth,
            danmaku: danmaku
        };

        track.items.push(item);
        return item;
    }

    // Web Animations API不需要手动动画循环
    // animate() 方法已被移除

    // update() 方法已被移除，功能分解到 checkAndEmitDanmakus() 和 cleanup()

    emit(danmaku) {
        const elem = document.createElement('div');
        elem.textContent = danmaku.text;
        elem.style.color = danmaku.color || '#ffffff';
        elem.style.position = 'absolute';
        elem.style.whiteSpace = 'nowrap';
        elem.style.pointerEvents = 'none';
        elem.style.zIndex = '9999';

        // 强制硬件加速和高性能
        elem.style.willChange = 'transform';
        elem.style.transform = 'translate3d(0, 0, 0)';
        elem.style.backfaceVisibility = 'hidden';
        elem.style.perspective = '1000px';

        // 查找可用轨道
        const track = this.findAvailableTrack();
        if (!track) return;

        elem.style.top = track.top + 'px';
        this.stage.appendChild(elem);

        // 获取弹幕宽度
        const danmakuWidth = elem.offsetWidth;
        const stageWidth = this.stage.offsetWidth;

        // 计算动画参数
        const baseDuration = 8000; // 基础8秒
        const adjustedDuration = baseDuration / this.settings.speed;
        // 移除playbackRate的影响，让弹幕速度保持恒定

        // 使用Web Animations API创建动画
        const animation = elem.animate(
            [
                {
                    transform: `translateX(${stageWidth}px)`,
                    offset: 0
                },
                {
                    transform: `translateX(-${danmakuWidth}px)`,
                    offset: 1
                }
            ],
            {
                duration: adjustedDuration,
                easing: 'linear',
                fill: 'forwards'
            }
        );

        // 不设置playbackRate，让弹幕速度保持恒定
        // animation.playbackRate = currentPlaybackRate; // 移除

        const item = {
            elem: elem,
            animation: animation,
            startVideoTime: this.video?.currentTime + this.settings.timeOffset || 0,
            baseDuration: baseDuration,
            width: danmakuWidth,
            danmaku: danmaku
        };

        track.items.push(item);
        return item;
    }

    findAvailableTrack() {
        if (!this.video) return this.tracks[0];

        const stageWidth = this.stage.offsetWidth;
        const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
        const playbackRate = this.video.playbackRate || 1.0;

        for (const track of this.tracks) {
            let available = true;

            for (const item of track.items) {
                if (!item.animation || !item.danmaku) continue;

                // 计算考虑播放速度的视觉进度
                const visualElapsed = this.calculateVisualElapsed(
                    currentVideoTime,
                    item.danmaku.time,
                    playbackRate
                );

                const duration = item.animation.effect.getTiming().duration / 1000; // 转换为秒
                const progress = Math.min(visualElapsed / duration, 1);

                // 计算当前位置
                const totalDistance = stageWidth + item.width;
                const itemX = stageWidth - progress * totalDistance;

                // 检查是否会重叠（保留100px间距）
                if (itemX + item.width > stageWidth - 100) {
                    available = false;
                    break;
                }
            }

            if (available) {
                return track;
            }
        }

        // 如果没有完全空闲的轨道，选择最快空闲的
        return this.tracks[Math.floor(Math.random() * this.tracks.length)];
    }

    // updatePositions() 方法已被移除，Web Animations API自动处理位置更新

    // updateItemPosition() 方法已被移除，Web Animations API自动处理位置计算

    cleanup() {
        const stageWidth = this.stage.offsetWidth;

        this.tracks.forEach((track) => {
            track.items = track.items.filter((item) => {
                if (!item.animation) {
                    // 没有动画的异常情况，直接移除
                    if (item.elem) item.elem.remove();
                    return false;
                }

                // 检查动画状态
                const animationState = item.animation.playState;

                // 动画完成或被取消时移除
                if (animationState === 'finished' || animationState === 'idle') {
                    if (item.elem) item.elem.remove();
                    return false;
                }

                // 使用Web Animations API检查位置
                const currentTime = item.animation.currentTime || 0;
                const duration = item.animation.effect.getTiming().duration;
                const progress = currentTime / duration;

                // 计算当前位置
                const totalDistance = stageWidth + item.width;
                const x = stageWidth - progress * totalDistance;

                // 当弹幕完全移出左侧边界时移除
                if (x < -item.width || progress >= 1) {
                    item.animation.cancel();
                    if (item.elem) item.elem.remove();
                    return false;
                }

                return true;
            });
        });
    }

    destroy() {
        this.pause();
        this.clear();

        // 清理所有定时器和动画帧
        if (this.emittingInterval) {
            clearInterval(this.emittingInterval);
            this.emittingInterval = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.emittingFrameId) {
            cancelAnimationFrame(this.emittingFrameId);
            this.emittingFrameId = null;
        }

        if (this.stage) {
            this.stage.remove();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
}

// ES模块导出
export default DanmakuEngine;
