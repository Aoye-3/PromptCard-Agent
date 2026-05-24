# PromptCard学习系统 V4 整合需求文档
## 文档信息
| 项 | 内容 |
|----|------|
| 项目名称 | PromptCard Learning System V4 |
| 版本 | V4.0 |
| 创建日期 | 2026年4月10日 |
| 更新日期 | 2026年4月13日 |
| 目标用户 | 非专业Prompt初学者 |
| 核心目标 | 通过案例对比学习提升用户视频Prompt编写能力 |
| 当前状态 | **开发完成** - 项目已具备所有核心功能，通过Claude设计规范验证 |
| 构建状态 | ✅ 生产构建成功通过 |
---
## 一、项目背景与核心问题
### 1.1 现有问题总结
1. **教育性不足**：仅提供快速生成功能，没有"教人写prompt"的教学属性
2. **深度不够**：用户只会写简单描述，不知道如何丰富细节
3. **价值不明显**：略有基础的用户直接用文本也能完成
4. **缺乏指导**：没有系统的展开指导和反馈机制
### 1.2 用户痛点
- 知道Prompt的基础结构，但不知道如何写得更好
- 典型问题：只会写"一个人在跑步"，不会展开为"穿运动服的年轻人在清晨的公园步道晨跑，双臂有节奏摆动，呼吸均匀"
### 1.3 改进目标
| 指标 | 目标值 |
|------|--------|
| 可用性评分 | ≥68分 |
| 用户满意度 | ≥4.0/5.0 |
| 用户Prompt细节度提升 | ≥30% |
| 认知负荷降低 | ≥15% |
| 用户留存率提升 | ≥25% |
---
## 二、技术架构与实现状态
### 2.1 技术栈
- **前端框架**：React 18 + TypeScript 5.2.2
- **构建工具**：Vite 5.0.8
- **状态管理**：Zustand 4.5.0（轻量级状态管理库）
- **样式系统**：Tailwind CSS 3.4.0 + 自定义主题变量
- **UI组件库**：Lucide React图标 + 自定义组件
- **开发工具**：ESLint 8.55.0 + Prettier 3.1.1 + Husky + Lint-staged

### 2.2 项目架构特点
1. **模块化设计**：功能按领域划分（组件、服务、存储、工具）
2. **状态管理**：使用Zustand实现卡片状态和预制库管理
3. **本地存储**：localForage持久化存储用户配置和学习进度
4. **AI集成**：支持OpenAI、DeepSeek、通义千问、文心一言等AI服务
5. **响应式设计**：适配不同屏幕尺寸，支持移动端访问

### 2.3 已实现的核心功能
| 功能模块 | 实现状态 | 技术特点 |
|----------|----------|----------|
| 卡片组件系统 | ✅ 完整实现 | 支持双模式（自主输入/预制选择），30+预制内容库 |
| 学习模式 | ✅ 完整实现 | 案例对比学习、展开过程可视化、学习路径系统 |
| 评估模式 | ✅ 完整实现 | 四维度评分、智能优化建议、AI增强评估 |
| 创意模式 | ✅ 完整实现 | 快速添加卡片、预制提示词选择、优秀示例展示、卡片选中状态管理、快速复制功能 |
| Prompt 库管理 | ✅ 完整实现 | 分类管理、搜索筛选、CRUD操作、实时数量统计、页面切换导航 |
| 本地存储 | ✅ 完整实现 | 用户配置、学习进度、卡片数据持久化 |
| AI设置 | ✅ 完整实现 | 多服务商支持、API配置、测试连接功能 |

#### 卡片双模式说明
每个卡片都同时支持两种使用模式，用户可自由切换：
1. **📝 自主输入模式**：用户自由编辑文本框内容，自定义描述，满足个性化需求
2. **🎯 预制选择模式**：从官方预制库中选择现成的优质内容片段，一键填入，降低使用门槛

#### 新增卡片功能说明
支持用户自主添加新卡片，共10种可选类型：
| 可选类型 | 说明 |
|----------|------|
| 原有9种标准卡片 | Subject/Action/Scene/Style/Camera/Lighting/Timing/Audio/Constraints |
| 📝 自定义注释卡片 | 用户自由添加备注、说明、特殊要求、提示词片段等内容，无固定格式，完全自定义 |

> 功能价值：支持用户灵活扩展Prompt结构，自由组合不同类型的内容块，满足复杂场景的编写需求。

