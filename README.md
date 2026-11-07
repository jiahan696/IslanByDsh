# Liquid Island · Windows 灵动岛（Electron）

一个面向 Windows 10/11 的开源桌面灵动岛：顶部胶囊常驻显示时间、电量、CPU、内存、网速和天气；点击展开完整面板，集成待办、闹钟、倒计时、搜索、应用卸载、媒体控制和微信/QQ 通知。

当前目录是独立的 Electron 项目，不依赖根目录的 Tauri 实验工程。液态玻璃 / 纯色背景双模式、动态工具模块、位置缩放与提醒系统都在这里维护。

## 功能

### 灵动岛

- 顶部胶囊：时间、电池、蓝牙、CPU、内存、网速、API 用量、天气
- 动态宽度：基础宽度 + 激活工具模块宽度，逐个累加
- 工具模块独立占位：倒计时、秒表、闹钟、待办提醒、媒体可以同时横向排列
- 支持顶部居中、底部居中、四角预设、自由拖拽、25%–100% 缩放、横向 / 竖向
- 原生窗口 mask 跟随实时宽度；收起时只保留胶囊的可绘制/可点击区域
- 点击胶囊展开，点击面板外收起

### 双渲染模式

- **液态玻璃**：原有深色、浅色、跟随系统、桌面背景采样与玻璃参数
- **纯色背景**：纯黑、纯白预设，自定义背景色 / 透明度 / 文字色 / 透明度 / 对比度
- 两套参数独立保存，切换模式不会相互污染
- 纯色模式不使用 `backdrop-filter`，也不采样桌面

### 面板

- 文件搜索：本地文件名索引
- 应用列表与卸载
- 日历、天气、计时器、闹钟、待办
- 媒体控制与歌词
- 系统状态、通知、设置

### 提醒

### 可选工具模块

在「设置 → 工具模块」按需开启。关闭时不渲染、不监听、不占用胶囊宽度；开启后按独立固定宽度追加到横向工具区。

- **媒体控制**：SMTC 播放状态、曲名、播放/暂停、上一曲/下一曲、进度、音量、静音
- **剪贴板历史**：低功耗监听、点击复用、固定、单条删除、清空、最大条数与启动清空配置
- **系统控制**：亮度、音量、静音、CapsLock / NumLock、电量、选区截图、全屏录屏与录制计时
- **文件暂存架**：拖入文件/文件夹暂存，再次拖回资源管理器或其他应用，启动保留/清空可配置

### 提醒

- 倒计时：小时 / 分钟 / 秒独立输入，消息或闹钟提醒
- 闹钟：周期闹钟 + 指定日期单日闹钟；到点提示音、关闭 / 5 分钟后再提醒
- 待办：每条独立提醒时间、开关、消息 / 闹钟类型
- 微信 / QQ 通知：Windows 原生通知中心监听

## 环境

- Windows 10/11 x64
- Node.js 20 或更高
- npm
- 构建安装包需要 Windows 环境（electron-builder / NSIS）

## 开发

```powershell
npm install
npm run dev
```

## 检查与构建

```powershell
npm run typecheck
npm run build

# 便携版
npm run dist

# NSIS 安装包
npm run dist:installer

# 便携版 + 安装包
npm run dist:all
```

产物位于 `dist/`。

## 项目结构

```text
src/
  main/          Electron 主进程、窗口 mask、系统服务
  preload/       contextBridge API
  renderer/      React 渲染进程
  shared/        主进程 / preload / renderer 共享类型
resources/       PowerShell 辅助脚本、托盘图标
build/           打包图标
docs/            架构与开发说明
```

## 数据目录

Windows 下默认：

```text
%APPDATA%\LiquidIsland\
```

主要文件：

```text
settings.json    主题、渲染模式、布局
todos.json       待办及每条提醒配置
timers.json      倒计时、闹钟
weather-cache.json
notifications.json
```

所有数据保存在本机，不上传云端。项目不包含遥测或远程日志。

## 已知限制

- 仅支持 Windows。
- 应用未进行代码签名，SmartScreen 可能提示未知发布者。
- 便携版首次启动会先解压 Electron 运行时，速度受磁盘和杀毒软件影响。
- Windows 透明窗口 / DWM 合成在不同显卡驱动上的表现可能存在差异。
- 闹钟提示音优先使用系统提示音与 WebAudio；无音频设备或系统静音时不会发声。

## 开源协议

[MIT](LICENSE)
