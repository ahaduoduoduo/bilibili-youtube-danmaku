/**
 * 频道关联管理工具
 * 统一管理 YouTube 频道与 B站 UP主的关联关系
 */

class ChannelAssociationManager {
    constructor() {
        this.STORAGE_KEY = 'channelMappings';
        this.REMOTE_DB_URL =
            'https://raw.githubusercontent.com/ahaduoduoduo/bilibili-youtube-danmaku/main/channel-associations.json';
    }

    /**
     * 获取频道关联信息（先本地后远程）
     * @param {string} channelId - YouTube频道ID
     * @returns {Promise<Object|null>} 关联信息或null
     */
    async getChannelAssociation(channelId) {
        try {
            if (!channelId) return null;

            // 1. 先查本地存储
            const localResult = await this.getLocalAssociation(channelId);
            if (localResult) {
                console.log('使用本地关联数据:', channelId);
                return localResult;
            }

            // 2. 本地无结果时查远程
            console.log('本地无关联数据，尝试远程获取:', channelId);
            try {
                const remoteResult = await this.getRemoteAssociation(channelId);
                if (remoteResult) {
                    console.log('远程获取成功:', channelId);
                    return remoteResult;
                }
            } catch (error) {
                console.log('远程获取失败，回退到本地模式:', error.message);
            }

            return null;
        } catch (error) {
            console.error('获取频道关联信息失败:', error);
            return null;
        }
    }

    /**
     * 判断频道是否已关联
     * @param {string} channelId - YouTube频道ID
     * @returns {Promise<boolean>} 是否已关联
     */
    async isChannelAssociated(channelId) {
        const association = await this.getChannelAssociation(channelId);
        return association !== null && association.bilibiliUID;
    }

    /**
     * 保存频道关联
     * @param {string} channelId - YouTube频道ID
     * @param {Object} associationData - 关联数据
     * @param {string} associationData.bilibiliUID - B站用户UID
     * @param {string} [associationData.bilibiliName] - B站用户名称
     * @param {string} [associationData.bilibiliSpaceUrl] - B站空间链接
     * @returns {Promise<boolean>} 保存是否成功
     */
    async saveChannelAssociation(channelId, associationData) {
        try {
            if (!channelId || !associationData.bilibiliUID) {
                throw new Error('缺少必要的关联参数');
            }

            const result = await browser.storage.local.get(this.STORAGE_KEY);
            const mappings = result[this.STORAGE_KEY] || {};

            mappings[channelId] = {
                bilibiliUID: associationData.bilibiliUID,
                bilibiliName: associationData.bilibiliName || '',
                bilibiliSpaceUrl: associationData.bilibiliSpaceUrl || '',
                lastUpdate: Date.now()
            };

            await browser.storage.local.set({ [this.STORAGE_KEY]: mappings });
            return true;
        } catch (error) {
            console.error('保存频道关联失败:', error);
            return false;
        }
    }

    /**
     * 删除频道关联
     * @param {string} channelId - YouTube频道ID
     * @returns {Promise<boolean>} 删除是否成功
     */
    async removeChannelAssociation(channelId) {
        try {
            if (!channelId) return false;

            const result = await browser.storage.local.get(this.STORAGE_KEY);
            const mappings = result[this.STORAGE_KEY] || {};

            delete mappings[channelId];

            await browser.storage.local.set({ [this.STORAGE_KEY]: mappings });
            return true;
        } catch (error) {
            console.error('删除频道关联失败:', error);
            return false;
        }
    }

    /**
     * 获取所有关联
     * @returns {Promise<Object>} 所有关联映射
     */
    async getAllAssociations() {
        try {
            const result = await browser.storage.local.get(this.STORAGE_KEY);
            return result[this.STORAGE_KEY] || {};
        } catch (error) {
            console.error('获取所有关联失败:', error);
            return {};
        }
    }