#### 卡片数据处理要求
数据从HuggingFace下载
请你处理数据集。提取其中的高分提示词，然后按照Prompt = [Subject] +[Action] +[Scene / Context] +[Style] +[Camera / Cinematography] +[Lighting / Color] +[Timing / Duration] +[Audio] +[Constraints]
 这些元素进行分类。总共需要两个数据库：一个是完整提示词按照偏向元素分类用于示例功能的开发。一个是要素的提取，用于填充预制提示词的选项。


### 重要说明
❌ 没有视频生成功能！我们只负责构建Prompt！!
### 2.2 技术约束
- 技术栈保持：HTML5 + CSS3 + JavaScript + Tailwind CSS
- 不包含视频生成功能，仅做Prompt编写教学
- 所有数据本地化存储，无需后端服务
---
## 三、Claude设计规范应用状态
### 3.1 设计规范应用情况
✅ **主题色彩系统**：成功实现Claude品牌色彩规范
- 主色调：Terracotta（#c96442）- 温暖的陶土色
- 辅助色：Coral（#d97757）- 珊瑚色
- 中性色：Parchment（#f5f4ed）、Ivory（#faf9f5）、WarmSand（#e8e6dc）
- 文字色：NearBlack（#141413）、CharcoalWarm（#4d4c48）

✅ **排版系统**：符合Claude设计规范
- 标题字体：Georgia + Noto Serif SC（衬线字体，文学风格）
- 正文字体：System UI + Noto Sans SC
- 字体层级：清晰的标题-正文-辅助文字层级关系

✅ **组件设计**：所有组件符合Claude风格
- 卡片组件：使用parchment背景，terracotta边框，悬停时有微妙阴影效果
- 按钮系统：主按钮（terracotta渐变）、次要按钮（warm sand背景）
- 表单元素：使用ivory背景，border cream边框，focus时terracotta高亮
- 交互反馈：柔和的阴影、边框和颜色变化，符合温暖风格

✅ **布局设计**：
- 保持九宫格卡片系统不变，但优化了视觉层次
- 学习模式和创意模式标签页设计符合规范
- 评估模式图表和数据展示清晰易读

---
## 四、核心功能实现状态
### 4.1 案例对比学习系统（100%实现）
#### 4.1.1 好/差示例库（✅ 已实现）
- 为每个Component（Subject/Action/Environment/Style等）提供好/差示例对比
- 示例数据：已包含Subject、Action、Environment、Style等核心组件的示例
- 数据结构：完整的JSON格式，包含poor_examples、good_examples、learning_points

#### 4.1.2 展开过程展示（✅ 已实现）
- 可视化展示从简单描述到丰富细节的逐步展开过程
- 交互：点击展开步骤，进度条展示展开程度
- 实现文件：`src/data/learningContent.ts`

#### 4.1.3 学习路径系统（✅ 已实现）
- 四级学习路径：
  1. 基础：理解Component基本概念
  2. 进阶：学习单个Component展开技巧
  3. 高级：学习Component组合技巧
  4. 专家：掌握创意表达和风格融合

#### 4.1.4 卡片联动交互逻辑（✅ 已实现）
- 交互规则：点击左侧九宫格中任意卡片组件，右侧学习模式自动切换为对应类型的教学内容
- 联动对应关系完整实现
- 交互价值：降低用户学习门槛，点击对应卡片即可查看该类型的教学内容

### 4.2 创意模式功能（✅ 已实现）

#### 4.2.1 核心功能架构
**布局设计**：弹窗式交互架构
- 类型选择标签：主体、动作、场景、风格、镜头、灯光、时序、音频、约束、自定义
- 快速添加卡片：页面内滚动区域，支持复制、添加到卡片、新建卡片操作
- 预制提示词选择器：模态弹窗，支持类型筛选和选择
- 优秀示例窗口：模态弹窗，展示精选优秀示例

#### 4.2.2 功能特性
| 功能模块 | 实现状态 | 技术特点 |
|----------|----------|----------|
| 类型导航系统 | ✅ 完整实现 | 10种卡片类型标签，支持切换和自动更新内容 |
| 快速添加卡片 | ✅ 完整实现 | max-h-96高度，支持复制、添加到当前卡片、新建卡片 |
| 预制提示词选择器 | ✅ 完整实现 | 类型筛选、选中状态管理、支持回显 |
| 优秀示例展示 | ✅ 完整实现 | 分页展示、评分显示、点击响应 |
| 卡片选中状态管理 | ✅ 完整实现 | 支持当前卡片识别和内容追加 |
| 快速复制功能 | ✅ 完整实现 | 一键复制提示词到剪贴板 |
| 统计信息展示 | ✅ 完整实现 | 显示各类型预制提示词和示例数量 |
| 模板保存与新建 | ✅ 完整实现 | 多选卡片保存为模板，然后在用户新建页面时可以直接使用|
| 页面复制功能 | ✅ 完整实现 | 新增页面时复制当前页面的所有卡片状态，避免从零开始组织提示词 |
| 删除页面功能 | ✅ 完整实现 | 一键删除整个页面，支持批量操作，至少保留一页 |

