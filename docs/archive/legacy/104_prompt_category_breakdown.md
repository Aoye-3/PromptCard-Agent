# 104种教学版+提示词：提示词库类目拆解

## 1. 文档结构结论

- 文档标题：`AI 运镜全库・104 种全量教学测试终极汇总版`
- 实际结构：`前置总说明 -> 通用固定提示词模块 -> 体系一 -> 体系二 -> 终极使用指南 -> 国漫玄幻打斗专属单元 -> 最终测试收尾提示`
- 主表结构：21 个五列表格，字段为 `序号 / 运镜名称 / 10 秒核心逻辑 / 教学核心作用 / 完整 AI 生成提示词`
- 追加表结构：1 个四列表格，字段为 `运镜名称 / 10 秒运镜核心逻辑 / 教学核心作用 / AI 生成完整提示词`
- 实际条目数：主编号 1-111 连续无缺号，追加打斗单元 6 条未编号，共 117 条可入库条目
- 标题计数风险：文档标题写 104 种，但正文主编号已到 111，并且额外追加 6 条，建议入库时以抽取条目为准，并在 meta 中保留来源标题

## 2. 当前提示词库映射逻辑

仓库当前 `IPreset` 数据结构适合这样承接：

- `type`：一级卡片类型。本文档主要应归入 `camera`，少量通用前后缀可拆到 `style`、`timing`、`constraint`、`audio`
- `category`：二级细分类目。建议使用稳定 slug，例如 `camera.basic_push_pull`
- `label`：运镜名称，例如 `慢速推进`
- `content`：推荐存完整 AI 生成提示词；如果要支持组合式拼装，可另存 `coreMotion` 到 `meta`
- `meta`：保留教学属性与来源信息，例如 `system`、`unit`、`scene`、`duration`、`fps`、`teachingUse`、`sourceDoc`、`sourceSeq`

## 3. 模块级拆解

| 模块 | 入库 type | 建议 category | 用途 |
| --- | --- | --- | --- |
| 通用固定前缀 | `constraint` / `style` / `camera` | `video.global_prefix` | 画质、风格、帧率、一镜到底、光影稳定等通用生成条件 |
| 固定统一场景 | `scene` | `scene.motion_test` | 每个运镜单元的统一测试场景 |
| 核心运镜指令 | `camera` | 各运镜子类 | 真正的可复用镜头运动变量 |
| 通用固定后缀 | `constraint` / `audio` | `video.global_suffix` | 主体清晰、无字幕、无音乐、无黑屏、无穿帮等负面约束 |
| 教学核心作用 | 不直接拼 prompt，进 `meta.teachingUse` | - | 用于学习模式、筛选、说明、推荐 |
| 终极使用指南 | `custom` 或文档知识库 | `guide.camera_motion` | 使用顺序、组合技巧、避坑、场景速查 |

## 4. 一级体系拆解

| 体系 | 定位 | 条目数 | 入库建议 |
| --- | --- | ---: | --- |
| 体系一：实拍物理规则内可实现・AI 可极致优化的基础运镜 | 真实摄影/常规视频基础运镜 | 62 | `type=camera`，适合作为默认、教学、入门优先类目 |
| 体系二：AI/CG 专属・突破现实物理规则的超现实运镜 | AI 视频/CG/玄幻动画超现实运镜 | 49 | `type=camera`，适合作为高级、特效、玄幻、叙事类目 |
| 国漫玄幻打斗专属单元 | 双主体打斗、连招、大招、瞬移、时间切片 | 6 | `type=camera`，建议并入 `camera.combat_xuanhuan` |

## 5. 二级类目拆解

