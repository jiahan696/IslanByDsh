# 架构说明

## 进程

```text
main (Electron)
  ├─ IslandWindow      全屏透明窗口 / 原生 setShape mask / 点击穿透
  ├─ SettingsService   settings.json、液态玻璃与纯色参数、布局
  ├─ TimerService      timers.json、倒计时、周期/单日闹钟、提醒队列
  ├─ TodoService       todos.json、待办提醒
  ├─ Metrics / Media / Weather / Notifications / Search / Apps
preload
  └─ contextBridge 暴露 window.island
renderer (React)
  ├─ Capsule           胶囊、动态工具模块、拖拽、缩放
  ├─ Panel             搜索 / 应用 / 工具 / 设置
  └─ GlassScene        桌面背景采样图 + CSS 玻璃层
```

## 窗口与 mask

主窗口是贴合主显示器的透明窗口，用于：

- 面板内点击空白处收起
- 胶囊拖动时保持可交互
- 面板动画在同一个 WebView 内完成

胶囊实际边界由 renderer 通过 `setCapsuleBounds` 上报。主进程使用 Electron `BrowserWindow.setShape()`：

- 收起态：只保留胶囊矩形可绘制/可点击
- 展开态：恢复整屏 mask，保留点击外部收起
- 关闭动画结束后：重新收紧到胶囊
- 窗口外无绘制、无点击，避免多余空白区域

不使用全局鼠标钩子，不做 `setIgnoreMouseEvents` 高频轮询。

## 动态宽度

胶囊基础宽度由时间、电量、蓝牙、天气、CPU、内存、网速等常驻区域测量得到。

每个激活工具使用独立 fixed-width 槽位：

```text
闹钟       300px
待办提醒   270px
倒计时结束 250px
倒计时     150px
秒表       140px
媒体       230px
```

总宽度：

```text
base + Σ(active module widths) + gaps
```

工具关闭即移除槽位，宽度平滑收缩；窗口 mask 由 `ResizeObserver` 报告的新 capsule rect 同步更新。

## 提醒

- 主进程统一计时，renderer 只负责展示。
- 倒计时结束、闹钟、待办提醒都会写入 `firingAlarm` / `firingTodo` / `firingCountdown`。
- 消息提醒不发声；闹钟提醒使用 `shell.beep` + WebAudio 循环。
- 关闭 / snooze 会清理当前 firing 状态并写入 snooze 时间。

## 配置隔离

- `glassCustom`：玻璃透明度、模糊、圆角、边框、文字对比度、主色
- `solidTheme`：纯色预设、背景色、透明度、文字色、透明度、对比度
- `layout`：位置、缩放、方向、拖拽状态

三组对象独立持久化，切换模式不会重置其他组。
