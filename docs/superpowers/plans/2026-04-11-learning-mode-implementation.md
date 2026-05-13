# 学习模式静态版本实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现学习模式静态版本，支持9种PromptCard类型的教学内容查看，用户可通过下拉选择器切换不同卡片的教学案例

**Architecture:** 
- 新增静态数据文件存储所有教学内容，与业务逻辑分离
- 学习模式页面添加顶部下拉选择器，动态渲染对应卡片的教学内容
- 复用现有页面结构（案例对比+学习要点+优化过程），仅替换内容数据

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand

---

### Task 1: 创建学习模式静态数据文件

**Files:**
- Create: `src/data/learningContent.ts`

- [ ] **Step 1: 创建数据文件并定义类型**

```typescript
export interface LearningStep {
  name: string;
  score: string;
  content: string;
}

export interface LearningContent {
  cardType: string;
  cardName: string;
  core: string;
  badExample: string;
  goodExample: string;
  points: string[];
  steps: LearningStep[];
}

export const LEARNING_CONTENT: LearningContent[] = [
  {
    cardType: "subject",
    cardName: "Subject（主体）",
    core: "如何描述清晰、具体的主体特征，避免模糊、笼统的指代",
    badExample: "一个人",
    goodExample: "穿运动服的年轻女性，背着皮质挎包，棕色凌乱头发扎成马尾，脸上有雀斑",
    points: [
      "明确身份属性：年龄、职业、穿着、外貌特征",
      "添加个性化细节：专属道具、标志性特征",
      "避免模糊指代：不用\"一个人\"、\"某物体\"这类泛称"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "一个人" },
      { name: "步骤2：添加身份特征", score: "30分", content: "年轻女性" },
      { name: "步骤3：补充细节描述", score: "60分", content: "穿运动服的年轻女性，背着皮质挎包" },
      { name: "步骤4：完善个性化特征", score: "100分", content: "穿运动服的年轻女性，背着皮质挎包，棕色凌乱头发扎成马尾，脸上有雀斑" }
    ]
  },
  {
    cardType: "action",
    cardName: "Action（动作）",
    core: "如何描述生动、具体的动作行为，包含情绪和细节",
    badExample: "在走路",
    goodExample: "推开巨大的丛林藤蔓，露出隐藏的路径，表情充满敬畏，手抚过断壁残垣上复杂的雕刻",
    points: [
      "细化动作过程：不是\"走路\"而是\"推开藤蔓向前走\"",
      "添加微表情/情绪：表情充满敬畏、疲惫地揉太阳穴",
      "描述动作细节：双臂有节奏摆动，呼吸均匀"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "在走路" },
      { name: "步骤2：添加动作内容", score: "30分", content: "推开丛林藤蔓走路" },
      { name: "步骤3：完善动作过程", score: "60分", content: "推开巨大的丛林藤蔓，露出隐藏的路径" },
      { name: "步骤4：添加情绪细节", score: "100分", content: "推开巨大的丛林藤蔓，露出隐藏的路径，表情充满敬畏，手抚过断壁残垣上复杂的雕刻" }
    ]
  },
  {
    cardType: "scene",
    cardName: "Scene（场景）",
    core: "如何构建完整、有氛围感的环境背景",
    badExample: "在山里",
    goodExample: "被雾气笼罩的巨大峡谷边缘，正值日出时分，古老的苔藓覆盖的遗迹，茂密的丛林",
    points: [
      "明确时间地点：清晨的公园、深夜的办公室、雨夜的公交车内",
      "添加环境元素：植被、建筑、天气、光影效果",
      "营造空间感：远景/中景/近景元素结合"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "在山里" },
      { name: "步骤2：明确具体地点", score: "30分", content: "在峡谷里" },
      { name: "步骤3：补充环境细节", score: "60分", content: "巨大的雾气弥漫的峡谷边缘，正值日出时分" },
      { name: "步骤4：完善场景元素", score: "100分", content: "巨大的雾气弥漫的峡谷边缘，正值日出时分，古老的苔藓覆盖的遗迹，周围是茂密的丛林" }
    ]
  },
  {
    cardType: "style",
    cardName: "Style（风格）",
    core: "如何定义清晰统一的美学风格和整体氛围",
    badExample: "好看的风格",
    goodExample: "史诗奇幻风格，80年代彩色胶片拍摄，轻微颗粒感，电影质感，冷蓝色忧郁色调",
    points: [
      "明确艺术风格：复古美学、赛博朋克、手绘动画、写实风",
      "添加质感描述：胶片颗粒感、磨砂质感、光影效果",
      "定义整体情绪：忧郁、热血、宁静、悬疑"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "好看的风格" },
      { name: "步骤2：明确风格类型", score: "30分", content: "电影质感风格" },
      { name: "步骤3：补充质感细节", score: "60分", content: "80年代彩色胶片拍摄，轻微颗粒感，电影质感" },
      { name: "步骤4：完善氛围定义", score: "100分", content: "史诗奇幻风格，80年代彩色胶片拍摄，轻微颗粒感，电影质感，冷蓝色忧郁色调" }
    ]
  },
  {
    cardType: "camera",
    cardName: "Camera（镜头）",
    core: "如何使用专业镜头语言精确控制画面呈现",
    badExample: "拍一下这个人",
    goodExample: "极浅景深特写，升降镜头从低角度向上拉升，第一人称视角跟拍，180度弧线环绕运动",
    points: [
      "镜头运动：推轨、跟拍、升降、航拍、慢摇、POV视角",
      "构图选择：广角、特写、极端特写、低角度、双人镜头",
      "对焦设置：浅景深、柔焦、微距、深景深"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "拍一下这个人" },
      { name: "步骤2：明确构图方式", score: "30分", content: "特写拍摄这个人" },
      { name: "步骤3：补充镜头参数", score: "60分", content: "极浅景深特写拍摄这个人的脸" },
      { name: "步骤4：完善镜头语言", score: "100分", content: "极浅景深特写，年轻女性的脸，望着车窗外流动的城市灯光，玻璃上隐约可见她的倒影" }
    ]
  },
  {
    cardType: "audio",
    cardName: "Audio（音频）",
    core: "如何设计完整的音频方案，包含对话、音效、环境音",
    badExample: "有声音",
    goodExample: "女人说：\"我们现在必须走了。\" SFX：远处雷声轰鸣。环境音：星舰桥的轻微嗡鸣，轻柔管弦乐渐强",
    points: [
      "对话写法：用引号标注具体台词 `A says: \"xxx\"`",
      "音效写法：`SFX: 雷声轰鸣、树叶沙沙声`",
      "环境音写法：`Ambient noise: 星舰桥的轻微嗡鸣`"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "有声音" },
      { name: "步骤2：添加基础音频", score: "30分", content: "有对话和雷声" },
      { name: "步骤3：完善音频写法", score: "60分", content: "女人说：\"我们现在必须走了。\" SFX：远处雷声轰鸣" },
      { name: "步骤4：完整音频方案", score: "100分", content: "女人说：\"我们现在必须走了。\" SFX：远处雷声轰鸣。环境音：星舰桥的轻微嗡鸣，轻柔管弦乐渐强" }
    ]
  },
  {
    cardType: "lighting",
    cardName: "Lighting（灯光）",
    core: "如何通过灯光设计营造氛围、突出主体",
    badExample: "灯亮着",
    goodExample: "场景被头顶刺眼的荧光灯和单色显示器的绿色光芒点亮，柔和的晨光照亮整个峡谷，单束聚光灯从正面打在歌手身上",
    points: [
      "光源类型：荧光灯、自然光、聚光灯、霓虹灯、烛光",
      "光线效果：刺眼、柔和、冷暖色调、光晕、阴影",
      "光照方向：顶光、侧光、逆光、正面光"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "灯亮着" },
      { name: "步骤2：明确场景灯光", score: "30分", content: "办公室里有灯亮着" },
      { name: "步骤3：补充灯光细节", score: "60分", content: "深夜办公室里，荧光灯和显示器绿光亮着" },
      { name: "步骤4：完善灯光设计", score: "100分", content: "深夜杂乱的办公室，场景被头顶刺眼的荧光灯和单色显示器的绿色光芒点亮" }
    ]
  },
  {
    cardType: "timing",
    cardName: "Timing（时序）",
    core: "如何使用时间戳分段控制多镜头视频节奏",
    badExample: "拍一个探险视频",
    goodExample: "[00:00-00:02] 后背中景，探险家推开藤蔓\n[00:02-00:04] 反打镜头，探险家表情震惊看着遗迹\n[00:04-00:06] 跟拍镜头，探险家走入空地抚摸雕刻\n[00:06-00:08] 广角升降镜头，展现整个神庙建筑群",
    points: [
      "时间格式：`[HH:MM:SS-HH:MM:SS]` 分段标记",
      "镜头切换：每个时间段对应一个独立镜头",
      "节奏控制：根据内容调整每个镜头的时长"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "拍一个探险视频" },
      { name: "步骤2：明确时长结构", score: "30分", content: "拍8秒的探险视频，分4个镜头" },
      { name: "步骤3：初步分段标注", score: "60分", content: "[0-2秒]拍后背，[2-4秒]拍脸部，[4-6秒]拍走路，[6-8秒]拍全景" },
      { name: "步骤4：完整时间戳方案", score: "100分", content: "[00:00-00:02] 后背中景，探险家推开藤蔓\n[00:02-00:04] 反打镜头，探险家表情震惊看着遗迹\n[00:04-00:06] 跟拍镜头，探险家走入空地抚摸雕刻\n[00:06-00:08] 广角升降镜头，展现整个神庙建筑群" }
    ]
  },
  {
    cardType: "constraint",
    cardName: "Constraint（约束）",
    core: "如何使用负面提示词排除不需要的内容，精准控制生成结果",
    badExample: "不要奇怪的东西",
    goodExample: "荒凉的景观，没有建筑物或道路，禁止出现AI畸形手，人物一致性优化开启，16:9宽屏，分辨率1080P，高细节度，低变形",
    points: [
      "正向描述排除内容：用\"没有建筑物或道路\"代替\"不要人造结构\"",
      "技术参数约束：分辨率、比例、质量要求",
      "质量控制：禁用畸形、低质、变形等常见问题"
    ],
    steps: [
      { name: "步骤1：基础描述", score: "10分", content: "不要奇怪的东西" },
      { name: "步骤2：明确排除内容", score: "30分", content: "不要人造建筑，保持人物正常" },
      { name: "步骤3：完善排除描述", score: "60分", content: "荒凉的景观，没有建筑物或道路，禁止出现AI畸形手" },
      { name: "步骤4：完整约束方案", score: "100分", content: "荒凉的景观，没有建筑物或道路，禁止出现AI畸形手，人物一致性优化开启，16:9宽屏，分辨率1080P，高细节度，低变形" }
    ]
  }
];
```

- [ ] **Step 2: 确认文件路径正确，类型定义完整**

Run: `ls src/data/learningContent.ts`
Expected: 文件存在，无语法错误

- [ ] **Step 3: Commit**

```bash
git add src/data/learningContent.ts
git commit -m "feat: add learning mode static content data"
```

---

### Task 2: 修改学习模式页面，添加下拉选择器和动态渲染逻辑

**Files:**
- Modify: `src/App.tsx`
- Import: `src/data/learningContent.ts`

- [ ] **Step 1: 导入数据并添加状态管理**

在App.tsx顶部导入：
```typescript
import { LEARNING_CONTENT } from './data/learningContent';
```

在函数组件内添加状态：
```typescript
const [selectedLearningCard, setSelectedLearningCard] = useState(LEARNING_CONTENT[0]);
```

- [ ] **Step 2: 在学习模式区域添加顶部下拉选择器**

找到学习模式区域的标题`案例对比学习`上方，添加：
```tsx
<div className="mb-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">选择要学习的卡片类型</label>
  <select
    value={selectedLearningCard.cardType}
    onChange={(e) => {
      const content = LEARNING_CONTENT.find(c => c.cardType === e.target.value);
      if (content) setSelectedLearningCard(content);
    }}
    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
  >
    {LEARNING_CONTENT.map(card => (
      <option key={card.cardType} value={card.cardType}>
        {card.cardName} - {card.core}
      </option>
    ))}
  </select>
  <p className="mt-2 text-sm text-blue-600 font-medium">{selectedLearningCard.core}</p>
