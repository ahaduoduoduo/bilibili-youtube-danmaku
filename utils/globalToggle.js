// Global toggle helpers for extension privacy master switch

export async function getExtensionEnabled() {
    try {
        const result = await browser.storage.local.get('extension_enabled');
        if (typeof result.extension_enabled === 'boolean') return result.extension_enabled;
        // Default true if not set
        return true;
    } catch (e) {
        return true;
    }
}

export async function setExtensionEnabled(enabled) {
    await browser.storage.local.set({ extension_enabled: !!enabled });
}

export function applyNetworkAndTimerGuards(disabled) {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (!g.__ext_guard_state) {
        g.__ext_guard_state = {
            origFetch: g.fetch,
            origSetTimeout: g.setTimeout,
            origSetInterval: g.setInterval,
            origClearTimeout: g.clearTimeout,
            origClearInterval: g.clearInterval,
            guarded: false
        };
    }

    const state = g.__ext_guard_state;

    function install() {
        if (state.guarded) return;
        // Block fetch
        g.fetch = function () {
            return Promise.reject(new Error('Extension disabled'));
        };
        // Block timers
        g.setTimeout = function () {
            return 0;
        };
        g.setInterval = function () {
            return 0;
        };
        // Keep clearTimeout/clearInterval functional so existing timers can be cleaned up
        g.clearTimeout = state.origClearTimeout;
        g.clearInterval = state.origClearInterval;
        state.guarded = true;
    }

    function uninstall() {
        if (!state.guarded) return;
        g.fetch = state.origFetch;
        g.setTimeout = state.origSetTimeout;
        g.setInterval = state.origSetInterval;
        g.clearTimeout = state.origClearTimeout;
        g.clearInterval = state.origClearInterval;
        state.guarded = false;
    }

    if (disabled) install();
    else uninstall();
}

export function applyStorageGuards(disabled) {
    try {
        const g = typeof globalThis !== 'undefined' ? globalThis : window;
        if (!g.__ext_storage_guard_state) {
            const ls = browser?.storage?.local;
            g.__ext_storage_guard_state = ls
                ? {
                      origGet: ls.get.bind(ls),
                      origSet: ls.set.bind(ls),
                      origRemove: ls.remove.bind(ls),
                      origClear: ls.clear.bind(ls),
                      guarded: false
                  }
                : { guarded: false };
        }

        const state = g.__ext_storage_guard_state;
        const ls = browser?.storage?.local;
        if (!ls) return;

        function install() {
            if (state.guarded) return;
            ls.get = async function (keys) {
                try {
                    // Only allow reading extension_enabled
                    return await state.origGet('extension_enabled');
                } catch (e) {
                    return {};
                }
            };
            ls.set = async function (items) {
                // Only allow writing extension_enabled
                if (items && Object.prototype.hasOwnProperty.call(items, 'extension_enabled')) {
                    return state.origSet({ extension_enabled: !!items.extension_enabled });
                }
                return;
            };
            ls.remove = async function () {
                return;
            };
            ls.clear = async function () {
                return;
            };
            state.guarded = true;
        }

        function uninstall() {
            if (!state.guarded) return;
            ls.get = state.origGet;
            ls.set = state.origSet;
            ls.remove = state.origRemove;
            ls.clear = state.origClear;
            state.guarded = false;
        }

        if (disabled) install();
        else uninstall();
    } catch (e) {}
}

export function forwardToggleToAllTabs(enabled) {
    try {
        browser.tabs
            .query({})
            .then((tabs) => {
                for (const tab of tabs) {
                    if (!tab.id) continue;
                    browser.tabs
                        .sendMessage(tab.id, {
                            type: 'EXTENSION_GLOBAL_TOGGLE',
                            enabled: !!enabled
                        })
                        .catch(() => {});
                }
            })
            .catch(() => {});
    } catch (e) {}
}

// Icon switching utilities
export function updateExtensionIcon(enabled) {
    try {
        const iconPath = enabled
            ? {
                  16: 'icon-16.png',
                  48: 'icon-48.png',
                  128: 'icon-128.png'
              }
            : {
                  16: 'icon-16-off.png',
                  48: 'icon-48-off.png',
                  128: 'icon-128-off.png'
              };

        if (browser.action && browser.action.setIcon) {
            browser.action.setIcon({ path: iconPath }).catch(() => {
                // Fallback for older browsers
                if (browser.browserAction && browser.browserAction.setIcon) {
                    browser.browserAction.setIcon({ path: iconPath }).catch(() => {});
                }
            });
        } else if (browser.browserAction && browser.browserAction.setIcon) {
            // For Manifest V2 compatibility
            browser.browserAction.setIcon({ path: iconPath }).catch(() => {});
        }
    } catch (e) {
        console.warn('Failed to update extension icon:', e);
    }
}
