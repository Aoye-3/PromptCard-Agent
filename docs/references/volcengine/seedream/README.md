# Seedream 官方参考资料

本目录保存 PromptCard-Manager 接入 Doubao Seedream 5.0 Pro 时使用的火山方舟官方文档快照。实现、评审和排障时，应先根据问题类型选择下表中的权威来源，再与当前在线文档核对更新时间。

## 文档索引

| 文档 | 官方文档 ID | 在线来源 | PDF 快照 | 页数 | 官方更新时间（UTC） | SHA-256 |
| --- | ---: | --- | --- | ---: | --- | --- |
| 图片生成教程 | `1824121` | [在线文档](https://www.volcengine.com/docs/82379/1824121?lang=zh) | [PDF](<./official-pdfs/火山方舟_图片生成教程_1784082872.pdf>) | 62 | `2026-07-15T02:33:35Z` | `728DB347D7BE2E5422E66DCD49D20B52F24EDE2BAC3FE16DC4DAC09DF01936C9` |
| Doubao Seedream 5.0 Pro 教程 | `2582774` | [在线文档](https://www.volcengine.com/docs/82379/2582774?lang=zh) | [PDF](<./official-pdfs/火山方舟_Doubao Seedream 5.0 pro 教程_1784100842.pdf>) | 14 | `2026-07-15T07:33:29Z` | `4DB2FA70C61BF23AB2E8F0B787B76F4EC8F6C4F770B4854334422223520E5826` |
| Doubao Seedream 5.0 Pro 实现交互编辑指南 | `2582775` | [在线文档](https://www.volcengine.com/docs/82379/2582775?lang=zh) | [PDF](<./official-pdfs/火山方舟_Doubao Seedream 5.0 pro 实现交互编辑指南_1784037121.pdf>) | 13 | `2026-07-14T13:51:12Z` | `D48D1EA4AFE454805F807E2366ED1162512E4EC344E6B306C1D2421AFC851156` |

## 查阅路由

- 查询通用图片生成流程、文生图、图生图、多图融合、SDK 示例和 `图1` / `图2` 引用方式：查阅“图片生成教程”。
- 查询 Seedream 5.0 Pro 的模型 ID、版本能力、分辨率、输出格式、提示词优化和交互编辑入口：查阅“Doubao Seedream 5.0 Pro 教程”。
- 查询点选、框选、局部重绘、归一化坐标以及 `<point>` / `<bbox>` Prompt 格式：查阅“实现交互编辑指南”。

## 已确认的实现依据

- Seedream 5.0 Pro 模型 ID 为 `doubao-seedream-5-0-pro-260628`。
- 多参考图在 API 中按 `image[]` 顺序传入；Prompt 使用 `图1`、`图2` 等编号引用对应输入图。
- 交互编辑通过 Prompt 坐标标记实现，不是独立的 mask 请求字段。
- 点选格式为 `<point>x y</point>`；框选格式为 `<bbox>x1 y1 x2 y2</bbox>`。
- 坐标相对单张输入图归一化到 `0–999`，左上角为 `(0, 0)`，右下角为 `(999, 999)`。
- 最新 Seedream 5.0 Pro 教程列出 `standard` 与 `fast` 两种提示词优化模式；这与较早的 API 文档快照可能存在差异，实施时必须以当前在线文档和真实 SDK 验证为准。

## Seedream 5.0 Pro 能力矩阵

| 官方能力 | PromptCard 适配 |
| --- | --- |
| 文生图 | `generate`，无图片输入 |
| 单图/多图参考生成 | `generate`，0–10 张有序输入，稳定 `referenceId` 编译为 `图N` |
| 智能改图 | `edit`，一张主图加可选参考图 |
| 交互编辑 | `region-edit`，支持跨图 point/bbox 与 0–999 坐标 |
| 分辨率 | 1K、2K |
| 比例 | smart、1:1、4:3、3:4、16:9、9:16、3:2、2:3、21:9、自定义 |
| 自定义尺寸 | 921600–4624220 总像素，比例 `1:16–16:1` |
| 提示词优化 | `standard`（默认）、`fast`，映射 Ark SDK `OptimizePromptOptions` |
| 输入格式 | JPEG、PNG、WebP、BMP、TIFF、GIF、HEIC、HEIF；原件永久保留，非标准格式生成 PNG/JPEG 派生图 |
| 输入限制 | 单图 ≤30 MB、≤3600 万像素、两边 >14、比例 `1:16–16:1` |
| 视觉标记 | 自由画笔、箭头、矩形、椭圆、文字；栅格化派生图，不宣称原生 mask |
| 输出 | 单张 PNG/JPEG，明确水印布尔值 |
| 响应 | 后端支持 URL 与 `b64_json` 落盘，普通界面不暴露传输选择 |
| 不支持/不宣传 | 4K、组图、多结果、流式、sequential、groups、联网搜索、原生 mask |

实现契约和安全边界见[图片生成与模型管理架构](../../../architecture/image-generation-and-model-management.md)，原件与派生图决策见 [ADR-011](../../../decisions/ADR-011-original-and-derived-image-assets.md)。

## 验证边界

- 自动化能力适配截至 `2026-07-16` 已覆盖 SDK 参数映射、URL/Base64 落盘、输入限制、八种预设比例、自定义尺寸、standard/fast、阿拉伯语/日语/德语 Prompt 保真、Storage schema v5、图片派生关系和项目级 E2E。
- 自动化 E2E 使用真实 Runtime HTTP 与真实 SQLite Storage，但 Provider 是测试 DI fake；它不证明真实 Ark 账号、额度、输出域名或 Windows Credential Locker 已完成发布验收。
- 生产启用前仍需按[运行环境发布冒烟清单](../../../operations/runtime-setup.md#release-smoke-checklist)完成真实 Ark 人工验证。

## 维护规则

1. 在线官方文档高于本地 PDF 快照；发现内容变化时，新增快照并更新本索引，不覆盖旧快照。
2. 官方资料高于项目计划、PRD 和历史实现说明；冲突必须在评审记录中明确列出。
3. 引用能力时同时记录官方文档 ID 和更新时间，避免把其他 Seedream 型号的能力套用到 5.0 Pro。
4. PDF 只作为只读来源保存，不对内容做编辑或重新导出。
