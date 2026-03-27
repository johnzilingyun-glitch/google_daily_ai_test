import { GoogleGenAI } from "@google/genai";
import { createAI, withRetry, parseJsonResponse, generateContentWithUsage, GEMINI_MODEL } from "./geminiService";
import { StockAnalysis, AgentMessage, Scenario, AgentDiscussion, GeminiConfig } from "../types";

export async function startAgentDiscussion(
  analysis: StockAnalysis, 
  config?: GeminiConfig, 
  history?: AgentMessage[]
): Promise<AgentDiscussion> {
  const ai = createAI(config);
  const historyContext = history ? `\n\n**PREVIOUS DISCUSSION HISTORY**:\n${JSON.stringify(history)}` : "";
  const prompt = `
    你是一支由8位顶级金融分析精英组成的专家团队，正在召开高规格联席研讨会议，对以下股票进行机构级深度研讨。
    这不是一份普通分析报告，而是一场真实的、多轮的、有激烈辩论和数据交锋的专业级研讨会议。

    **团队成员（8位，按发言顺序）**：
    1. **深度研究专家 (Deep Research Specialist)**：第一个发言，负责全维度数据穿透调研。必须提供：
       - 实时财务指标与业绩偏离度表格（EPS/PE/PB/ROE/股息率等，含市场预期与实际偏差）
       - 宏观监控与商品成本锚点（原材料价格、大宗商品、行业指数等实时数据）
       - 预期偏差识别（Expectation Gap）：市场共识 vs 实际数据的差异，Alpha来源
       - 语义搜索与市场情绪评分（雪球/东方财富/X 等平台情绪监测）
       - 核心预测与置信区间表格
       - 内容必须包含至少2个Markdown表格，数据要有时间戳和来源标注
    
    2. **技术分析师 (Technical Analyst)**：负责技术面深度分析。必须提供：
       - 趋势定性（主升浪/调整浪/下跌通道，引用具体价位和涨幅数据）
       - 量化关键价位（支撑位/阻力位，精确到小数点后两位，附计算逻辑如黄金分割、均线等）
       - MACD/RSI/成交量等技术指标的具体数值和信号判读
       - H股/跨市场联动分析（如适用）
       - 明确的3-6个月价格预测和操作建议
    
    3. **基本面分析师 (Fundamental Analyst)**：负责基本面价值分析。必须提供：
       - 估值逻辑拆解（当前PE/PB vs 行业均值 vs 历史分位）
       - 量化驱动因子（业绩惊喜概率、分红底线、行业数据等具体数字）
       - 对比法/DCF估值推导的目标价（附计算过程）
       - 对其他分析师观点的明确引用和回应（如"不同于技术分析师的XX论断，我认为..."）
    
    4. **情绪分析师 (Sentiment Analyst)**：负责市场情绪与资金面分析。必须提供：
       - 北向资金流向具体数据
       - 机构持仓变化（十大流通股东变化）
       - 社交媒体情绪评分和关键讨论主题
       - 融资融券余额变化趋势
    
    5. **风险合规官 (Risk Manager)**：负责极端风险场景分析。必须提供：
       - 明确的"黑天鹅"剧本和量化跌幅预期
       - 对牛方观点的直接反驳（必须指名道姓驳斥，如"基本面分析师所称的XX是过度乐观的"）
       - 核心量化风险指标和止损警示线
       - 悲观情境下的EPS下修预测和对应目标价
    
    6. **反向策略师 (Contrarian Strategist)**：负责挑战所有共识。必须提供：
       - "拥挤交易"风险分析
       - 对市场主流叙事的解构（指出哪些是"伪逻辑"）
       - 反向操作建议和目标价
       - 必须与牛方形成鲜明对立，提供具体的量化反驳
    
    7. **高级评审专家 (Professional Reviewer)**：负责逻辑审计与压力测试。必须提供：
       - 逻辑审计：识别前述所有分析师观点中最薄弱的环节
       - 预期差解释：Alpha来源的深度验证
       - 主动压力测试：如果基准假设失效的演化路径
       - SOTP（分类加总估值）矩阵表格（含业务板块、贡献利润、估值倍数、合理估值、逻辑支撑）
       - 审查官最终指令：策略修正和风险监控红线
    
    8. **首席策略师 (Chief Strategist)**：最后发言，负责综合结论。必须提供：
       - 综合所有分析师的核心观点
       - 明确的操作建议（买入/持有/卖出）
       - 具体的价格锚点和时间框架
       - 关键风险提示

    **分析标的数据**：${JSON.stringify(analysis)}
    ${historyContext}

    **研讨质量要求（严格执行，否则视为不合格）**：
    1. **数据密度**：每位分析师的 content 字段必须包含丰富的具体数据（价格、百分比、倍数、金额等），禁止空泛的定性描述。
    2. **Markdown格式**：content 字段必须使用 Markdown 格式（### 标题、表格、加粗、列表等），使内容结构清晰。
    3. **深度研究专家和高级评审专家** 的 content 字段必须各包含至少1个 Markdown 表格。
    4. **辩论交锋**：分析师之间必须有直接的引用和反驳（如"**反驳风险合规官**：你所提到的XX风险被过度放大了，实际数据显示..."）。
    5. **因果逻辑链**：每个结论必须附带完整的逻辑推导链条，不可直接给结论。
    6. **时间锚点**：所有数据必须标注数据时间点。
    7. **所有内容必须使用简体中文**。
    8. **首席策略师的 content 和 finalConclusion 字段必须包含明确可执行的操作建议**。

    仅返回 JSON，不要包含 markdown 代码块标记或任何 JSON 之外的文字。

    JSON 结构如下：
    {
      "messages": [
        { "role": "Deep Research Specialist", "content": "（使用 Markdown 格式的深度研究报告，含表格和量化数据）", "timestamp": "${new Date().toISOString()}", "type": "research" },
        { "role": "Technical Analyst", "content": "（技术面深度分析，含关键价位和预测）", "timestamp": "${new Date().toISOString()}", "type": "discussion" },
        { "role": "Fundamental Analyst", "content": "（基本面价值分析，含估值推导）", "timestamp": "${new Date().toISOString()}", "type": "discussion" },
        { "role": "Sentiment Analyst", "content": "（市场情绪与资金面分析）", "timestamp": "${new Date().toISOString()}", "type": "discussion" },
        { "role": "Risk Manager", "content": "（极端风险场景和量化止损分析，必须直接反驳牛方观点）", "timestamp": "${new Date().toISOString()}", "type": "discussion" },
        { "role": "Contrarian Strategist", "content": "（反向观点和共识解构，必须提供量化反驳）", "timestamp": "${new Date().toISOString()}", "type": "discussion" },
        { "role": "Professional Reviewer", "content": "（逻辑审计、压力测试和SOTP估值矩阵表格）", "timestamp": "${new Date().toISOString()}", "type": "review" },
        { "role": "Chief Strategist", "content": "（综合结论与明确操作建议）", "timestamp": "${new Date().toISOString()}", "type": "discussion" }
      ],
      "finalConclusion": "首席策略师的最终综合结论（必须提供）：包含明确的操作评级、目标价位区间、建仓策略和核心风险提示",
      "tradingPlan": {
        "entryPrice": "精确的建议买入价位或区间",
        "targetPrice": "精确的目标价位（含计算逻辑）",
        "stopLoss": "精确的止损价位（含逻辑）",
        "strategy": "详细的操作策略",
        "strategyRisks": "策略特定风险提示"
      },
      "scenarios": [
        { "case": "Bull", "probability": 30, "keyInputs": "乐观情境的关键假设（具体数据）", "targetPrice": "乐观目标价", "marginOfSafety": "安全边际", "expectedReturn": "预期回报率", "logic": "完整的逻辑推演链" },
        { "case": "Base", "probability": 50, "keyInputs": "基准情境的关键假设", "targetPrice": "基准目标价", "marginOfSafety": "安全边际", "expectedReturn": "预期回报率", "logic": "完整的逻辑推演链" },
        { "case": "Stress", "probability": 20, "keyInputs": "压力情境的关键假设", "targetPrice": "压力目标价", "marginOfSafety": "安全边际", "expectedReturn": "预期回报率", "logic": "压力测试的演化路径" }
      ],
      "sensitivityFactors": [
        { "factor": "影响因子（如原材料成本、利率、汇率等）", "change": "变动幅度", "impact": "对目标价的量化影响", "logic": "影响传导逻辑", "formula": "计算公式" }
      ],
      "expectationGap": {
        "marketConsensus": "市场当前的主流共识（含具体数据）",
        "ourView": "AI 团队的差异化观点",
        "gapReason": "偏差形成的深层原因和Alpha来源",
        "isSignificant": true,
        "confidenceScore": 75
      },
      "controversialPoints": ["研讨中的核心分歧点1（含正反方观点摘要）", "核心分歧点2"],
      "calculations": [
        { "formulaName": "估值模型名称（如DCF/SOTP/PEG等）", "inputs": { "参数名": "参数值" }, "output": "计算结果", "timestamp": "${new Date().toISOString()}" }
      ],
      "dataFreshnessStatus": "Fresh",
      "stressTestLogic": "完整的压力测试逻辑链：触发条件 → 传导路径 → 量化影响 → 下行目标位",
      "catalystList": [
        { "event": "催化事件描述", "probability": 60, "impact": "对股价的量化影响" }
      ],
      "verificationMetrics": [
        { "indicator": "可跟踪验证指标", "threshold": "判定阈值", "timeframe": "验证周期", "logic": "若达到/未达到阈值的操作指引" }
      ],
      "capitalFlow": {
        "northboundFlow": "北向资金流向的具体数据和趋势",
        "institutionalHoldings": "机构持仓变化的具体数据",
        "ahPremium": "AH 溢价率及趋势（如适用）",
        "marketSentiment": "综合情绪评分和来源"
      },
      "positionManagement": {
        "layeredEntry": ["第一层：xx-xx元 建仓 y% 仓位", "第二层：xx-xx元 加仓 y% 仓位", "第三层：xx元以下 满仓条件"],
        "sizingLogic": "仓位计算的量化逻辑",
        "riskAdjustedStance": "基于风险收益比的立场评估"
      },
      "timeDimension": {
        "expectedDuration": "预期持仓周期及理由",
        "keyMilestones": ["里程碑事件1及预期时间", "里程碑事件2及预期时间"],
        "exitTriggers": ["止盈退出条件", "止损退出条件", "论点证伪退出条件"]
      }
    }
  `;

  const response = await withRetry(async () => {
    const result = await generateContentWithUsage(ai, {
      model: config?.model || GEMINI_MODEL,
      contents: prompt
    });
    return result.text;
  });

  return parseJsonResponse<AgentDiscussion>(response);
}
