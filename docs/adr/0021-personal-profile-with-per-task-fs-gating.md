# 0021. 个人资料：/profile.md + 每任务 fs 门控

日期：2026-07-13

状态：已接受

## 背景

复杂表单填写是浏览器 Agent 的核心场景，但 Agent 拿不到用户的个人信息（姓名、电话、地址、证件号等），只能反复向用户询问。需要一个本地存储、用户显式授权的个人信息通道。

## 决策

1. **自由文本 Markdown，不做结构化字段**：个人资料是用户在设置页手写的一段文本，存 Dexie `settings` 表（`personalProfile` key，上限 20k 字符，零 schema migration）。真实表单字段无法预定义，LLM 消化自由文本是强项；"你写什么 AI 就只看到什么"，绝对透明。
2. **通过已有 `fs` 工具以 `/profile.md` 暴露，Agent 只读**：不新增工具。资料由用户在设置页维护，Agent 不可写。
3. **零知识门控**：授权状态是每任务快照（`profileAccess`，随 startTask 消息流动，默认 `false`）。未授权时 `/profile.md` 在 `fs ls` 不出现、read/write 返回与普通文件一致的 not found、静态工具描述和基础 instructions 一字不提——Agent 无从知道该文件存在，攻击面为零。授权时才在 instructions 动态附加个人资料段（读取时机 + 禁止外泄约束）。
4. **消费式授权，不持久化**：与前台模式（ADR 0019 粘性偏好）不同，授权只覆盖一次任务：成功启动即消费（`profileConsentAfterStart`），启动失败保留用户选择；清空资料自动关闭开关。未填写资料时点击开关跳设置页。
5. **审计脱敏（历史不得绕过门控）**：会话事件、工具日志会喂入后续任务的模型上下文、时间线和会话导出，若记录资料原文，未授权的后续任务就能从历史读到它。因此 `fs read /profile.md` 的审计记录在唯一收口点（agent-tools 的 run logger）脱敏：模型在授权调用内拿原文，`tool.completed` 事件与 `toolRuns` 只记录 `{ path, contentChars, redacted: true }`。

## 已知风险

存储安全不是主要威胁，prompt injection 泄露才是：授权窗口内，恶意页面可能诱导 Agent 读取资料后提交到别处。缓解（非根除）：每任务显式授权缩小暴露窗口、instructions 禁止向任务目标之外提交、时间线以身份卡图标醒目显示读取事件、既有"提交敏感信息需确认"边界兜底。

## 替代方案

- 结构化字段（浏览器 autofill 式）：字段永远不够用，UI 和映射成本高；否决。
- 全局粘性开关：用户容易忘记开着，敏感数据暴露窗口过大；否决。
- 关闭时返回"需授权"错误提示：向模型泄露功能存在，诱导其引导用户开启；否决，选择零知识。

## 影响

- 新模块：`lib/personal-profile.ts`；`fs` 工具新增 `/profile.md` 只读命名空间。
- 侧边栏：设置页个人资料编辑器（`ProfilePanel.svelte`）、Composer 身份卡开关、时间线 profile 读取图标。
- `task.started` 事件 payload 新增 `profileAccess` 字段。
