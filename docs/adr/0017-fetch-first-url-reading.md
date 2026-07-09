# 0017. fetch-first：getDocument source:"url"

日期：2026-07-09

状态：已接受

## 背景

Agent 读任何 URL 都要 `navigate.open` 占用受控标签页、等待渲染、打扰用户；跨页收集 N 个 URL 是串行的 tab 导航。web-access 等项目验证的调度哲学：静态可达就直接 fetch，需要登录态或 JS 渲染才动浏览器。

## 决策

1. `getDocument` 新增 `source:"url"`：offscreen 侧直接 `fetch`（依赖已授权的 optional host permissions），按 `content-type` 分流——HTML 走 DOMParser + Readability/Markdown 现有管线，PDF 走 pdfjs 文本提取。不开 tab、不改任务 target、可并行。
2. 原 `source:"pdf"` 并入 `url`（自动识别），消除重复入口。
3. 失败语义：fetch 失败或无可读内容返回 `ok:false` + retryHint，明确指引回退 `navigate.open` + `currentPage`，不静默降级。
4. instructions 与工具描述声明 fetch-first 策略：公开/静态 URL 优先 `url`，登录态或 JS 渲染才用 `currentPage`。

## 影响

- 跨页收集从"逐个开 tab"变为并行 fetch，快一个数量级、零打扰。
- 内置种子技能（ADR 0016）的大站 API 端点依赖此通道执行。
