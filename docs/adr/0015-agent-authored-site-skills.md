# 0015. Agent 沉淀的站点技能（Site Skills）

日期：2026-07-09

状态：已接受（推翻 plan.md 早期"暂不做 reusable site skills"）；工具形态已由 ADR 0016 修订：专用 `skills` 工具并入 `fs`，技能以 `/skills/*.md` frontmatter 文件暴露

## 背景

浏览器 Agent 每次进入同一站点都要重新摸索流程、选择器和陷阱。业界共识（browser-use/browser-harness 的 domain-skills、OpenCLI 的 sitemap、web-access 的 site-patterns、ego-lite 的 site-skills）：

1. 站点知识是按 host 组织的小型 Markdown 先验，不是操作手册。
2. 知识由 Agent 在任务中沉淀，不由人手写。
3. 知识是 prior，不是 ground truth；实时页面状态永远优先。
4. 懒加载：导航时只提示可用技能名称，需要时才读正文，控制 token 成本。

Taber 侧边栏原有 Skills 入口只是 UI 占位。

## 决策

1. **单一事实源**：新增 Dexie `skills` 表（db v2）：`name/hosts/description/content/source/enabled`。`name` 是逻辑键（大小写不敏感 upsert）。上限 200 条、正文 8000 字符，防膨胀。
2. **第 6 个顶层工具 `skills`**：`list` / `read` / `save`。save 由 Agent 在任务后沉淀非显而易见的可复用发现；不提供 delete（删除属于用户 UI 操作，防误删知识）。
3. **懒加载两段式消费**：
   - 任务开始时按 target tab host 匹配，把技能 name+description 摘要附加到 instructions 末尾（`skillsDigestForUrl`）。
   - `navigate` open/switchTab 结果附 `availableSkills` 名称列表，Agent 决定是否 `skills read`。
4. **匹配规则**：host 归一化（小写、去 `www.`）；页面 host 等于技能 host 或为其子域时命中；仅 `http/https`。
5. **权威级**：instructions 与工具描述均声明技能是先验知识，与页面实际状态冲突时以页面为准；禁止保存密钥或个人数据。
6. **UI**：侧边栏 Skills 对话框列出技能，支持启用/停用/删除。

## 替代方案

- **匹配技能全文注入 instructions**：token 成本不可控，多技能站点直接爆预算；否决。
- **文件系统存储（如参考项目）**：扩展环境无文件系统，且违反本地 Agent 数据库单一事实源；否决。
- **独立 skill 编辑器 UI**：Agent 沉淀是主路径（参考 browser-harness "skills are written by the harness"），手工编辑价值低；暂不做。

## 影响

- 顶层工具从 5 个变为 6 个（`getDocument/extractImage/navigate/browser/browserRepl/skills`）。
- `AGENT_INSTRUCTIONS_VERSION` 升至 4：新增站点技能策略与"先明确完成标准"的目标锚点。
- 技能内容进入模型上下文时属于用户拥有的指导性先验，非不可信页面数据；但沉淀时禁止写入敏感信息。
