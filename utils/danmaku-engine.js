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
        this.animationId = null; // 使用 requestAnimationFrame
        this.lastFrameTime = 0;
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

        this.video.addEventListener('play', () => {
            this.start();
        });
        this.video.addEventListener('pause', () => {
            this.pause();
        });
        this.video.addEventListener('seeking', () => {
            const currentTime = this.video.currentTime;
            const timeDiff = Math.abs(currentTime - this.lastVideoTime);

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
                this.start();
            }, 100);
        }
    }

    updateSettings(settings) {
        const oldWeightThreshold = this.settings.weightThreshold;
        this.settings = { ...this.settings, ...settings };

        // 更新CSS变量
        this.stage.style.setProperty('--danmaku-font-size', `${this.settings.fontSize}px`);
        this.stage.style.setProperty('--danmaku-opacity', this.settings.opacity / 100);

        // 重新初始化轨道
        this.initTracks();

        // 如果禁用弹幕，清空舞台
        if (!this.settings.enabled) {
            this.clear();
            this.pause();
        } else {
            // 检查weight阈值是否发生变化
            if (oldWeightThreshold !== this.settings.weightThreshold) {
                console.log(
                    `Weight阈值变化: ${oldWeightThreshold} → ${this.settings.weightThreshold}`
                );
                // 异步重建弹幕，避免卡顿
                this.rebuildDanmakusAsync();
            } else if (!this.video.paused) {
                this.start();
            }
        }
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

        this.pause();
        this.isStarted = true;
        this.lastFrameTime = performance.now();
        this.animate();
    }

    pause() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    clear() {
        this.stage.innerHTML = '';
        this.tracks.forEach((track) => (track.items = []));
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

        // 查找可用轨道
        const track = this.findAvailableTrack();
        if (!track) return;

        elem.style.top = track.top + 'px';
        this.stage.appendChild(elem);

        // 计算动画参数，基于视频时间
        const baseDuration = 8000;
        const startVideoTime = danmaku.time; // 直接使用弹幕的原始时间

        const item = {
            elem: elem,
            startVideoTime: startVideoTime,
            baseDuration: baseDuration,
            width: elem.offsetWidth
        };

        track.items.push(item);

        // 立即设置当前位置
        this.updateItemPosition(item);
    }

    animate() {
        if (!this.settings.enabled || !this.isStarted) return;

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastFrameTime;

        // 限制到120fps
        if (deltaTime >= 8) {
            this.update();
            this.lastFrameTime = currentTime;
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    update() {
        if (!this.video || !this.settings.enabled) return;

        const currentTime = this.video.currentTime + this.settings.timeOffset;

        // 发射新弹幕 - 优化发射逻辑，避免重复和爆发，增加weight过滤
        const newDanmakus = this.danmakus.filter((d) => {
            if (d.emitted) return false; // 已发射的跳过

            // weight过滤：如果设置了阈值，过滤掉低权重弹幕
            if (this.settings.weightThreshold > 0) {
                const weight = d.weight !== undefined && d.weight !== null ? d.weight : 5; // 默认权重5
                if (weight < this.settings.weightThreshold) {
                    return false;
                }
            }

            const timeDiff = d.time - currentTime;
            // 扩大发射窗口，但控制在合理范围内
            return timeDiff >= -0.5 && timeDiff <= 1.0; // 允许稍微提前发射
        });

        // 按时间排序并限制同时发射数量，避免弹幕爆发
        newDanmakus
            .sort((a, b) => a.time - b.time)
            .slice(0, 10) // 每次最多发射10条弹幕
            .forEach((danmaku) => {
                if (!danmaku.emitted) {
                    this.emit(danmaku);
                    danmaku.emitted = true;
                }
            });

        // 更新现有弹幕位置
        this.updatePositions();

        // 清理已经移出屏幕的弹幕
        this.cleanup();

        // 更新最后视频时间（用于seeking检测）
        this.lastVideoTime = this.video.currentTime;
    }

    emit(danmaku) {
        const elem = document.createElement('div');
        elem.textContent = danmaku.text;
        elem.style.color = danmaku.color || '#ffffff';

        // 查找可用轨道
        const track = this.findAvailableTrack();
        if (!track) return;

        elem.style.top = track.top + 'px';

        this.stage.appendChild(elem);

        // 计算动画参数 - 使用视频时间
        const baseDuration = 8000; // 基础8秒滚动时间

        const item = {
            elem: elem,
            startVideoTime: this.video.currentTime + this.settings.timeOffset, // 使用视频时间
            baseDuration: baseDuration, // 存储基础duration
            width: elem.offsetWidth
        };

        track.items.push(item);

        // 立即设置初始位置
        this.updateItemPosition(item);
    }

    findAvailableTrack() {
        if (!this.video) return this.tracks[0];

        const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
        const stageWidth = this.stage.offsetWidth;
        const playbackRate = this.video.playbackRate || 1.0; // 获取播放速度

        for (const track of this.tracks) {
            let available = true;

            for (const item of track.items) {
                // 基于视频时间计算进度，添加播放速度补偿
                const videoElapsed = currentVideoTime - item.startVideoTime;
                const actualDuration = item.baseDuration / 1000 / this.settings.speed;
                const itemProgress = videoElapsed / playbackRate / actualDuration; // 除以播放速度补偿

                // 动态计算总移动距离
                const totalDistance = stageWidth + item.width;

                // 计算当前位置
                const itemX = stageWidth - itemProgress * totalDistance;

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

    updatePositions() {
        const now = Date.now();
        const stageWidth = this.stage.offsetWidth;

        this.tracks.forEach((track) => {
            track.items.forEach((item) => {
                this.updateItemPosition(item);
            });
        });
    }

    updateItemPosition(item) {
        if (!this.video) return;

        const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
        const stageWidth = this.stage.offsetWidth;

        // 基于视频时间计算进度，添加播放速度补偿
        const videoElapsed = currentVideoTime - item.startVideoTime;
        const actualDuration = item.baseDuration / 1000 / this.settings.speed; // 转换为秒
        const playbackRate = this.video.playbackRate || 1.0; // 获取播放速度
        const progress = videoElapsed / playbackRate / actualDuration; // 除以播放速度补偿

        // 动态计算总移动距离
        const totalDistance = stageWidth + item.width;

        // 计算当前位置：从屏幕右侧外开始，到屏幕左侧外结束
        const x = stageWidth - progress * totalDistance;

        // 使用 translate3d 启用硬件加速
        item.elem.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    cleanup() {
        if (!this.video) return;

        const currentVideoTime = this.video.currentTime + this.settings.timeOffset;
        const stageWidth = this.stage.offsetWidth;
        const playbackRate = this.video.playbackRate || 1.0; // 获取播放速度

        this.tracks.forEach((track) => {
            track.items = track.items.filter((item) => {
                // 基于视频时间计算进度，添加播放速度补偿
                const videoElapsed = currentVideoTime - item.startVideoTime;
                const actualDuration = item.baseDuration / 1000 / this.settings.speed;
                const progress = videoElapsed / playbackRate / actualDuration; // 除以播放速度补偿

                // 动态计算总移动距离
                const totalDistance = stageWidth + item.width;

                // 计算当前位置
                const x = stageWidth - progress * totalDistance;

                // 当弹幕完全移出左侧边界时才移除
                if (x < -item.width) {
                    item.elem.remove();
                    return false;
                }
                return true;
            });
        });
    }

    destroy() {
        this.pause();
        this.clear();
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
