# 开发进度交接

- 主代理派发子任务时，在任务说明中引用 [项目规范](PROJECT_SPEC.md) 和 [进度交接](PROGRESS.md)，并要求子代理在交付前更新进度。
- 每个子代理在开始前阅读这两份文件，根据最新交接掌握已完成事项、未完成事项和依赖。按项目规范和本次子任务的范围开展工作。
- 子任务结束时，子代理须亲自在 `docs/PROGRESS.md` 追加一条交接记录，然后再汇报结果。完成、部分完成和受阻都需要记录。并行子任务由主代理协调依次写入，各子代理写入前重新读取最新内容，保留其他任务的记录。

# **一、最终产品**

24 小时 MVP

# **InvestEval**

**投资 Agent 回答质量评测平台**

一个面向投资产品团队的质量评测与治理工具，用于发现、定位和改善投资 Agent 的回答问题。

**核心价值**

- 让投资 Agent 的回答质量可以量化。

- 让错误回答可以定位到具体原因。

- 让不同模型和 Prompt 的表现可以比较。

- 让个性化回答不改变客观事实。


这里有一个重要的产品定位：

你的平台不是投资 Agent 本身，而是投资 Agent 的质量监控和评测系统。

因此，不需要实现股票分析、投资组合管理、交易执行等功能。也不需要自己训练模型。

## **1.1 最终功能范围**

我建议分成三个优先级。

### **P0：必须实现**

|功能|最小实现方式|
|---|---|
|问答数据集|预置 24 条模拟投资问答|
|自动评测|规则引擎 + LLM Judge|
|质量评分|五个维度的评分|
|数据核验|展示原始数据、来源、时间|
|Bad Case 分析|自动分类错误原因|
|版本对比|对比模型、Prompt、数据集版本|
|人工复核|通过、驳回、添加备注|
|用户反馈|有帮助 / 无帮助|
|个性化治理|比较不同用户画像下的客观事实|
|合规治理|检查违规建议和隐私泄露|

### **P1：有时间再做**

- JSON 文件导入。

- 评测记录搜索和筛选。

- 质量趋势图。

- 导出评测报告。

- 评测任务历史记录。


### **P2：直接放弃**

以下功能不建议在这 24 小时内实现：

- 完整的多 Agent 协作系统。

- 用户注册、登录和权限管理。

- 完整的 Supabase 数据库设计。

- 真实 KYC 系统。

- 实时金融数据 MCP 全量接入。

- 自动生成投资建议。

- 模型训练和微调。

- 复杂的多轮对话管理。

- 复杂的图表和数据分析。


特别注意，第三题允许使用匿名问答日志和 KYC 样例。因此，完全可以使用构造数据完成主要演示，不需要接触真实用户隐私。

候选人附件_投资Agent回答质量与个性化治理平台.md

**关于金融数据：** 我建议预置一批带有来源、时间戳和字段值的核验样例。如果扶摇或 iFinD MCP 已经可以正常调用，再增加一个真实数据核验案例。不要让外部 API 的接入成为整个项目的前置条件。所有模拟数据必须明确标注为示例数据，不能伪装成实时行情。

# **二、技术架构**

## **2.1 技术栈**

考虑到你已经有 CodePilot 的开发经验，我建议沿用熟悉的技术栈，而不是重新学习一套框架。

|层次|技术|用途|
|---|---|---|
|前端|Next.js 14|页面和路由|
|语言|TypeScript|类型约束|
|UI|Tailwind CSS|页面样式|
|图表|简单 CSS 图表|评分分布、问题分布|
|后端|Next.js Route Handler|评测 API|
|AI|Kimi K3 或其他 OpenAI-compatible 模型|LLM Judge|
|数据|JSON + localStorage|样例数据和状态保存|
|部署|Vercel|Web 产品上线|
|版本管理|GitHub|源代码仓库|

这里我刻意不使用 Supabase。