</div>
```

- [ ] **Step 3: 修改案例对比区域为动态内容**

替换原来的静态案例对比内容：
```tsx
<div className="flex gap-4 mb-3">
  <div className="flex-1">
    <div className="flex items-center gap-2 mb-2">
      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">反面示例</span>
      <span className="text-xs text-gray-500">简单描述</span>
    </div>
    <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-gray-700 whitespace-pre-line">
      {selectedLearningCard.badExample}
    </div>
  </div>
  <div className="flex-1">
    <div className="flex items-center gap-2 mb-2">
      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">正面示例</span>
      <span className="text-xs text-gray-500">丰富细节</span>
    </div>
    <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-gray-700 whitespace-pre-line">
      {selectedLearningCard.goodExample}
    </div>
  </div>
</div>
```

- [ ] **Step 4: 修改学习要点区域为动态内容**

替换原来的静态学习要点：
```tsx
<div className="p-3 bg-blue-50 border border-blue-100 rounded-lg mb-6">
  <div className="text-sm font-medium text-blue-800 mb-2">学习要点：</div>
  <ul className="text-sm text-blue-700 space-y-1">
    {selectedLearningCard.points.map((point, idx) => (
      <li key={idx}>• {point}</li>
    ))}
  </ul>
</div>
```

- [ ] **Step 5: 修改优化过程演示区域为动态内容**

替换原来的静态步骤内容：
```tsx
<div className="space-y-3">
  {selectedLearningCard.steps.map((step, idx) => (
    <div 
      key={idx}
      className={`p-3 rounded-lg border ${idx === selectedLearningCard.steps.length - 1 
        ? 'bg-blue-50 border-blue-200' 
        : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium ${idx === selectedLearningCard.steps.length - 1 ? 'text-blue-700' : 'text-gray-600'}`}>
          {step.name}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs ${idx === selectedLearningCard.steps.length - 1 ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
          {step.score}
        </span>
      </div>
      <p className={`text-sm ${idx === selectedLearningCard.steps.length - 1 ? 'text-blue-800' : 'text-gray-700'} whitespace-pre-line`}>
        {step.content}
      </p>
    </div>
  ))}
</div>
```

- [ ] **Step 6: 检查代码语法，确认没有错误**

Run: `npm run type-check`
Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: implement learning mode dynamic content rendering"
```

---

### Task 3: 测试学习模式功能

**Files:**
- Test: 浏览器页面功能测试

- [ ] **Step 1: 确认开发服务器正在运行**

Run: `curl http://localhost:3000`
Expected: 页面正常返回

- [ ] **Step 2: 测试功能点**
  - [ ] 页面加载后默认展示Subject卡片的教学内容
  - [ ] 下拉选择其他卡片类型，内容正常切换
  - [ ] 反面示例/正面示例/学习要点/优化过程与选中卡片对应
  - [ ] 多行内容（如时序、音频）正常换行展示
  - [ ] 页面样式与原有设计一致，无布局错乱

- [ ] **Step 3: 确认所有功能正常，提交最终commit**

```bash
git commit -m "feat: learning mode static version complete"
```

---
## 验收标准
✅ 9种卡片类型教学内容完整准确，与设计文档一致
✅ 下拉选择器功能正常，内容切换流畅
✅ 页面样式美观，与整体UI风格统一
✅ 无控制台错误，无功能异常