| 建议 category | 原文单元 | 条目数 | 内容定位 |
| --- | --- | ---: | --- |
| `camera.basic_push_pull` | 基础推拉变焦运镜 | 7 | 推进、拉出、冲击推进、滑动变焦、微距、连续推拉、变速推拉 |
| `camera.character_composition` | 角色定位构图运镜 | 3 | 过肩、正反打、鱼眼/窥视镜 |
| `camera.environment_interaction` | 障碍物与环境互动运镜 | 4 | 遮挡揭示、穿行、遮挡转场、缝隙窥视 |
| `camera.focus_control` | 焦点与镜头操控运镜 | 4 | 失焦、聚焦、焦点转移、呼吸焦点 |
| `camera.tripod_pan_tilt` | 三脚架固定基础运镜 | 3 | 上摇、下摇、水平摇 |
| `camera.slider_lateral` | 滑轨横向运镜 | 3 | 左横移、右横移、变速横移 |
| `camera.orbit` | 环绕运镜 | 4 | 180/360 环绕、弧线、变速环绕 |
| `camera.vertical_lift` | 垂直升降运镜 | 5 | 台座升降、吊臂升降、升降俯仰联动 |
| `camera.optical_zoom` | 光学镜头特效运镜 | 4 | 光学推进/拉出、骤拉变焦、光学变速 |
| `camera.drone_aerial` | 无人机/航拍专属运镜 | 6 | 飞越、上升揭示、环绕、俯拍、FPV 俯冲、鹰眼俯角 |
| `camera.stylized_dynamic` | 风格化动态运镜 | 4 | 手持、甩镜、荷兰角、震动冲击 |
| `camera.subject_tracking` | 主体追踪运镜 | 5 | 引领、跟随、侧跟、第一人称行走、高速锁定 |
| `camera.time_speed` | 时间与速度操控运镜 | 3 | 延时、慢动作、定格帧延 |
| `camera.extreme_perspective` | 极端定向与透视运镜 | 3 | 桶滚、虫眼、鹰眼 |
| `camera.ai_space_breakthrough` | 空间物理规则突破类运镜 | 11 | 无限尺度、穿行、瞬移、空间折叠、反重力、多路径等 |
| `camera.ai_time_control` | 时间维度全操控类运镜 | 10 | 子弹时间、倒流、同框快慢、时间切片、循环、涟漪等 |
| `camera.ai_optical_perspective` | 光学与透视极限突破类运镜 | 9 | 无限景深、多焦点、虫洞透视、全视场、无限倍率等 |
| `camera.seamless_transition` | 运镜 + 转场一体化无缝运镜 | 4 | 元素匹配、动作帧锁定、画框嵌套、光影覆盖 |
| `camera.emotion_narrative` | 强情绪与叙事适配专属运镜 | 6 | 呼吸、心跳、压迫画幅、视线锚定、群像、情绪失重 |
| `camera.dimension_logic` | AI/CG 独有的维度与空间逻辑突破运镜 | 5 | 2D-3D、分层穿梭、非欧空间、解构重组、生成式无限 |
| `camera.xuanhuan_animation` | 叙事向玄幻 / 动画专属定制运镜 | 8 | 长镜头、神识、灵魂视角、功法绑定、次元壁、回忆杀等 |
| `camera.combat_xuanhuan` | 国漫玄幻打斗专属・极致爽感运镜教学合集 | 6 | 双主体跟拍、连招锁定、大招第一视角、反打瞬移、时间切片等 |

## 6. 推荐落库字段

```ts
{
  id: "motion-001-slow-push-in",
  type: "camera",
  category: "camera.basic_push_pull",
  label: "慢速推进",
  content: "完整 AI 生成提示词",
  usageCount: 0,
  meta: {
    sourceDoc: "104种教学版+提示词.docx",
    sourceSeq: 1,
    system: "体系一：实拍物理规则内可实现・AI 可极致优化的基础运镜",
    unit: "基础推拉变焦运镜",
    scene: "中式实木桌面...",
    duration: "10秒",
    fps: "60fps",
    resolution: "4K",
    coreMotion: "10 秒核心逻辑",
    teachingUse: "教学核心作用",
    promptMode: "full"
  }
}
```

## 7. 入库优先级建议

1. 先入 `camera` 主类 117 条完整提示词，保证 Prompt 库可直接搜索、复制、复用。
2. 再把通用前缀、通用后缀、固定场景拆成模块化 presets，服务后续组合式生成。
3. UI 筛选层保留现有 `type`，新增/利用 `category` 做二级分类筛选。
4. 对计数异常做数据注记：标题 104、主编号 111、追加 6，避免后续验收时误以为抽取重复。
