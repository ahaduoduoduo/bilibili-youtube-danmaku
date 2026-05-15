import { defineConfig } from 'wxt';

const permissions = ['storage', 'activeTab', 'unlimitedStorage'];
const hostPermissions = [
    'https://api.bilibili.com/*',
    'https://www.bilibili.com/*',
    'https://www.youtube.com/oembed*',
    'https://raw.githubusercontent.com/*',
    'https://pan.quark.cn/*'
];

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: ({ browser }) => ({
        permissions,
        host_permissions: hostPermissions,
        ...(browser === 'firefox'
            ? {
                  browser_specific_settings: {
                      gecko: {
                          data_collection_permissions: {
                              required: ['browsingActivity', 'searchTerms', 'websiteContent']
                          }
                      }
                  }
              }
            : {})
    })
});
