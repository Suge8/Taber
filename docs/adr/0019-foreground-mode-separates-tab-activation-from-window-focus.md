# 0019. 前台模式只控制标签激活，不控制窗口聚焦

日期：2026-07-12

状态：已接受（修订 ADR 0011 的标签激活规则）

## 背景

后台操作不打断用户，但用户有时需要直接观看 Agent 在 Chrome 中切页和操作。标签页是否 active 与 Chrome 是否成为操作系统前台窗口是两件事；把两者绑定会把用户从其他应用抢回 Chrome。

## 决策

1. Dexie `settings.foregroundMode` 是全局偏好的唯一持久化入口；记录缺失时为关闭，只接受布尔值，不增加数据库版本。
2. 侧边栏在任务启动消息中发送该值。background、AgentHost `runningTask`、`task.started` 与 `AgentToolRuntime` 传递同一个不可变任务快照；任务运行中不再读取设置。
3. 关闭时，页面读取与操作继续在后台 target tab 执行。viewport 截图因 Chrome API 限制可临时激活 target，完成后仅在用户没有切走时恢复此前 active tab。
4. 开启时，`getDocument source:"currentPage"`、页面图片提取、`browser`、`browserRepl`、debug 构建的 `debugger` 以及 `navigate.open` 当前页、back、forward、reload 在执行前确保 target active；已经 active 时不重复更新。
5. `navigate.open target:"new"` 与 `navigate.switchTab` 是否激活新 target 只由任务快照决定。模型输入中的 `active` 字段从类型、schema 与 parser 中删除，旧输入直接失败。
6. 前台截图保持 target active。`navigate.currentTab`、`listTabs` 与 `closeTab` 只查询或关闭，不为展示过程额外激活标签页。
7. Agent 路径只调用 `tabs.update` 激活标签，不调用 `windows.update` 聚焦窗口。因此可切换 Chrome 内的 active tab，但不会主动把 Chrome 抢到其他应用前面。

## 影响

模式语义覆盖完整的 target-bound 页面工具边界，同时不新增动作分类器、运行中热切换、兼容协议或第二状态源。操作系统窗口是否在前台仍由用户决定；Chrome 对 viewport 截图的 active-tab 限制是关闭模式下唯一可见切页例外。
