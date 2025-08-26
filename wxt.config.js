import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        permissions: ['storage', 'activeTab'],
        host_permissions: [
            'https://api.bilibili.com/*',
            'https://www.bilibili.com/*',
            'https://www.youtube.com/oembed*',
            'https://raw.githubusercontent.com/*'
        ],
        // 确保为不同浏览器提供正确的图标配置
        action: {
            default_icon: {
                16: 'icon-16.png',
                48: 'icon-48.png',
                128: 'icon-128.png'
            }
        },
        // Firefox 兼容性
        browser_action: {
            default_icon: {
                16: 'icon-16.png',
                48: 'icon-48.png',
                128: 'icon-128.png'
            }
        }
    }
});