    /**
     * 获取关联统计信息
     * @returns {Promise<Object>} 统计信息
     */
    async getAssociationStats() {
        try {
            const mappings = await this.getAllAssociations();
            const channelIds = Object.keys(mappings);
            const totalCount = channelIds.length;
            const recentCount = channelIds.filter((id) => {
                const association = mappings[id];
                return (
                    association.lastUpdate &&
                    Date.now() - association.lastUpdate < 30 * 24 * 60 * 60 * 1000
                );
            }).length;

            return {
                totalAssociations: totalCount,
                recentAssociations: recentCount,
                associatedChannels: channelIds
            };
        } catch (error) {
            console.error('获取关联统计失败:', error);
            return {
                totalAssociations: 0,
                recentAssociations: 0,
                associatedChannels: []
            };
        }
    }

    /**
     * 验证关联数据格式
     * @param {Object} associationData - 关联数据
     * @returns {boolean} 数据是否有效
     */
    validateAssociationData(associationData) {
        if (!associationData || typeof associationData !== 'object') {
            return false;
        }

        // 必须有bilibiliUID
        if (!associationData.bilibiliUID || typeof associationData.bilibiliUID !== 'string') {
            return false;
        }

        // 验证UID格式（纯数字）
        if (!/^\d+$/.test(associationData.bilibiliUID)) {
            return false;
        }

        return true;
    }

    /**
     * 获取本地关联信息
     * @param {string} channelId - YouTube频道ID
     * @returns {Promise<Object|null>} 本地关联信息或null
     */
    async getLocalAssociation(channelId) {
        try {
            const result = await browser.storage.local.get(this.STORAGE_KEY);
            const mappings = result[this.STORAGE_KEY] || {};
            return mappings[channelId] || null;
        } catch (error) {
            console.error('获取本地关联信息失败:', error);
            return null;
        }
    }

    /**
     * 从远程获取关联信息
     * @param {string} channelId - YouTube频道ID
     * @returns {Promise<Object|null>} 远程关联信息或null
     */
    async getRemoteAssociation(channelId) {
        try {
            const remoteData = await this.fetchRemoteAssociations();
            if (!remoteData || !remoteData.channels) {
                return null;
            }

            const match = remoteData.channels.find(
                (channel) => channel.youtubeChannelId === channelId
            );

            if (match) {
                // 转换为本地存储格式
                return {
                    bilibiliUID: match.bilibiliUID,
                    bilibiliName: match.bilibiliName || '',
                    bilibiliSpaceUrl: `https://space.bilibili.com/${match.bilibiliUID}`,
                    lastUpdate: Date.now(),
                    source: 'remote' // 标记数据来源
                };
            }

            return null;
        } catch (error) {
            console.error('远程获取关联信息失败:', error);
            return null;
        }
    }

    /**
     * 从远程获取完整的关联数据库
     * @returns {Promise<Object|null>} 远程数据或null
     */
    async fetchRemoteAssociations() {
        try {
            const response = await fetch(this.REMOTE_DB_URL, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                },
                // 不缓存，每次都获取最新数据
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // 简单格式验证
            if (!data || !Array.isArray(data.channels)) {
                throw new Error('远程数据格式无效');
            }

            console.log(`远程关联库获取成功，包含 ${data.channels.length} 个频道`);
            return data;
        } catch (error) {
            console.error('获取远程关联库失败:', error);
            throw error;
        }
    }

    /**
     * 解析B站空间链接获取UID
     * @param {string} spaceUrl - B站空间链接
     * @returns {string|null} UID或null
     */
    parseBilibiliSpaceUrl(spaceUrl) {
        if (!spaceUrl) return null;
        const match = spaceUrl.match(/space\.bilibili\.com\/(\d+)/);
        return match ? match[1] : null;
    }
}

// 创建全局实例
const channelAssociation = new ChannelAssociationManager();

// 兼容性：提供简化的全局函数接口
window.getChannelAssociation = (channelId) => channelAssociation.getChannelAssociation(channelId);
window.getLocalAssociation = (channelId) => channelAssociation.getLocalAssociation(channelId);
window.getRemoteAssociation = (channelId) => channelAssociation.getRemoteAssociation(channelId);
window.isChannelAssociated = (channelId) => channelAssociation.isChannelAssociated(channelId);
window.saveChannelAssociation = (channelId, data) =>
    channelAssociation.saveChannelAssociation(channelId, data);
window.removeChannelAssociation = (channelId) =>
    channelAssociation.removeChannelAssociation(channelId);

// ES模块导出
export { ChannelAssociationManager, channelAssociation };
export default channelAssociation;