#### 4.2.3 交互流程
1. **选择类型**：点击类型标签切换卡片类型
2. **浏览内容**：快速添加卡片区域显示对应类型的预制提示词
3. **快速操作**：支持一键复制、添加到当前卡片、新建卡片
4. **详细选择**：点击"选择预制提示词"按钮打开弹窗选择器
5. **查看示例**：点击"查看优秀示例"按钮打开示例窗口

#### 4.2.4 技术实现要点
- **组件架构**：CreativeMode.tsx + PresetSelector.tsx + ExampleWindow.tsx
- **状态管理**：Zustand stores + useEffect监听状态变化
- **数据来源**：VIDPROM_PRESET_OPTIONS + VIDPROM_EXCELLENT_EXAMPLES
- **响应式设计**：Tailwind CSS响应式布局，支持移动端访问

### 4.4 Prompt 库管理功能（✅ 已实现）

#### 4.4.1 核心功能架构
**功能定位**：独立的 Prompt 管理界面，提供完整的 CRUD 操作和分类管理

**主要功能**：
| 功能模块 | 实现状态 | 技术特点 |
|----------|----------|----------|
| 页面导航 | ✅ 完整实现 | 顶部导航栏"Prompt 库"按钮，支持页面切换 |
| 返回首页功能 | ✅ 完整实现 | Prompt 库页面提供返回首页按钮 |
| 分类筛选 | ✅ 完整实现 | 10个类型标签 + 全部标签，实时数量统计 |
| 搜索功能 | ✅ 完整实现 | 支持按名称和内容搜索 |
| CRUD操作 | ✅ 完整实现 | 新增、编辑、删除预制提示词 |
| 数据统计 | ✅ 完整实现 | 实时统计各类型数量、常用 Prompt 数量 |
| 响应式设计 | ✅ 完整实现 | 适配不同屏幕尺寸，移动端访问友好 |

#### 4.4.2 技术实现架构
**核心文件**：
- **PromptLibrary.tsx**：Prompt 库主页面组件
- **PromptLibraryForm.tsx**：新增/编辑表单组件
- **PromptLibraryTable.tsx**：表格展示组件
- **preset.store.ts**：状态管理和数据操作
- **storage.ts**：本地存储接口

**状态管理**：
- 使用 Zustand 进行状态管理
- activePage 状态控制页面切换
- activeCategory 状态管理分类筛选
- searchTerm 状态管理搜索功能

**数据存储**：
- 使用 localForage 进行本地存储
- 支持批量操作和实时更新
- 数据结构符合 IPreset 接口规范

#### 4.4.3 分类标签系统
**功能特点**：
- 11个分类标签（全部 + 10种卡片类型）
- 实时显示各类型 Prompt 数量
- 蓝色选中状态，清晰的视觉反馈
- 圆角按钮设计，符合设计规范

**标签样式**：
- 全部标签：蓝色选中状态，显示总数量
- 类型标签：灰色未选中状态，显示类型数量
- 悬停效果：灰色背景加深
- 点击反馈：平滑过渡动画

#### 4.4.4 页面管理功能优化
**新增页面逻辑优化**
- **文件位置**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\stores\card.store.ts`
- **功能说明**：新增页面时会完全复制当前页面的所有卡片状态，包括类型、标题、内容、布局和颜色
- **实现细节**：为每个复制的卡片生成新的唯一ID，重新设置创建和更新时间
- **技术亮点**：使用Zustand状态管理，支持批量复制操作

**删除页面功能**
- **文件位置**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\App.tsx`
- **功能说明**：在页面导航区域为每个页面添加删除按钮，支持一键删除整个页面
- **实现细节**：
  - 删除前有确认对话框防止误操作
  - 至少保留一页，防止用户删除所有页面
  - 红色主题按钮与页面导航按钮形成视觉对比
- **用户体验**：批量操作提升了创作效率，避免逐个删除卡片的麻烦

### 4.3 反馈与评估系统（✅ 已实现）
#### 4.3.1 质量评分系统（✅ 已实现）
- 四个评分维度：完整性/细节度/创意性/连贯性
- 本地规则引擎自动评分，无需AI调用
- ✨ **Prompt效果自动检测**：实时扫描用户当前编写的Prompt，自动检测完整性、细节丰富度、逻辑合理性，给出可操作的优化建议

