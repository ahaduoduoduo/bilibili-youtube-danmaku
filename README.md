# B2Y - YouTube 同步显示 Bilibili 弹幕

> B2Y - 自动将Bilibili的弹幕同步显示在YouTube视频上

🍻关注的 UP 在 Youtube 和 B 站都有投稿，想在 Youtube 看更好的画质又想看弹幕🤔？

让 YouTube 视频也能拥有 B 站的弹幕氛围！
关联 B 站 UP 主或手动输入视频链接，同步弹幕到 YouTube 播放页面～

## ✅ 支持功能

- ✨ 自动查找并加载对应弹幕
- ✨ 支持时间轴偏移校准
- ✨ 支持调整弹幕字体大小、透明度、滚动速度、垂直间距
- ✨ 支持设置弹幕显示区域范围
- ✨ 支持智能弹幕过滤
- ✨ 支持弹幕搜索和跳转时间轴
- ✨ 支持 “哔哩哔哩动画” 频道内番剧正片自动获取弹幕

## 🧩 使用方法

0. 安装本插件
1. 打开你在 YouTube 上观看的对应视频
2.1 热门UP主可以自动匹配，无需设置
   2.2 手动搜索可绑定 UP 主B 站空间
      2.3 也可以手动输入 B 站原视频链接。
3. 弹幕将在播放时自动显示在视频上方
4. 可根据需要调节字体大小、透明度、轨道间距、滚动速度等显示参数

## ✨ 特色功能

- **自动匹配：** 公共匹配库存在数据，或手动绑定 UP 主后，播放该 YouTube 频道的任意视频时，会自动匹配并加载对应 B 站视频的弹幕，无需每次手动输入链接。（未匹配到的视频可以手动匹配）
- **实时更新：** 绑定 UP 主后，打开任意视频时，会更新最新弹幕内容。
- **番剧支持：** “哔哩哔哩动画Anime Made By Bilibili ” 频道下的番剧正片，可自动获取弹幕（无需配置）

🎉欢迎贡献UP主匹配信息🎉

## 🌐 浏览器支持

本扩展基于现代化的 **WXT 框架** 构建，支持多浏览器部署：

- ✅ **Chrome** (Manifest V3) - 完全支持
- ✅ **Firefox** (Manifest V2/V3) - 完全支持  
- ❓ **其他 Chromium 内核浏览器** (Edge, Opera 等) - 理论支持

## 📦 安装方式

### Chrome 应用商店版本（推荐）

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/dmkbhbnbpfijhgpnfahfioedledohfja.svg)](https://chromewebstore.google.com/detail/b2y-youtube-%E5%90%8C%E6%AD%A5%E6%98%BE%E7%A4%BA-bilibili/dmkbhbnbpfijhgpnfahfioedledohfja)

**[🚀 点击前往 Chrome 应用商店安装](https://chromewebstore.google.com/detail/b2y-youtube-%E5%90%8C%E6%AD%A5%E6%98%BE%E7%A4%BA-bilibili/dmkbhbnbpfijhgpnfahfioedledohfja)**

1. 打开上方链接
2. 点击"添加至 Chrome"按钮
3. 确认安装即可使用

### 手动安装（支持多浏览器）

> 💡 **注意：** 优先推荐使用应用商店版本，仅在无法访问时才使用手动安装。

1. 前往本项目的 [Release 页面](https://github.com/ahaduoduoduo/bilibili-youtube-danmaku/releases) 下载最新版本：
   - 📁 `B2Y-Chrome-vX.X.X.zip` - Chrome 版本
   - 📁 `B2Y-Firefox-vX.X.X.zip` - Firefox 版本

2. **Chrome / Edge / Opera 安装：**
   - 解压下载的 Chrome zip 文件
   - 打开浏览器扩展管理页面：`chrome://extensions/`
   - 开启"开发者模式"开关
   - 点击"加载已解压的扩展程序"，选择解压文件夹

3. **Firefox 安装：**
   - 打开 Firefox，进入 `about:debugging`
   - 点击"此 Firefox"→"临时载入附加组件"
   - 选择解压后的 `manifest.json` 文件

## 🛠 开发者指南

本项目采用现代化的 **WXT 框架**，提供优秀的开发体验：

### 技术栈
- 🎯 **WXT Framework** - 现代化浏览器扩展开发框架
- 🚀 **ES6 模块化** - 使用 import/export 语法
- ⚡ **热重载** - 开发时自动刷新扩展
- 🔄 **代码分割** - 自动优化资源加载
- 🌐 **跨浏览器** - 一套代码支持多浏览器

### 开发环境

```bash
# 安装依赖
npm install

# Chrome 开发模式（支持热重载）
npm run dev

# Firefox 开发模式
npm run dev:firefox

# 生产构建
npm run build

# Firefox 构建
npm run build:firefox

# 打包扩展文件
npm run zip
npm run zip:firefox
```

### 项目结构
```
bilibili-youtube-danmaku/
├── entrypoints/          # 扩展入口点
│   ├── background/       # 后台脚本
│   ├── content/         # 内容脚本
│   └── popup/           # 弹窗界面
├── utils/               # 工具模块  
├── public/              # 静态资源
└── wxt.config.js        # WXT 配置文件
```

## 📝 更新日志

### 2025-08-17
1.1.1 
- ✨WXT 框架迁移，感谢 @[lemonteaau](https://github.com/lemonteaau) ）
- ✨修复了弹幕 Z-index 问题，感谢 @[lemonteaau](https://github.com/lemonteaau) ）
- ✨增加了 10% 的弹幕覆盖范围

### 2025-08-08
1.1.0
- ✨ 添加智能搜索 up 主 功能，没有绑定 UP 主时可以快速搜索 UP 主（https://github.com/ahaduoduoduo/bilibili-youtube-danmaku/pull/4 ，感谢 @[luoling8192](https://github.com/luoling8192) ）
- ✨ 时间轴偏移功能优化，可以手动输入时间（有朋友反馈部分视频偏移长达五分钟）

### 2025-08-06
1.0.9
- ✨ 优化了视频标题匹配模式
- ✨ 提供了公共匹配库

### 2025-08-05
1.0.8
- ✨ 添加多语言标题自动匹配功能（https://github.com/ahaduoduoduo/bilibili-youtube-danmaku/pull/1 ，感谢 @[lemonteaau](https://github.com/lemonteaau) ）

1.0.7
- ✨ 支持 “哔哩哔哩动画Anime Made By Bilibili ” 频道自动获取原创番剧弹幕

### 2025-08-04
1.0.6
- ✨ 优化了视频标题匹配模式
- ⚡ 提高了弹幕帧率

### [☕️支持我～](https://github.com/ahaduoduoduo/bilibili-youtube-danmaku/blob/main/DONATE.md)

