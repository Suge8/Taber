# Design

Taber 侧边栏视觉事实源的**意图层**。token 具体值的唯一事实源是 `entrypoints/sidepanel/app.css`（`:root` / `[data-theme="dark"]` / `@theme inline`）。本文件只解释代码表达不出的设计意图与取舍，不重复 token 值。

基调：calm precision —— 安静、精确、有呼吸感的现代产品 UI，对标 Linear / Notion / Arc。窄宽度（~360px）密集信息界面，不是 landing。

## 设计原则

- 安静优先：颜色是稀缺资源，只用于语义和主操作。大面积是中性表面。
- 超扁平：靠层次（表面分级 + 1px 边框 + 极淡阴影）建立深度，不靠重投影或渐变。
- 有呼吸感：密集但不拥挤，元素间留间距，避免框套框。
- 丝滑：动效存在但不抢戏，遵守 `prefers-reduced-motion`。
- tabular numbers 用于所有计数、状态、时间值。
- 同心圆角：嵌套元素 `outer = inner + padding`，不同层级 radius 不混用。

## token 去哪看

- 调色板（warm monochrome + 单一 accent，light/dark 两套 OKLCH）：`app.css` 的 `:root` 与 `[data-theme="dark"]`。
- 语义色（danger/success/warn/running）：同上。
- 字体栈、radius、spacing、motion 曲线与时长：`app.css` 的 `@theme inline` 与 `:root`。

## 设计意图（代码看不出的 why）

- 正文色用 `--ink`，不用纯黑：纯黑在暖骨白底上发灰发脏，偏蓝的深墨更干净。
- 阴影 opacity < 0.08、扩散柔和：深度靠表面分级 + 1px line，不靠重投影。禁止 Tailwind 默认 `shadow-md/lg/xl`。
- accent 只给主操作和活跃态：一旦到处用，层次就塌。
- running 用缓慢呼吸（opacity 0.6↔1，~2s）：表达"进行中"而不打扰，reduced-motion 时静止。
- 自动贴底滚动用 AI Elements `Conversation` 内建行为：禁止轮询 / scroll 事件硬算。
- 入场动画用 `transform` / `opacity`，封顶 ~6 项后不再叠加 stagger 延迟：避免长列表拖尾。
- 不展示 raw chain-of-thought / `<think>`：只展示 assistant 最终回答与工具证据。

## 动效标准（极致要求，不可降级）

每个可见组件都必须有专属的丝滑进出场与交互动效；静止的 UI 视为未完成。motif 的单一事实源是 `app.css` 的 `fx-*` utilities，禁止在组件里散落自定义 keyframe。

- 进出场分离：enter 拆块 stagger（`fx-enter` + `--fx-index`，每项 ~60ms）；exit 更短更柔（小位移 + 淡出，不用全尺寸）。会话切换用双向视图过渡（translateY + blur）。
- 所有 icon 都有 hover 微动效，按语义分派 motif：`fx-icon-draw`（描边重绘，需 `lib/fx-icon-draw.ts` 的 pathLength=1 归一化，禁止裸 stroke-dash 硬编码长度——多笔画图标会闪）、`fx-icon-wiggle`、`fx-icon-pop`，以及持续位移/旋转类（Rocket 起飞、X/Plus 旋转 90°）。
- one-shot hover 重播用 keyframe；交互状态变化用 transition（可中断）。永不 `transition: all`，只写具体属性。
- 同类组件（卡片/气泡/弹窗）header 与内容之间不用 border 分割线，靠表面色差分层；列表项靠间距 + hover 表面区分。
- 流式跟随（工具组、会话流）：打开即跳到最新并持续跟随；用户上翻暂停、回到底部恢复，事件驱动禁止轮询。
- Toast 统一走 `ToastStack`：进 220ms quintOut、出 150ms cubicOut、重排 flip；不允许各处自建提示。
- 命中区 ≥40px；按下反馈 `active:scale-[0.96]`；同心圆角 outer = inner + padding。
- 一切动效尊重 `prefers-reduced-motion`（全局降级已在 `app.css`，新动效不得绕过）。

## 主题

默认 follow system，可切 light/dark/system，用 `data-theme` 落到 `documentElement`。