#### 4.3.2 改进建议生成（✅ 已实现）
- 提供具体可操作的改进建议：细节补充/表达优化/创意启发/结构调整
- 优化建议可一键应用到当前Prompt
---
## 五、界面设计规范实现状态
### 5.1 布局规范实现情况（✅ 已实现）
- **九宫格卡片系统**：保留现有结构不变，但优化了视觉层次
- **卡片设计**：单个卡片组件删除快速选择预制内容字样排版，删除所有预制内容标签，删除悬停查看预览效果
- **响应式设计**：适配不同屏幕尺寸，支持移动端访问

### 5.2 交互规范实现情况（✅ 已实现）
- **点击自动插入**：点击自动插入到当前Prompt对应位置
- **卡片式设计风格**：保持现有卡片式设计风格，交互反馈清晰
- **动画效果**：柔和的hover阴影、border动画，符合Claude设计规范

---
## 六、项目架构与文件结构
```
src/
├── components/                  # React组件
│   ├── CardComponent.tsx        # 卡片组件
│   ├── EvaluationPanel.tsx      # 评估面板
│   ├── AISettingsPanel.tsx      # AI设置面板
│   ├── CreativeMode.tsx         # 创意模式主组件
│   ├── PresetSelector.tsx       # 预制提示词选择器
│   ├── ExampleWindow.tsx        # 示例窗口组件
│   ├── PromptLibrary.tsx        # Prompt 库主页面
│   ├── PromptLibraryForm.tsx    # 新增/编辑表单组件
│   └── PromptLibraryTable.tsx   # 表格展示组件
├── data/                        # 学习内容数据
│   └── learningContent.ts       # 案例对比数据
├── knowledge/                   # 知识系统
│   ├── prompt-guide-data.ts     # 提示词向导数据
│   ├── prompt-guide-processor.ts # 提示词处理逻辑
│   ├── vidprom-examples.ts      # VidProM优秀示例数据
│   └── vidprom-preset-options.ts # VidProM预制选项数据
├── models/                      # 数据模型
│   ├── Card.model.ts            # 卡片模型
│   ├── PromptHistory.model.ts   # 历史记录模型
│   ├── PromptTemplate.model.ts  # 模板模型
│   └── UserSettings.model.ts    # 用户设置模型
├── services/                    # 业务服务
│   ├── ai-service.ts            # AI服务
│   ├── config-service.ts        # 配置服务
│   └── evaluation-service.ts    # 评估服务
├── stores/                      # 状态管理
│   ├── card.store.ts            # 卡片状态管理
│   ├── preset.store.ts          # 预制库状态管理
│   └── example.store.ts         # 示例数据状态管理
├── styles/                      # 全局样式
│   └── global.css               # Claude设计规范样式
├── utils/                       # 工具函数
│   ├── promptParser.ts          # 提示词解析
│   ├── promptScorer.ts          # 评分工具
│   ├── storage.ts               # 存储工具
│   └── variantGenerator.ts      # 变体生成器
├── App.tsx                      # 主应用组件
└── main.tsx                     # 应用入口
```

---
## 七、当前开发状态总结
### 7.1 整体完成度
✅ **项目状态：开发完成**
- **功能实现度**：100% - 所有核心功能已实现
- **代码质量**：TypeScript强类型，完整的类型定义
- **构建状态**：✅ 生产构建成功完成
- **设计规范**：✅ 完全符合Claude设计规范
- **技术栈**：React 18 + TypeScript + Vite + Tailwind CSS

### 7.2 已实现的关键功能
1. **Claude设计风格**：完整实现温暖色调、文学风格排版
2. **卡片组件系统**：双模式支持、30+预制内容库
3. **学习模式**：案例对比、展开过程可视化、学习路径
4. **创意模式**：类型导航、快速添加卡片、预制提示词选择、优秀示例展示
5. **Prompt 库管理**：分类管理、搜索筛选、CRUD操作、实时数量统计
6. **评估模式**：四维度评分、智能优化建议
7. **AI集成**：支持OpenAI、DeepSeek、通义千问、文心一言
8. **本地存储**：用户配置、学习进度、卡片数据持久化

### 7.3 技术亮点
- **模块化架构**：清晰的功能划分，便于维护和扩展
- **类型安全**：完整的TypeScript类型定义
- **轻量级状态管理**：使用Zustand替代Redux，性能更优
- **响应式设计**：适配移动端和桌面端
- **开发工具链**：Husky + Lint-staged + ESLint + Prettier
- **高效的页面切换**：无刷新页面切换，提升用户体验
- **实时数据更新**：分类数量统计和筛选结果实时更新

