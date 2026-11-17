# InvestEval · 投资 Agent 回答质量评测平台

[打开线上演示](https://invest-eval.vercel.app) · [演示视频（2 分 02 秒）](docs/InvestEval-demo.mp4) · [查看测试与验收记录](docs/TESTING.md)

投资 Agent 的回答可能遗漏问题要点、引用错误或过期的金融数据，也可能因用户画像而改变客观事实。InvestEval 帮助投资产品经理、模型与 Prompt 开发者、质量及合规复核人员发现、定位和比较这些问题。平台不生成投资建议，也不执行交易。

## 核心功能

- **评测总览与问答中心：** 搜索和筛选模拟问答，一次运行 1–5 条，查看质量分数、风险与运行进度。
- **证据核验与归因：** 五个维度分别评估相关性、事实、时效、个性化一致性、合规与隐私；详情保留证据来源、时间、对照值、判断理由和修复方向。缺失证据标为待核验，严重合规或隐私发现独立判为高风险失败。
- **人工复核与用户反馈：** 确认或驳回问题并保存备注。「有帮助／无帮助」按回答保存最新一票。复核绑定评测结果，新运行有独立的复核状态。
- **版本比较：** 按 Case ID 和画像配对比较模型、Prompt 和数据集。可切换预置结果与实时结果；实时对比要求两侧均有结果且 Judge 口径一致。

## 技术架构与 AI 职责

页面使用 Next.js App Router、React、TypeScript 和 Tailwind CSS。`POST /api/evaluate` 在服务端读取模拟样例，先运行确定性规则，再按配置调用 LLM Judge。总览、列表、详情和版本对比共享浏览器工作区；最近一次评测、复核及反馈存入 `localStorage`。

规则引擎用结构化声明、模拟原始证据及回答时间核验数字、单位、时效和同证据画像对照，并检测常见合规和隐私信号，包括主动披露非必要的画像属性。24 条基准问答及其 14 条变体都有逐题评分要点。LLM Judge 使用对应意图的标准和逐题要点评估相关性、完整性、个性化表达与语义风险。规则确定五维综合分，语义分和辅助归因独立显示。Judge 缺少配置、超时或失败时，界面标记评测不完整并保留规则结果。

## 本地启动

使用 Node.js 26.x（本次验证为 26.13.1）及 npm 12.2.2。

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。在问答评测中心勾选 `IE-020` 和 `IE-012`，点击「运行评测」。打开 `IE-012` 对照回答中的 1.2800 元与证据中的 1.2500 元，然后保存复核备注和用户反馈。也可运行 `IE-024` 查看高风险合规规则。

```sh
npm run build
npm run start
```

生产构建保持 Next.js 服务端路由，不能只上传静态 HTML。Vercel 使用 Next.js 预设和 Node.js 26.x，参见 [Vercel Node.js 26 支持说明](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel)。

## 环境变量

将 [`.env.example`](.env.example) 复制为 `.env.local` 并填入自己的配置，然后重启服务。Vercel 部署时通过项目的服务端环境变量设置配置，更新后重新部署。

| 变量 | 用途 |
| --- | --- |
| `LLM_BASE_URL` | OpenAI-compatible API 基础地址，包含版本路径且省略 `/chat/completions`；例如 `https://api.openai.com/v1`。 |
| `LLM_MODEL` | 服务商提供的模型标识，需支持 Chat Completions JSON 模式。 |
| `LLM_API_KEY` | 服务端密钥。留空时只运行规则，引导用户查看不完整状态。 |
| `LLM_AUTH_MODE` | 设为 `vercel-oidc` 时，使用 Vercel AI Gateway 和服务端 OIDC，仍由 `LLM_MODEL` 指定模型。 |

密钥由服务端读取。线上演示的接口只接受固定样例 ID，AI Gateway 模式对同一模型、提示词和输入复用已校验的成功结果。详情展示模型及生成时间，每次运行仍重新计算规则。Gateway 项目预算耗尽或上游不可用时，页面保留本次规则结果。 [Vercel AI Gateway 认证](https://vercel.com/docs/ai-gateway/authentication-and-byok)

截至 2026-11-17，公开站已配置 GPT-4.1 mini Judge，网关仍要求完成账户验证。访客可以执行规则、复核、反馈和版本对比。错误码和本地 Judge 复验方法见 [测试说明](docs/TESTING.md)。

接口接受 `answerId` 或 `answerIds`（批量最多 5 条）。例如在 PowerShell 执行：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/evaluate -Method Post -ContentType 'application/json' -Body '{"answerIds":["IE-020","IE-024"]}'
```

## 数据来源与限制

`data/` 存放 24 条基准问答和 14 条变体、四组匿名画像对照、模拟证据和预置评分。金融标的、报价、来源名称、热点和个人标识均为虚构样例。金融时效按样例的**回答时间**判断。预置分数用于展示，实时结果为本次运行的规则分。问答外发前遮盖规则可识别的个人标识；浏览器会收到原始模拟数据，当前版本不适合录入真实个人或客户资料。

规则依赖样例标注的客观声明与相关性要点，无法覆盖所有自由文本、金融语义或隐私格式。LLM 的语义评分和理由可能波动，争议结果须人工复核。工作区依赖同一浏览器与站点，清除站点数据或换设备后不会自动恢复。

尚未实现真实金融数据源（含扶摇／iFinD MCP）、数据集导入与报告导出、评测历史与趋势、多用户登录和权限、共享数据库及审计日志。

[测试说明](docs/TESTING.md) · [AI 使用记录](docs/AI_USAGE.md) · [项目规范](docs/PROJECT_SPEC.md)
