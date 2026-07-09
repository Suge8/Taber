# 0016. fs 工具：文件工作区 + 技能文件化

日期：2026-07-09

状态：已接受（修订 ADR 0015 的工具形态）

## 背景

两个需求汇合：

1. 用户要上传 PDF/Word 让 Agent 处理，也要 Agent 把结果产出为文档；扩展环境没有文件系统，Agent 缺少文件读写通道。
2. ADR 0015 的专用 `skills` 工具（list/read/save）是自定义 API；而 LLM 对文件系统操作（ls/read/write）有强预训练先验——Claude Code、browser-harness 都用文件形态暴露知识。

## 决策

1. **单一 `fs` 工具**（`ls`/`read`/`write`）替代 `skills` 工具，暴露两个命名空间：
   - `/workspace/<name>`：会话文件（用户上传 + Agent 产出），存 Dexie `files` 表（db v3），随会话清理。
   - `/skills/<slug>.md`：站点技能，frontmatter（name/hosts/description）+ 正文；写入时解析 frontmatter 更新 Dexie `skills` 表。存储仍是结构化表，文件只是模型界面。
2. **文档转换内置在工具里**，模型不手写二进制：write `.docx` 时 Markdown → Word（`docx` 库）；上传的 pdf/docx 通过 `getDocument source:"file"` 解析为文本（pdfjs / `mammoth`）。
3. **PDF 输出不造假**：纯 JS 生成 PDF 的 CJK 字体嵌入成本过高、排版质量差。Agent 写 `.md`/`.html`，用户从侧边栏"导出 PDF"打开扩展打印页（`print.html`，marked + DOMPurify 渲染）走浏览器原生打印，质量最高、零新依赖。
4. `getDocument source:"file"` 改为按名读取工作区文件；无消费者的 `fileText` 直传分支删除。
5. 技能提示随导航流动：任务开始时 instructions 附当前 host 匹配技能摘要；`navigate` open/switchTab 与 `browser` 动作落到新 host 时结果附 `availableSkills` 路径；同 host 不重复提示。
6. 内置种子技能（`source:"builtin"`，按版本幂等写入）：HN/Reddit/GitHub/Wikipedia 的 fetch-first API 端点——相当于 OpenCLI adapter 的零架构等价物（技能正文即可执行流程）。

## 替代方案

- 保留专用 skills 工具 + 独立 files 工具：两套自定义 API，模型先验弱、工具面大；否决。
- OPFS 作为文件存储：sandbox 页面是独立 origin 无法共享，且违反本地 Agent 数据库单一事实源；否决。
- pdf-lib 生成 PDF：CJK 需嵌入 ~2MB 字体且手写排版，输出质量低于浏览器打印；否决。

## 影响

- 顶层工具仍为 6 个：`getDocument/extractImage/navigate/browser/browserRepl/fs`。
- 新依赖：`docx`（生成 Word）、`mammoth`（解析 Word），均纯 JS、动态 import。
- 侧边栏新增：Composer 附件上传、FilesStrip 下载/导出 PDF/删除。