---
## 八、代码与数据库位置记录

### 8.1 VidProM 数据集处理代码位置

#### 数据处理脚本
- **下载脚本**：`f:\.workSpace\IICL-CardInterface\Prompt Guide\VidProM（百万用户真实提示词）\download_dataset.py`
- **处理脚本**：`f:\.workSpace\IICL-CardInterface\Prompt Guide\VidProM（百万用户真实提示词）\process_dataset_fixed.py`
- **重新生成脚本**：`f:\.workSpace\IICL-CardInterface\Prompt Guide\VidProM（百万用户真实提示词）\regenerate_preset_options2.py`

#### 原始数据存储
- **数据集**：`f:\.workSpace\IICL-CardInterface\Prompt Guide\VidProM（百万用户真实提示词）\`

#### 处理后的数据
- **优秀示例 JSON**：`f:\.workSpace\IICL-CardInterface\Prompt Guide\VidProM（百万用户真实提示词）\processed_data\excellent_examples.json`
- **预制选项 JSON**：`f:\.workSpace\IICL-CardInterface\Prompt Guide\VidProM（百万用户真实提示词）\processed_data\preset_options.json`

### 8.2 PromptCard 应用程序代码位置

#### 核心代码文件
- **提示词处理逻辑**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\prompt-guide-processor.ts`
- **知识库数据**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\prompt-guide-data.ts`
- **VidProM 示例数据**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\vidprom-examples.ts`
- **VidProM 预制选项**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\vidprom-preset-options.ts`
- **预制库管理**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\stores\preset.store.ts`

#### 项目配置文件
- **依赖配置**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\package.json`
- **Vite 配置**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\vite.config.ts`

---
## 九、数据集成验证

### ✅ 已正确复制的数据文件

#### 1. VidProM 优秀示例库
- **文件位置**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\vidprom-examples.ts`
- **内容**：包含 633 条高质量提示词示例
- **格式**：TypeScript 导出文件，包含完整的类型定义
- **集成方式**：通过 `prompt-guide-processor.ts` 中的 `searchSimilarExamples` 函数调用

#### 2. VidProM 预制选项库
- **文件位置**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\vidprom-preset-options.ts`
- **内容**：包含按要素分类的提示词选项
- **格式**：TypeScript 导出文件，符合 `PresetOption` 接口
- **集成方式**：通过 `preset.store.ts` 加载到应用程序中

### ✅ 代码集成验证

#### 3. 提示词处理逻辑
- **文件**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\knowledge\prompt-guide-processor.ts`
- **修改**：添加了 `VIDPROM_EXCELLENT_EXAMPLES` 导入
- **功能**：在 `searchSimilarExamples` 函数中合并官方示例和 VidProM 示例

#### 4. 预制库管理
- **文件**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\stores\preset.store.ts`
- **修改**：添加了 `VIDPROM_PRESET_OPTIONS` 导入
- **功能**：在 `init` 方法中加载 VidProM 预制选项

#### 5. 示例数据状态管理
- **文件**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\stores\example.store.ts`
- **功能**：管理 VidProM 优秀示例数据的状态和查询
- **方法**：`init()` 初始化数据，`getByType()` 按类型筛选示例

#### 6. 创意模式组件
- **文件**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\components\CreativeMode.tsx`
- **功能**：提供预制提示词选择和示例展示功能
- **特性**：类型选择、预制提示词选择器、示例窗口

#### 7. 主应用组件集成
- **文件**：`f:\.workSpace\IICL-CardInterface\promptcard-v4.2\src\App.tsx`
- **修改**：添加了 `useExampleStore` 导入和 `initExamples()` 调用
- **功能**：确保应用启动时同时初始化预制数据和示例数据

---
## 十、验收标准
✅ **所有验收标准已达标**

### 10.1 功能验收标准
1. **功能完整度**：100%符合需求文档要求，所有核心功能已实现
2. **Prompt 库功能**：分类筛选、搜索、CRUD操作、页面切换等功能正常
3. **数据一致性**：Prompt 库数据与首页 PromptCard 数据完全对应
4. **实时更新**：分类数量统计、搜索结果等数据实时更新
5. **用户体验**：页面切换流畅，操作反馈及时

### 10.2 技术验收标准
6. **界面风格**：完全符合Claude设计规范，响应式设计良好
7. **数据加载**：所有本地数据加载正常，无报错
8. **构建状态**：生产构建成功，无任何错误
9. **代码质量**：强类型代码，符合现代前端开发规范
10. **性能优化**：页面加载速度快，无内存泄漏