原因是这次不需要复杂的多用户数据管理。使用 JSON 保存初始样例，使用 localStorage 保存评测结果、人工复核状态和反馈，就足够完成单用户演示。

如果以后做正式产品，再迁移到 PostgreSQL。

## **2.2 系统架构**

**前端 Web Dashboard**

总览 / 问答评测 / Bad Case / 版本对比

**Next.js API 层**

**Rule Engine**

规则检测

**LLM Judge**

语义评测

**Scoring & Bad Case Analyzer**

综合评分、错误归因

**JSON 数据集**

问答、证据、画像

**localStorage**

评测、复核、反馈

各模块职责必须明确：

|模块|负责什么|不负责什么|
|---|---|---|
|Rule Engine|数字、时间、来源、合规关键词|复杂语义理解|
|LLM Judge|相关性、完整性、表达、语义风险|独立认定金融事实|
|数据核验|对照原始证据|自行编造缺失数据|
|人工复核|判断争议结果、确认错误原因|替代所有自动评测|

这是产品的一个重要设计亮点。不能把所有事情都交给 LLM，否则评审很可能会质疑评测结果是否可靠。

## **2.3 推荐目录结构**

```
invest-eval/
├── app/
│   ├── page.tsx
│   ├── cases/
│   │   └── page.tsx
│   ├── cases/[id]/
│   │   └── page.tsx
│   ├── comparison/
│   │   └── page.tsx
│   └── api/
│       └── evaluate/
│           └── route.ts
│
├── components/
│   ├── Sidebar.tsx
│   ├── MetricCard.tsx
│   ├── ScoreBadge.tsx
│   ├── CaseTable.tsx
│   └── EvidencePanel.tsx
│
├── lib/
│   ├── evaluator/
│   │   ├── rule-engine.ts
│   │   ├── llm-judge.ts
│   │   ├── scoring.ts
│   │   └── bad-case.ts
│   ├── storage.ts
│   └── types.ts
│
├── data/
│   ├── demo-cases.json
│   ├── demo-results.json
│   └── demo-versions.json
│
├── docs/
│   ├── README.md
│   ├── TESTING.md
│   └── AI_USAGE.md
│
└── .env.local
```

不要为了目录结构而过度拆分文件。这个结构只是建议，实际以 AI Coding 工具生成的项目为准。

# **三、评测指标设计**

这是整个产品最重要的部分。建议不要使用一个笼统的 AI 质量分数，而是建立五个评测维度。

## **3.1 五个核心指标**

|维度|权重|评测方式|
|---|---|---|
|回答相关性|20%|LLM Judge|
|事实准确性|25%|原始证据对照|
|时效性|15%|时间戳和时效规则|
|个性化一致性|15%|不同画像的对照测试|
|合规与隐私|25%|确定性规则 + LLM|

综合评分：

\[ S=0.2R+0.25F+0.15T+0.15P+0.25C \]

其中各项得分均为 0～100。

但需要增加一个规则：**如果出现严重合规违规或隐私泄露，即使总分很高，也必须标记为高风险，不能判定为通过。**

### **各指标具体怎么做？**

**1. 回答相关性**

例如：

用户问：最近某基金的表现如何？

Agent 回答：该基金适合长期持有，建议关注其风险。

这可能没有真正回答用户的问题。

由 LLM Judge 根据问题、回答和预设评分标准打分。

**2. 事实准确性**

例如：

**原始数据证据**

某基金净值

**1.2500**

数据日期

**2026-11-13**

数据来源

**示例数据源**

**Agent 回答**

该基金最新净值为 1.2800。

数据不一致

这里的数值仅用于演示核验逻辑。

重点不是让另一个 LLM 判断数字是否正确，而是把回答中的数字与已有证据进行对照。

**3. 时效性**

例如：

- 行情数据更新时间：11 月 10 日。

- Agent 回答时间：11 月 16 日。

- 用户问的是最新行情。


应该识别数据过期，而不是因为数字本身没有错误就判定通过。

