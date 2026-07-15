# Seedream 项目级图片生成 Agent 实施状态

更新时间：2026-07-15
分支：`plan/seedream-image-node-integration`

## 文档优先级

- 当前产品和技术基线是项目级图片生成 Agent、独立单轮请求和 schema v4 永久会话。
- 早期[节点式前端交互 PRD](./005-seedream-image-node-frontend-interaction.md)已由 [ADR-010](../decisions/ADR-010-project-image-generation-conversations.md)取代，仅作为历史需求演进记录。
- 新开发不得恢复可执行 `image-generator` 节点、节点属性自动生成或隐式历史上下文。

## 已完成

- Runtime 图片生成诊断、Ark SDK 兼容性、Keyring 状态、连接依赖与 assignment 门禁。
- 文字模型与图片生成模型分入口管理，支持连接保存、测试、默认模型和安全凭据交互。
- 画布右栏重构为 `Agent｜图片生成｜Prompt库`；工具栏改为手动打开项目级图片生成，不再创建可执行生成节点。
- 项目级新对话、永久会话历史 Dialog、独立单轮请求、显式画布文字/图片注入和本地参考图上传。
- 结构化 `@`、稳定 `referenceId`、文生图、参考图生成、智能改图和局部修改四种工作流。
- point/bbox 大图区域编辑 Dialog，包括焦点恢复、撤销/重做、移动、删除、缩放和适应画面。
- 生成状态与安全错误恢复、结果操作、媒体库跳转、成功结果 pending placement 与普通图片节点幂等落画布。
- 旧 `image-generator` 节点只读预览，所有端口禁止新增连接，仅保留用户手动继续创作入口。
- Storage schema v4：项目会话、conversation run、placement 状态机和 v3→v4 无损迁移。
- 开发/测试双 Flag 默认开启；生产新建入口保持灰度；旧节点、结果与历史不受入口 Flag 影响。

## 自动化验证

- Vitest：82 个文件，503 项通过。
- 前端构建：通过。
- PromptCard Storage：56 项及 15 个子测试通过。
- Runtime 图片生成、模型管理、迁移和边界测试：120 项通过；`app`、`tests` 与 E2E Runtime fixture 的 Ruff 通过。
- 项目会话/侧栏/旧节点/区域编辑/客户端聚焦回归：58 项通过；前端构建通过。
- Rust：10 项通过。
- Agent 安全检查：通过。
- Playwright 图片生成闭环：1 项通过，使用真实 Runtime、真实 SQLite 和 Provider DI fake；生成与 Storage 不再由 `page.route()` 替代。
- `git diff --check`、密钥模式和供应商临时 URL 扫描：通过。
- ESLint：0 个错误；全仓当前有 41 个警告，超过 `max-warnings=30` 门槛，因此 `npm.cmd run lint` 仍返回失败。应单独降低警告预算，不应在图片功能改动中顺带重构无关文件。

## 发布前仍需完成

- 使用真实 Windows Credential Locker 与真实 Ark 账号完成人工冒烟：文生图、多参考图、智能改图、point、bbox。
- Runtime 全量套件在本机 124 秒门限内未完成且未输出失败；发布 CI 仍需运行无超时的全量套件。本轮相关 120 项测试已通过。

## 维护约束

- 永久历史无普通删除入口，Storage schema v4 不回滚。
- API Key 只进入操作系统凭据库，不写入前端、项目、SQLite 或日志。
- SDK HTTP 接口只做状态检测和重新检测，不执行安装或修复命令。
- 连接的画布依赖数量不可确认时，删除操作必须 fail closed。

相关文档：

- [前端交互 PRD](./005-seedream-image-node-frontend-interaction.md)
- [图片生成与模型管理架构](../architecture/image-generation-and-model-management.md)
- [Agent Runtime API](../api/agent-runtime-api.md)
- [ADR-009：能力目录与就绪门禁](../decisions/ADR-009-capability-driven-image-model-readiness.md)
- [ADR-010：项目级图片会话与画布 placement](../decisions/ADR-010-project-image-generation-conversations.md)
