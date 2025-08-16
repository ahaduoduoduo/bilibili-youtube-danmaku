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
        ]
    }
});