注意，不同数据有不同的有效期限。历史财务数据不能简单套用行情数据的时效规则。

**4. 个性化一致性**

这是我认为最值得重点展示的功能。

假设同一个问题分别交给两个不同用户画像：

|属性|用户 A|用户 B|
|---|---|---|
|风险偏好|激进|保守|
|投资期限|长期|短期|
|投资经验|丰富|初级|

两人的回答可以在表达方式、风险提示、解释深度上有所不同。

但是，底层客观事实必须保持一致。

可以设计一个对照测试：

- 两份回答引用相同的基金净值。

- 两份回答使用相同的财务数据。

- 两份回答对风险的客观描述一致。

- 只允许建议的解释方式和个性化内容发生变化。


如果用户画像导致客观事实改变，就标记为 Personalization Drift。

**5. 合规与隐私**

先实现简单的规则检测：

- 是否承诺确定收益。

- 是否使用绝对化投资表述。

- 是否直接给出不合规的买卖指令。

- 是否泄露用户个人信息。

- 是否将 KYC 信息不必要地暴露在回答中。


再由 LLM 检查语义层面的风险。

## **3.2 Bad Case 分类**

所有错误统一归入以下六类：

|类型|示例|
|---|---|
|答非所问|没有回答用户的问题|
|事实错误|数字、单位、事实错误|
|时效过期|使用过期行情或热点|
|个性化失真|用户画像改变客观事实|
|合规违规|保证收益、违规建议|
|隐私泄露|输出不应暴露的 KYC 信息|

每个 Bad Case 至少展示：

- 错误类型。

- 具体错误内容。

- 原始证据。

- 错误原因。

- 建议修复方向。


不要在 24 小时内开发复杂的自动修复功能。能够准确定位问题就足够了。

# **四、页面设计**

我建议只做四个页面，不要增加不必要的导航。

## **页面 1：总览 Dashboard**

