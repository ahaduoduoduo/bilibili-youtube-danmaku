// 原background.js

// 导入番剧处理模块
import { searchBilibiliBangumi, findEpisodeByNumber, getBangumiEpisodeDetail } from './bangumi.js';
// 引入protobuf解析器和OpenCC库
import '../../lib/protobuf-parser.js';
import '../../lib/opencc.min.js';

export default defineBackground(() => {
    // 页面状态管理
    let tabPageStates = new Map(); // 存储每个标签页的页面状态

    // 页面状态管理函数
    function getTabPageState(tabId) {
        return tabPageStates.get(tabId) || null;
    }

    function setTabPageState(tabId, pageInfo) {
        tabPageStates.set(tabId, {
            ...pageInfo,
            lastUpdate: Date.now()
        });
        console.log(`更新标签页${tabId}状态:`, pageInfo.videoId);
    }

    function clearTabPageState(tabId) {
        if (tabPageStates.has(tabId)) {
            console.log(`清除标签页${tabId}状态`);
            tabPageStates.delete(tabId);
        }
    }

    // 清理过期的页面状态（30秒过期）
    function cleanupExpiredPageStates() {
        const now = Date.now();
        const expireTime = 30000; // 30秒

        for (const [tabId, state] of tabPageStates.entries()) {
            if (now - state.lastUpdate > expireTime) {
                tabPageStates.delete(tabId);
                console.log(`清理过期页面状态: 标签页${tabId}`);
            }
        }
    }

    // 定期清理过期状态
    setInterval(cleanupExpiredPageStates, 60000); // 每分钟清理一次

    // 监听标签页关闭事件
    browser.tabs.onRemoved.addListener((tabId) => {
        clearTabPageState(tabId);
    });

    // WBI签名相关配置
    const mixinKeyEncTab = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
        29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
        22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
    ];

    // 对 imgKey 和 subKey 进行字符顺序打乱编码
    const getMixinKey = (orig) =>
        mixinKeyEncTab
            .map((n) => orig[n])
            .join('')
            .slice(0, 32);

    // 纯JavaScript实现的MD5算法
    function md5(string) {
        function RotateLeft(lValue, iShiftBits) {
            return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
        }

        function AddUnsigned(lX, lY) {
            var lX4, lY4, lX8, lY8, lResult;
            lX8 = lX & 0x80000000;
            lY8 = lY & 0x80000000;
            lX4 = lX & 0x40000000;
            lY4 = lY & 0x40000000;
            lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
            if (lX4 & lY4) {
                return lResult ^ 0x80000000 ^ lX8 ^ lY8;
            }
            if (lX4 | lY4) {
                if (lResult & 0x40000000) {
                    return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
                } else {
                    return lResult ^ 0x40000000 ^ lX8 ^ lY8;
                }
            } else {
                return lResult ^ lX8 ^ lY8;
            }
        }

        function F(x, y, z) {
            return (x & y) | (~x & z);
        }
        function G(x, y, z) {
            return (x & z) | (y & ~z);
        }
        function H(x, y, z) {
            return x ^ y ^ z;
        }
        function I(x, y, z) {
            return y ^ (x | ~z);
        }

        function FF(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        function GG(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        function HH(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        function II(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        function ConvertToWordArray(string) {
            var lWordCount;
            var lMessageLength = string.length;
            var lNumberOfWords_temp1 = lMessageLength + 8;
            var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
            var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
            var lWordArray = Array(lNumberOfWords - 1);
            var lBytePosition = 0;
            var lByteCount = 0;
            while (lByteCount < lMessageLength) {
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordArray[lWordCount] =
                    lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition);
                lByteCount++;
            }
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
            lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
            lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
            return lWordArray;
        }

        function WordToHex(lValue) {
            var WordToHexValue = '',
                WordToHexValue_temp = '',
                lByte,
                lCount;
            for (lCount = 0; lCount <= 3; lCount++) {
                lByte = (lValue >>> (lCount * 8)) & 255;
                WordToHexValue_temp = '0' + lByte.toString(16);
                WordToHexValue =
                    WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
            }
            return WordToHexValue;
        }

        function Utf8Encode(string) {
            string = string.replace(/\r\n/g, '\n');
            var utftext = '';

            for (var n = 0; n < string.length; n++) {
                var c = string.charCodeAt(n);
                if (c < 128) {
                    utftext += String.fromCharCode(c);
                } else if (c > 127 && c < 2048) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                } else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
            }
            return utftext;
        }

        var x = Array();
        var k, AA, BB, CC, DD, a, b, c, d;
        var S11 = 7,
            S12 = 12,
            S13 = 17,
            S14 = 22;
        var S21 = 5,
            S22 = 9,
            S23 = 14,
            S24 = 20;
        var S31 = 4,
            S32 = 11,
            S33 = 16,
            S34 = 23;
        var S41 = 6,
            S42 = 10,
            S43 = 15,
            S44 = 21;

        string = Utf8Encode(string);
        x = ConvertToWordArray(string);
        a = 0x67452301;
        b = 0xefcdab89;
        c = 0x98badcfe;
        d = 0x10325476;

        for (k = 0; k < x.length; k += 16) {
            AA = a;
            BB = b;
            CC = c;
            DD = d;
            a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
            d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
            c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
            b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
            a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
            d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
            c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
            b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
            a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
            d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
            c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
            b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
            a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
            d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
            c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
            b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
            a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
            d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
            c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
            b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
            a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
            d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
            c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
            b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
            a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
            d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
            c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
            b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
            a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
            d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
            c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
            b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
            a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
            d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
            c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
            b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
            a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
            d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
            c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
            b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
            a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
            d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
            c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
            b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);
            a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
            d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
            c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
            b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
            a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
            d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
            c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
            b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
            a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
            d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
            c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
            b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
            a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
            d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
            c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
            b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
            a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
            d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
            c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
            b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
            a = AddUnsigned(a, AA);
            b = AddUnsigned(b, BB);
            c = AddUnsigned(c, CC);
            d = AddUnsigned(d, DD);
        }

        var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
        return temp.toLowerCase();
    }

    // 为请求参数进行 wbi 签名
    function encWbi(params, img_key, sub_key) {
        const mixin_key = getMixinKey(img_key + sub_key);
        const curr_time = Math.round(Date.now() / 1000);
        const chr_filter = /[!'()*]/g;

        const safeParams = {};
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                safeParams[key] = String(value).replace(chr_filter, '');
            }
        }

        safeParams.wts = curr_time;

        const query = Object.keys(safeParams)
            .sort()
            .map((key) => {
                return `${encodeURIComponent(key)}=${encodeURIComponent(safeParams[key])}`;
            })
            .join('&');

        const wbi_sign = md5(query + mixin_key);
        return query + '&w_rid=' + wbi_sign;
    }

    // 获取最新的 img_key 和 sub_key
    async function getWbiKeys() {
        const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: 'https://www.bilibili.com/'
            }
        });

        const data = await response.json();
        if (!data.data?.wbi_img) {
            throw new Error('无法获取WBI Keys');
        }

        const { img_url, sub_url } = data.data.wbi_img;
        const img_key = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
        const sub_key = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));

        return { img_key, sub_key };
    }

    // 获取视频信息
    async function getVideoInfo(bvid) {
        const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const data = await response.json();

        if (data.code !== 0) throw new Error(`获取视频信息失败: ${data.message}`);
        if (!data.data?.aid || !data.data?.cid) throw new Error('无法获取视频信息');

        return {
            aid: data.data.aid,
            cid: data.data.cid,
            duration: data.data.duration,
            title: data.data.title
        };
    }

    // 获取单个分段的弹幕
    async function getSegmentDanmaku(cid, aid, segmentIndex, wbiKeys) {
        const params = {
            type: 1,
            oid: cid,
            segment_index: segmentIndex,
            pid: aid,
            web_location: 1315873,
            wts: Math.round(Date.now() / 1000)
        };

        const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
        const url = `https://api.bilibili.com/x/v2/dm/wbi/web/seg.so?${query}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        return parseDanmakuData(buffer);
    }

    // 初始化OpenCC转换器
    let openccConverter = null;
    try {
        // 创建繁体转简体的转换器
        openccConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
        console.log('OpenCC转换器初始化成功');
    } catch (error) {
        console.error('OpenCC转换器初始化失败:', error);
    }

    // 判断文本是否为纯英文和数字（去除标点符号后判断）
    function isPureEnglishOrNumber(text) {
        if (!text || typeof text !== 'string') return false;
        
        // 先去除所有标点符号和特殊字符，只保留字母、数字和空格
        const cleaned = text.replace(/[^\w\s]/g, '');
        
        // 如果清理后为空，说明只有标点符号
        if (!cleaned.trim()) return false;
        
        // 判断是否只包含英文字母、数字和空格
        return /^[a-zA-Z0-9\s]*$/.test(cleaned);
    }

    // 从多个部分中选择最佳部分
    function selectBestPart(parts) {
        if (!parts || parts.length === 0) return '';
        if (parts.length === 1) return parts[0];

        // 分为纯英文数字部分和非纯英文数字部分
        const nonPureEnglishParts = parts.filter(part => !isPureEnglishOrNumber(part));
        const pureEnglishParts = parts.filter(part => isPureEnglishOrNumber(part));

        // 优先从非纯英文数字部分中选择最长的
        if (nonPureEnglishParts.length > 0) {
            const bestPart = nonPureEnglishParts.reduce((longest, current) =>
                current.length > longest.length ? current : longest
            );
            console.log(`选择非纯英文数字的最长部分: "${bestPart}"`);
            return bestPart;
        }

        // 如果所有部分都是纯英文数字，则选择最长的
        const bestPart = pureEnglishParts.reduce((longest, current) =>
            current.length > longest.length ? current : longest
        );
        console.log(`所有部分都是纯英文数字，选择最长部分: "${bestPart}"`);
        return bestPart;
    }

    // 获取标题的最佳部分（同时处理竖线和空格分割符）
    function getBestTitlePart(title) {
        if (!title || typeof title !== 'string') return title;

        // 同时使用竖线和空格作为分隔符进行分割
        const parts = title.split(/[｜|\s]+/)
            .map(part => part.trim())
            .filter(part => part.length > 0);

        // 如果分割后只有一个部分或无法分割，返回原标题
        if (parts.length <= 1) {
            return title;
        }

        console.log(`标题分割结果:`, parts);
        
        // 选择最佳部分
        return selectBestPart(parts);
    }

    // 去掉结尾的英文字符（只有去掉后还有内容时才去掉）
    function removeTrailingEnglish(text) {
        if (!text || typeof text !== 'string') return text;
        
        // 匹配结尾的英文字母、数字、空格和常见标点符号
        const trailingEnglishRegex = /[a-zA-Z0-9\s\.,!?\-_'"():;]+$/;
        const match = text.match(trailingEnglishRegex);
        
        if (match) {
            const withoutTrailing = text.slice(0, match.index).trim();
            // 只有去掉后还有内容时才返回去掉结尾的版本
            if (withoutTrailing.length > 0) {
                console.log(`去掉结尾英文: "${text}" → "${withoutTrailing}"`);
                return withoutTrailing;
            }
        }
        
        return text; // 原样返回
    }

    // 清理视频标题函数
    function cleanVideoTitle(title) {
        if (!title || typeof title !== 'string') return title;

        let cleanedTitle = title;

        // 1. 去除【UP主名】格式的内容
        cleanedTitle = cleanedTitle.replace(/【[^】]*】/g, '');

        // 2. 去除标题开头的【】（可能是其他格式）
        cleanedTitle = cleanedTitle.replace(/^【[^】]*】\s*/g, '');

        // 3. 去除末尾的标签（#标签格式）
        cleanedTitle = cleanedTitle.replace(/\s*#[^\s#]+(\s*#[^\s#]+)*\s*$/g, '');

        // 4. 去除多余的空格并清理首尾
        cleanedTitle = cleanedTitle.replace(/\s+/g, ' ').trim();

        // 5. 如果清理后为空，返回原标题
        if (!cleanedTitle) {
            console.warn('标题清理后为空，返回原标题:', title);
            return title.trim();
        }

        console.log(`标题清理: "${title}" → "${cleanedTitle}"`);
        return cleanedTitle;
    }

    // 繁体转简体函数
    function traditionalToSimplifiedChinese(text) {
        if (!text || typeof text !== 'string') return text;

        try {
            // 使用OpenCC进行转换
            if (openccConverter) {
                const result = openccConverter(text);
                console.log(`繁简转换: ${text} → ${result}`);
                return result;
            } else {
                console.warn('OpenCC转换器未初始化，返回原文本');
                return text;
            }
        } catch (error) {
            console.error('繁简转换失败:', error);
            return text;
        }
    }

    // 解析弹幕数据
    function parseDanmakuData(buffer) {
        const parser = new ProtobufParser();
        return parser.parseDanmakuResponse(buffer);
    }

    // 移除广告片段弹幕
    async function removeAdSegments(danmakus, bvid, youtubeVideoDuration) {
        // console.log('移除广告片段弹幕', bvid, youtubeVideoDuration);
        try {
            const response = await fetch(`https://bsbsb.top/api/skipSegments?videoID=${bvid}`, {
                headers: {
                    "origin": "chrome-extension://dmkbhbnbpfijhgpnfahfioedledohfja",
                    "x-ext-version": "1.1.5"
                }
            });

            // 如果返回404，表示没有需要跳过的片段
            if (response.status === 404) {
                return danmakus;
            }

            if (!response.ok) {
                console.warn('获取广告片段信息失败:', response.status);
                return danmakus;
            }

            const skipSegments = await response.json();
            
            // 筛选出赞助（sponsor）类型的片段
            const sponsorSegments = skipSegments
                .filter(segment => segment.category === 'sponsor')
                .map(segment => segment.segment)
                .sort((a, b) => a[0] - b[0]); // 按开始时间排序

            if (sponsorSegments.length === 0) {
                return danmakus;
            }

            // 获取bilibili视频原始长度（取第一个片段的videoDuration）
            const bilibiliVideoDuration = skipSegments[0]?.videoDuration;
            
            if (bilibiliVideoDuration && youtubeVideoDuration) {
                const durationDiff = Math.abs(bilibiliVideoDuration - youtubeVideoDuration);
                
                if (durationDiff <= 5) {
                    // 长度相近，YouTube可能未去sponsor，跳过处理
                    console.log(`YouTube视频长度(${youtubeVideoDuration}s)与bilibili原始长度(${bilibiliVideoDuration}s)相近，跳过sponsor处理`);
                    return danmakus;
                }
                
                console.log(`YouTube视频长度(${youtubeVideoDuration}s)与bilibili原始长度(${bilibiliVideoDuration}s)差异较大，正常处理sponsor片段`);
            }

            console.log(`发现 ${sponsorSegments.length} 个广告片段，开始处理弹幕`);

            let processedDanmakus = [...danmakus];
            let totalRemovedTime = 0;

            // 处理每个广告片段
            for (const [startTime, endTime] of sponsorSegments) {
                const segmentDuration = endTime - startTime;
                const adjustedStartTime = startTime - totalRemovedTime;
                const adjustedEndTime = endTime - totalRemovedTime;

                // 移除广告片段时间范围内的弹幕
                const filteredDanmakus = processedDanmakus.filter(danmaku => 
                    danmaku.time < adjustedStartTime || danmaku.time >= adjustedEndTime
                );

                // 将广告片段之后的弹幕时间轴向前偏移
                const adjustedDanmakus = filteredDanmakus.map(danmaku => {
                    if (danmaku.time >= adjustedEndTime) {
                        return {
                            ...danmaku,
                            time: danmaku.time - segmentDuration
                        };
                    }
                    return danmaku;
                });

                processedDanmakus = adjustedDanmakus;
                totalRemovedTime += segmentDuration;
            }

            console.log(`广告片段处理完成，移除了 ${danmakus.length - processedDanmakus.length} 条弹幕，总计移除时长: ${totalRemovedTime.toFixed(2)}秒`);
            
            return processedDanmakus;
        } catch (error) {
            console.error('处理广告片段时出错:', error);
            return danmakus; // 出错时返回原始弹幕
        }
    }

    // 下载所有弹幕
    async function downloadAllDanmaku(bvid, youtubeVideoDuration) {
        try {
            // 1. 获取WBI Keys
            const wbiKeys = await getWbiKeys();

            // 2. 获取视频信息
            const { cid, duration, aid, title } = await getVideoInfo(bvid);

            // 3. 计算分段数（每段6分钟）
            const segmentCount = Math.ceil(duration / 360);

            // 4. 获取所有分段的弹幕
            const allDanmakus = [];
            for (let i = 1; i <= segmentCount; i++) {
                try {
                    const danmakus = await getSegmentDanmaku(cid, aid, i, wbiKeys);
                    console.log(`第${i}段弹幕获取成功: ${danmakus.length}条`);
                    allDanmakus.push(...danmakus);

                    // 延迟避免请求过快
                    if (i < segmentCount) {
                        await new Promise((resolve) => setTimeout(resolve, 300));
                    }
                } catch (error) {
                    console.error(`获取第${i}段弹幕失败:`, error);
                }
            }

            // 5. 格式化弹幕数据，增加安全检查
            console.log(`开始处理 ${allDanmakus.length} 条原始弹幕数据`);

            const validDanmakus = allDanmakus.filter((d) => {
                // 过滤掉无效的弹幕数据
                const isValid =
                    d &&
                    typeof d.progress === 'number' &&
                    d.content &&
                    typeof d.content === 'string' &&
                    d.content.trim().length > 0;

                if (!isValid) {
                    console.warn('过滤掉无效弹幕:', d);
                }
                return isValid;
            });

            console.log(`过滤后有效弹幕: ${validDanmakus.length} 条`);

            const formattedDanmakus = validDanmakus.map((d) => ({
                time: d.progress / 1000, // 转换为秒
                text: d.content,
                color:
                    d.color && typeof d.color === 'number'
                        ? `#${d.color.toString(16).padStart(6, '0')}`
                        : '#ffffff', // 默认白色
                mode: d.mode === 1 ? 'rtl' : d.mode === 4 ? 'bottom' : 'top',
                weight: d.weight !== undefined && d.weight !== null ? d.weight : 5 // 添加权重字段，默认5
            }));

            // 按时间排序
            formattedDanmakus.sort((a, b) => a.time - b.time);

            // 移除广告片段弹幕
            const processedDanmakus = await removeAdSegments(formattedDanmakus, bvid, youtubeVideoDuration);

            // 统计weight分布（用于调试）
            // const weightStats = {};
            // formattedDanmakus.forEach((d) => {
            //     const weight = d.weight;
            //     weightStats[weight] = (weightStats[weight] || 0) + 1;
            // });
            // console.log('弹幕权重分布:', weightStats);

            return {
                danmakus: processedDanmakus,
                title: title,
                duration: duration
            };
        } catch (error) {
            throw error;
        }
    }

    // B站空间搜索功能
    async function searchBilibiliVideo(bilibiliUID, videoTitle, youtubeVideoDuration) {
        try {
            // 繁体转简体
            const simplifiedTitle = traditionalToSimplifiedChinese(videoTitle);
            // 获取标题最佳部分
            const bestPart = getBestTitlePart(simplifiedTitle);
            // 清理标题
            const cleanedTitle = cleanVideoTitle(bestPart);
            console.log(`搜索标题: ${videoTitle}  → ${cleanedTitle}`);

            // 获取WBI Keys
            const wbiKeys = await getWbiKeys();

            // 构建API参数
            const params = {
                mid: bilibiliUID,
                ps: 30,
                tid: 0,
                pn: 1,
                keyword: cleanedTitle,
                order: 'pubdate',
                web_location: 1550101,
                wts: Math.round(Date.now() / 1000)
            };

            // 生成签名
            const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
            const apiUrl = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`;

            console.log(`API搜索URL: ${apiUrl}`);

            // 发起API请求
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://www.bilibili.com/',
                    Origin: 'https://www.bilibili.com'
                }
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(`API返回错误: ${data.message || '未知错误'}`);
            }

            // 解析API响应数据
            const results = parseBilibiliApiResults(data);

            console.log(`搜索到 ${results.length} 个结果`);

            // 优先寻找标题完全包含简化标题的结果
            let finalResults = results;
            if (results.length > 1) {
                console.log(`包含${results.length}个结果，尝试包含匹配`);
                const containsMatch = results.find((result) => result.title.includes(cleanedTitle));
                if (containsMatch) {
                    console.log(`找到包含匹配的标题: ${containsMatch.title}`);
                    finalResults = [containsMatch];
                }
            }

            return {
                success: true,
                results: finalResults,
                searchUrl: apiUrl
            };
        } catch (error) {
            console.error('B站搜索失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 搜索B站UP主
    async function searchBilibiliUser(keyword) {
        try {
            // 繁体转简体
            const simplifiedKeyword = traditionalToSimplifiedChinese(keyword);
            console.log(`搜索UP主: ${keyword} → ${simplifiedKeyword}`);
            const finalKeyword = removeTrailingEnglish(simplifiedKeyword);
            // 获取WBI Keys
            const wbiKeys = await getWbiKeys();

            // 构建API参数
            const params = {
                search_type: 'bili_user',
                keyword: finalKeyword,
                page: 1,
                order: '',
                order_sort: '',
                user_type: '',
                web_location: 1430654,
                wts: Math.round(Date.now() / 1000)
            };

            // 生成签名
            const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
            const apiUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`;

            console.log(`搜索UP主API URL: ${apiUrl}`);

            // 发起API请求
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://search.bilibili.com/',
                    Origin: 'https://www.bilibili.com'
                }
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(`API返回错误: ${data.message || '未知错误'}`);
            }

            // 解析搜索结果
            const results = [];
            if (data.data && data.data.result) {
                for (const user of data.data.result.slice(0, 5)) {
                    // 最多返回5个结果
                    results.push({
                        mid: user.mid,
                        uname: user.uname,
                        usign: user.usign || '',
                        fans: user.fans || 0,
                        videos: user.videos || 0,
                        face: user.upic || '',
                        spaceUrl: `https://space.bilibili.com/${user.mid}`
                    });
                }
            }

            console.log(`找到 ${results.length} 个UP主`);

            return {
                success: true,
                results: results
            };
        } catch (error) {
            console.error('搜索UP主失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 全站搜索视频
    async function searchBilibiliVideoGlobal(keyword) {
        try {
            // 繁体转简体
            const simplifiedKeyword = traditionalToSimplifiedChinese(keyword);
            // 获取标题最佳部分
            const bestPart = getBestTitlePart(simplifiedKeyword);
            // 清理标题
            const cleanedKeyword = cleanVideoTitle(bestPart);
            console.log(`全站搜索视频: ${keyword} → ${cleanedKeyword}`);

            // 获取WBI Keys
            const wbiKeys = await getWbiKeys();

            // 构建API参数
            const params = {
                search_type: 'video',
                keyword: cleanedKeyword,
                page: 1,
                order: '',
                duration: '',
                tids: '',
                web_location: 1430654,
                wts: Math.round(Date.now() / 1000)
            };

            // 生成签名
            const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
            const apiUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`;

            console.log(`全站搜索视频API URL: ${apiUrl}`);

            // 发起API请求
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://search.bilibili.com/',
                    Origin: 'https://www.bilibili.com'
                }
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(`API返回错误: ${data.message || '未知错误'}`);
            }

            // 解析搜索结果
            const results = [];
            if (data.data && data.data.result) {
                for (const video of data.data.result.slice(0, 10)) {
                    // 最多返回10个结果
                    // 格式化发布时间
                    const formatPubdate = (pubdate) => {
                        if (typeof pubdate === 'string') {
                            return pubdate;
                        }
                        const date = new Date(pubdate * 1000);
                        return date.toLocaleDateString('zh-CN');
                    };

                    results.push({
                        bvid: video.bvid,
                        title: video.title.replace(/<[^>]*>/g, ''), // 去除HTML标签
                        author: video.author,
                        mid: video.mid,
                        pubdate: formatPubdate(video.pubdate),
                        pic: `https:${video.pic}`,
                        play: video.play,
                        duration: video.duration
                    });
                }
            }

            console.log(`全站搜索找到 ${results.length} 个视频`);

            return {
                success: true,
                results: results
            };
        } catch (error) {
            console.error('全站搜索视频失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 分割标题重新搜索的辅助函数
    async function searchWithSplitTitle(bilibiliUID, title, wbiKeys) {
        try {
            // 尝试全角和半角分割符
            const separators = ['｜', '|'];

            for (const separator of separators) {
                if (title.includes(separator)) {
                    const parts = title.split(separator);
                    // 选择最长的部分（去除前后空格）
                    let longestPart = parts
                        .map((part) => part.trim())
                        .filter((part) => part.length > 0) // 过滤空字符串
                        .reduce((longest, current) =>
                            current.length > longest.length ? current : longest
                        );

                    // 清理标题：去除【UP主名】和末尾标签
                    const originalPart = longestPart;
                    longestPart = cleanVideoTitle(longestPart);

                    console.log(
                        `使用分割符"${separator}"，最长部分: ${originalPart} → 清理后: ${longestPart}`
                    );

                    // 用最长部分重新搜索
                    const params = {
                        mid: bilibiliUID,
                        ps: 30,
                        tid: 0,
                        pn: 1,
                        keyword: longestPart,
                        order: 'pubdate',
                        web_location: 1550101,
                        wts: Math.round(Date.now() / 1000)
                    };

                    const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
                    const apiUrl = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`;

                    console.log(`备用搜索API URL: ${apiUrl}`);

                    const response = await fetch(apiUrl, {
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            Referer: 'https://www.bilibili.com/',
                            Origin: 'https://www.bilibili.com'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.code === 0) {
                            const results = parseBilibiliApiResults(data);
                            console.log(`分割标题搜索到 ${results.length} 个结果`);

                            if (results.length > 0) {
                                return {
                                    success: true,
                                    results: results,
                                    searchUrl: apiUrl,
                                    fallbackSearch: true,
                                    originalTitle: title,
                                    usedPart: longestPart,
                                    separator: separator
                                };
                            }
                        }
                    }
                }
            }

            // 如果都没找到
            console.log('分割标题搜索也未找到结果');
            return {
                success: false,
                error: '分割标题搜索也未找到结果'
            };
        } catch (error) {
            console.error('分割标题搜索失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 解析B站API搜索结果
    function parseBilibiliApiResults(apiData) {
        const results = [];

        try {
            // 检查API数据结构
            if (!apiData.data || !apiData.data.list || !apiData.data.list.vlist) {
                console.warn('API数据结构异常:', apiData);
                return results;
            }

            const videoList = apiData.data.list.vlist;

            // 最多返回10个结果
            const maxResults = Math.min(videoList.length, 10);

            for (let i = 0; i < maxResults; i++) {
                const video = videoList[i];

                if (video.bvid && video.title) {
                    // 格式化发布时间
                    const formatPubdate = (timestamp) => {
                        const date = new Date(timestamp * 1000);
                        return date.toLocaleDateString('zh-CN');
                    };

                    results.push({
                        bvid: video.bvid,
                        title: video.title,
                        pubdate: video.created ? formatPubdate(video.created) : '未知',
                        created: video.created || 0, // 保存原始时间戳用于排序
                        aid: video.aid,
                        pic: video.pic // 视频封面
                    });
                }
            }

            // 按发布时间从新到旧排序
            results.sort((a, b) => b.created - a.created);

            console.log(`成功解析 ${results.length} 个视频结果，已按时间排序`);
        } catch (error) {
            console.error('解析API结果失败:', error);
        }

        return results;
    }

    // 存储待发送的搜索结果
    let pendingSearchResults = null;

    // 存储待发送的未匹配结果
    let pendingNoMatchResults = null;

    // 处理多个搜索结果的弹窗显示
    async function handleMultipleResults(request) {
        try {
            console.log('处理多个搜索结果弹窗:', request.results.length);

            // 暂存搜索结果，等待popup准备好接收
            pendingSearchResults = {
                results: request.results,
                youtubeVideoId: request.youtubeVideoId,
                channelInfo: request.channelInfo,
                videoTitle: request.videoTitle,
                timestamp: Date.now()
            };

            // 同时存储到storage作为备用
            await browser.storage.local.set({
                pendingSearchResults: pendingSearchResults
            });

            // 打开popup窗口
            try {
                await browser.action.openPopup();
                console.log('popup窗口已打开，等待ready信号...');
            } catch (error) {
                console.log('无法自动打开popup，可能需要用户手动点击:', error.message);
            }

            return {
                success: true,
                message: '搜索结果已准备显示'
            };
        } catch (error) {
            console.error('处理多个搜索结果失败:', error);
            throw error;
        }
    }

    // 处理未匹配结果的弹窗显示
    async function handleNoMatchResults(request) {
        try {
            console.log('处理未匹配结果弹窗:', request.channelInfo);

            // 暂存未匹配结果，等待popup准备好接收
            pendingNoMatchResults = {
                youtubeVideoId: request.youtubeVideoId,
                channelInfo: request.channelInfo,
                videoTitle: request.videoTitle,
                timestamp: Date.now()
            };

            // 同时存储到storage作为备用
            await browser.storage.local.set({
                pendingNoMatchResults: pendingNoMatchResults
            });

            // 打开popup窗口
            try {
                await browser.action.openPopup();
                console.log('popup窗口已打开，等待ready信号...');
            } catch (error) {
                console.log('无法自动打开popup，可能需要用户手动点击:', error.message);
            }

            return {
                success: true,
                message: '未匹配结果已准备显示'
            };
        } catch (error) {
            console.error('处理未匹配结果失败:', error);
            throw error;
        }
    }

    // 清理过期弹幕数据（异步执行，不阻塞主流程）
    async function cleanupExpiredDanmaku() {
        try {
            const allData = await browser.storage.local.get();
            const keysToRemove = [];
            const oneDay = 60 * 1000; // 1天过期时间

            console.log('开始检查过期弹幕数据...');

            for (const [key, value] of Object.entries(allData)) {
                // 跳过非弹幕数据（如设置、临时数据等）
                if (!value || !value.danmakus || !value.lastUpdate) {
                    continue;
                }

                // 检查是否过期
                if (Date.now() - value.lastUpdate > oneDay) {
                    keysToRemove.push(key);
                }
            }

            if (keysToRemove.length > 0) {
                await browser.storage.local.remove(keysToRemove);
                console.log(`已清理 ${keysToRemove.length} 个过期弹幕数据`);
            } else {
                console.log('没有发现过期的弹幕数据');
            }
        } catch (error) {
            console.error('清理过期弹幕数据失败:', error);
        }
    }

    // 扩展启动时清理过期数据
    browser.runtime.onStartup.addListener(() => {
        console.log('浏览器启动，异步清理过期弹幕数据');
        cleanupExpiredDanmaku();
    });

    browser.runtime.onInstalled.addListener(() => {
        console.log('扩展安装/更新，异步清理过期弹幕数据');
        cleanupExpiredDanmaku();
    });

    // 监听来自popup的消息
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'downloadDanmaku') {
            downloadAllDanmaku(request.bvid, request.youtubeVideoDuration)
                .then(async (data) => {
                    // 保存弹幕数据
                    const storageData = {
                        [request.youtubeVideoId]: {
                            bilibili_url: `https://www.bilibili.com/video/${request.bvid}`,
                            bilibili_title: data.title,
                            danmakus: data.danmakus,
                            duration: data.duration,
                            timeOffset: 0,
                            lastUpdate: Date.now()
                        }
                    };

                    await browser.storage.local.set(storageData);

                    // 异步清理过期弹幕数据，不阻塞响应
                    Promise.resolve().then(() => {
                        cleanupExpiredDanmaku();
                    });

                    sendResponse({
                        success: true,
                        count: data.danmakus.length
                    });
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'searchBilibiliVideo') {
            // 新增：B站视频搜索
            searchBilibiliVideo(request.bilibiliUID, request.videoTitle, request.youtubeVideoDuration)
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'searchBilibiliUser') {
            // 搜索B站UP主
            searchBilibiliUser(request.keyword)
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'searchBilibiliVideoGlobal') {
            // 全站搜索视频
            searchBilibiliVideoGlobal(request.keyword)
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'downloadBangumiDanmaku') {
            // 新增：B站番剧弹幕下载 - 简化流程：获取bvid然后用现有逻辑下载
            searchBilibiliBangumi(request.title, request.episodeNumber)
                .then(async (bvid) => {
                    console.log(`获取到番剧bvid: ${bvid}`);

                    // 使用现有的弹幕下载逻辑
                    const data = await downloadAllDanmaku(bvid, request.youtubeVideoDuration);

                    // 保存弹幕数据 - 使用现有的存储格式
                    const storageData = {
                        [request.youtubeVideoId]: {
                            bilibili_url: `https://www.bilibili.com/video/${bvid}`,
                            bilibili_title: `${request.title} 第${request.episodeNumber}话`,
                            danmakus: data.danmakus,
                            duration: data.duration,
                            timeOffset: 0,
                            lastUpdate: Date.now()
                        }
                    };

                    await browser.storage.local.set(storageData);

                    // 异步清理过期弹幕数据，不阻塞响应
                    Promise.resolve().then(() => {
                        cleanupExpiredDanmaku();
                    });

                    sendResponse({
                        success: true,
                        count: data.danmakus.length
                    });
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'showMultipleResults') {
            // 新增：处理多个搜索结果的弹窗显示
            handleMultipleResults(request)
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'showNoMatchResults') {
            // 新增：处理未匹配结果的弹窗显示
            handleNoMatchResults(request)
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'popupReady') {
            // popup已准备好，发送待显示的搜索结果
            console.log('收到popup ready信号，检查待发送的搜索结果...');

            // 处理异步操作
            (async () => {
                // 优先使用内存中的数据
                let dataToSend = pendingSearchResults;
                let noMatchDataToSend = pendingNoMatchResults;

                // 如果内存中没有数据，尝试从storage获取
                if (!dataToSend && !noMatchDataToSend) {
                    try {
                        const result = await browser.storage.local.get([
                            'pendingSearchResults',
                            'pendingNoMatchResults'
                        ]);
                        dataToSend = result.pendingSearchResults;
                        noMatchDataToSend = result.pendingNoMatchResults;
                    } catch (error) {
                        console.log('获取storage搜索结果失败:', error);
                    }
                }

                if (dataToSend && dataToSend.results) {
                    // 检查数据是否过期（5分钟内有效）
                    const isExpired = Date.now() - dataToSend.timestamp > 5 * 60 * 1000;

                    if (!isExpired) {
                        console.log('发送搜索结果给popup:', dataToSend.results.length);

                        // 发送搜索结果给popup（使用延迟确保popup完全准备好）
                        setTimeout(() => {
                            browser.runtime
                                .sendMessage({
                                    type: 'displayMultipleResults',
                                    data: dataToSend
                                })
                                .then(() => {
                                    // 发送成功后清理storage中的数据
                                    browser.storage.local.remove('pendingSearchResults');
                                    pendingSearchResults = null;
                                    console.log('已清理pendingSearchResults数据');
                                })
                                .catch((error) => {
                                    console.log('发送搜索结果消息失败:', error);
                                });
                        }, 50); // 50ms延迟确保popup DOM准备就绪

                        sendResponse({ success: true });
                    } else {
                        console.log('搜索结果已过期，清理数据');
                        pendingSearchResults = null;
                        browser.storage.local.remove('pendingSearchResults');
                        sendResponse({ success: false, message: 'results expired' });
                    }
                } else if (noMatchDataToSend) {
                    // 检查未匹配数据是否过期（5分钟内有效）
                    const isExpired = Date.now() - noMatchDataToSend.timestamp > 5 * 60 * 1000;

                    if (!isExpired) {
                        console.log('发送未匹配结果给popup:', noMatchDataToSend.channelInfo);

                        // 发送未匹配结果给popup（使用延迟确保popup完全准备好）
                        setTimeout(() => {
                            browser.runtime
                                .sendMessage({
                                    type: 'displayNoMatchResults',
                                    data: noMatchDataToSend
                                })
                                .then(() => {
                                    // 发送成功后清理storage中的数据
                                    browser.storage.local.remove('pendingNoMatchResults');
                                    pendingNoMatchResults = null;
                                    console.log('已清理pendingNoMatchResults数据');
                                })
                                .catch((error) => {
                                    console.log('发送未匹配结果消息失败:', error);
                                });
                        }, 50); // 50ms延迟确保popup DOM准备就绪

                        sendResponse({ success: true });
                    } else {
                        console.log('未匹配结果已过期，清理数据');
                        pendingNoMatchResults = null;
                        browser.storage.local.remove('pendingNoMatchResults');
                        sendResponse({ success: false, message: 'no match results expired' });
                    }
                } else {
                    console.log('没有待显示的搜索结果');
                    sendResponse({ success: false, message: 'no pending results' });
                }
            })();

            return true; // 保持消息通道开启
        } else if (request.type === 'clearSearchResults') {
            // 清理搜索结果
            console.log('清理搜索结果数据');
            pendingSearchResults = null;
            pendingNoMatchResults = null;
            browser.storage.local.remove(['pendingSearchResults', 'pendingNoMatchResults']);
            sendResponse({ success: true });

            return true;
        } else if (request.type === 'fetchOriginalTitle') {
            // 通过oEmbed API获取YouTube视频原始标题
            fetchYouTubeOriginalTitle(request.oembedUrl, request.videoId)
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true; // 保持消息通道开启
        } else if (request.type === 'cleanupExpiredDanmaku') {
            console.log('收到清理过期弹幕请求');
            // 异步执行清理，立即响应
            Promise.resolve().then(() => {
                cleanupExpiredDanmaku();
            });
            sendResponse({ success: true });
            return true;
        } else if (request.type === 'pageChanged') {
            // 页面切换通知
            console.log('页面切换:', request.videoId);

            // 清除旧的页面状态
            if (sender.tab && sender.tab.id) {
                clearTabPageState(sender.tab.id);
            }

            sendResponse({ success: true });
            return true;
        } else if (request.type === 'pageInfoUpdated') {
            // 页面信息更新通知
            console.log('页面信息更新:', request.pageInfo.videoId);

            if (sender.tab && sender.tab.id) {
                setTabPageState(sender.tab.id, request.pageInfo);
            }

            sendResponse({ success: true });
            return true;
        } else if (request.type === 'getPageInfoFromBackground') {
            // popup请求从background获取页面信息
            (async () => {
                try {
                    // 获取当前活跃标签页
                    const [activeTab] = await browser.tabs.query({
                        active: true,
                        currentWindow: true
                    });

                    if (!activeTab || !activeTab.id) {
                        sendResponse({ success: false, error: '无法获取当前标签页' });
                        return;
                    }

                    // 检查是否有缓存的页面状态
                    const cachedState = getTabPageState(activeTab.id);

                    if (cachedState) {
                        // 验证缓存的URL是否与当前标签页匹配
                        if (cachedState.url === activeTab.url) {
                            console.log('使用background缓存的页面信息');
                            sendResponse({
                                success: true,
                                data: cachedState,
                                fromCache: true
                            });
                            return;
                        } else {
                            console.log('缓存的URL不匹配，清除过期状态');
                            clearTabPageState(activeTab.id);
                        }
                    }

                    // 没有缓存或缓存过期，请求content script获取最新信息
                    console.log('向content script请求最新页面信息');

                    browser.tabs.sendMessage(
                        activeTab.id,
                        {
                            type: 'getPageInfo'
                        },
                        (response) => {
                            if (browser.runtime.lastError) {
                                sendResponse({
                                    success: false,
                                    error:
                                        'content script未响应: ' + browser.runtime.lastError.message
                                });
                                return;
                            }

                            if (response && response.success) {
                                // 缓存新获取的信息
                                setTabPageState(activeTab.id, response.data);
                                sendResponse({
                                    success: true,
                                    data: response.data,
                                    fromCache: false
                                });
                            } else {
                                sendResponse({
                                    success: false,
                                    error: response ? response.error : '获取页面信息失败'
                                });
                            }
                        }
                    );
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            })();

            return true; // 保持消息通道开启
        }
    });

    // 通过YouTube oEmbed API获取视频原始标题
    async function fetchYouTubeOriginalTitle(oembedUrl, videoId) {
        try {
            console.log(`获取YouTube原始标题: ${videoId}`);

            const response = await fetch(oembedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://www.youtube.com/'
                }
            });

            if (!response.ok) {
                throw new Error(`oEmbed API请求失败: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.title) {
                throw new Error('oEmbed API响应中没有title字段');
            }

            console.log(`获取到原始标题: ${data.title}`);

            return {
                success: true,
                title: data.title,
                author_name: data.author_name || '',
                author_url: data.author_url || ''
            };
        } catch (error) {
            console.error('获取YouTube原始标题失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
});