[Cynsta – AI Governance Evidence Platform](https://images.openai.com/static-rsc-4/EoGAPhEniqTgbNBWf5lp5EEj1stymUQVzgWQ4yx2amLbFAuHzoUlalcZ34daA8QQ8zit3ia-JXxwU23N8WKTPf9QJpbFhRRDbE1lWa4Wm64oAKdW2k2V0GTn8emOhyASxg94Iw_RDTS7RcNzQXk24JTM1w35iymm7heJmcNkctU?purpose=inline)

[cynsta.com](https://www.cynsta.com/?utm_source=chatgpt.com)

展示四个核心数字：

- 已评测问答数量。

- 平均质量分数。

- 高风险问题数量。

- 待人工复核数量。


下面放两个图表：

1. 五个维度的平均得分。

2. Bad Case 类型分布。


底部展示最近评测记录。

这个页面的目的就是让评审一打开产品，就知道它在做什么。

## **页面 2：问答评测中心**

[Technology | Inside the Barnabus Architecture](https://images.openai.com/static-rsc-4/CZmNQAUY_JYlaCld3N1VEhn-9EYUnLY4eNlYvxUm0wBQxrBnpEIIdRyO9BrCEBxCy7KbXW07caB_z_pomAuuIwn5__uX_UxlgQeO7wqwc-6ifAkzp1hS1tzreLB8ImnhapEbwmhNbc9lG6RN-3AnMJ4UZykvz2nSrIe8xpzFlc4?purpose=inline)

[barnabus.ai](https://barnabus.ai/technology?utm_source=chatgpt.com)

这是主要操作页面。

表格字段：

|字段|内容|
|---|---|
|Case ID|样例编号|
|意图类型|行情、基金、解释等|
|问题|用户的问题|
|模型版本|Model A / B|
|Prompt 版本|V1 / V2|
|综合评分|0～100|
|评测结果|通过 / 警告 / 失败|
|操作|查看详情|

上方提供：

- 运行评测按钮。

- 按意图筛选。

- 按错误类型筛选。

- 按评测状态筛选。


点击某条记录进入详情。

## **页面 3：Bad Case 详情**

[How Snorkel AI Debugs Multi-Agent LLM Systems with Portkey Traces](https://images.openai.com/static-rsc-4/MYHNthOJTwcON9epcOBf7Nx0rgexQhuZz0gNUA_xXpHubigjs5ZuddhLTCztkObINixwfBs4_MP7fG8r7cXkqNW5cHRBHwVjBzfGNDLoGqevUIvooCBLty6oaU_dqz7lhLiwXusNdO_7sx_WuyMU5VdrIeatygE8RMwKUUL8N6c?purpose=inline)

[portkey.ai](https://portkey.ai/blog/how-snorkel-evaluates-and-trains-top-ai-models/?utm_source=chatgpt.com)

这是最值得花时间打磨的页面。

建议分为五个区域：

**A. 原始问答**

展示用户问题和 Agent 原始回答。

**B. 用户画像与热点上下文**

展示匿名 KYC 信息，例如风险偏好、投资期限、知识水平。

热点上下文展示新闻标题、来源、发布时间和有效期。

**C. 数据证据**

展示原始数据、Agent 引用的数据、数据来源和更新时间。

**D. 评测结果**

展示五项得分、具体问题和 Bad Case 分类。

**E. 人工复核与用户反馈**

提供三个操作：

- 确认问题。

- 驳回问题。

- 添加复核备注。


同时提供用户反馈：

- 有帮助。

- 无帮助。


注意，用户反馈只能作为质量分析的参考，不能直接作为事实正确性的判定依据。

## **页面 4：版本对比**

[LLM observability tools: Monitoring, debugging, and improving AI systems | by Dave Davies | Online Inference | Medium](https://images.openai.com/static-rsc-4/I_diAKaIC5hReOciUySV2K7hFrcMKrYpozbgjQI66K3UaOKXL-rZBmQgWQZW62r-KsPl8nSzfG4KyjHqGLv64mPpPvWtWPPIrvBXSaetFA8N1OlBJ71qeAYHt2_G4Bku-Tdz-7IrnYP3SCA0JVHFF6u_9xKkgxtIZgwvfvAdgCg?purpose=inline)

[medium.com](https://medium.com/online-inference/llm-observability-tools-monitoring-debugging-and-improving-ai-systems-5af769796266?utm_source=chatgpt.com)

这个页面展示：

- 模型版本 A 和 B 的平均评分。

- Prompt V1 和 V2 的平均评分。

- 不同版本的 Bad Case 数量。

- 五个维度的评分变化。


建议使用同一批 Case ID 进行配对比较，避免不同样本造成统计偏差。

版本比较不需要开发复杂的模型管理系统。预置两组样例评测结果即可。需要明确标注样例数据。后续如果有时间，可以增加实际调用模型进行重新评测的功能。

# **七、数据准备建议**

明确规定样例的组成，这样评测结果才有展示价值。

建议使用以下分布：

|问答类型|数量|主要测试内容|
|---|---|---|
|行情问答|5|数字、时间、来源|
|基金问答|5|净值、收益率、风险|
|财务解释|4|财务指标和单位|
|个性化问答|5|画像与事实一致性|
|合规问答|5|风险提示和隐私|
|**合计**|**24**||

其中至少准备：

- 12 条正常回答。

- 12 条包含不同问题的回答。

- 4 组可配对的个性化测试。

- 2 组不同版本的回答对比。


这只是样例设计目标，不要求每种错误类型的数量完全相同。

**一个重要细节：** 不要让所有 Bad Case 都是非常明显的错误。

例如，除了把净值 1.25 写成 1.28，还可以设计：

- 数字正确，但是使用了过期数据。

- 结论正确，但是没有引用数据来源。

- 回答相关，但是遗漏用户真正关心的风险。

- 用户风险偏好不同，Agent 却改变了客观事实。

- 回答本身合理，但使用了已经失效的热点新闻。


这些案例更能体现平台的实际价值。
