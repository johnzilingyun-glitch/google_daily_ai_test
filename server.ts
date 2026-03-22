import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // History and Optimization Log
  const HISTORY_DIR = path.join(process.cwd(), 'data', 'history');
  const LOG_FILE = path.join(process.cwd(), 'data', 'optimization_log.json');

  // Ensure directories exist
  if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'));
  }
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR);
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
  }

  function addLogEntry(field: string, oldValue: any, newValue: any, description: string) {
    try {
      const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
      logs.push({
        timestamp: new Date().toISOString(),
        field,
        oldValue,
        newValue,
        description
      });
      fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (err) {
      console.error('Failed to add log entry:', err);
    }
  }

  function saveAnalysis(type: 'market' | 'stock', data: any) {
    try {
      const filename = `${type}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save analysis:', err);
    }
  }

  app.get('/api/admin/optimization-logs', (req, res) => {
    try {
      const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read logs' });
    }
  });

  app.get('/api/admin/history-context', (req, res) => {
    try {
      const files = fs.readdirSync(HISTORY_DIR).sort().reverse().slice(0, 10);
      const history = files.map(f => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf-8')));
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read history' });
    }
  });

  app.post('/api/admin/save-analysis', (req, res) => {
    const { type, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ error: 'Type and data are required' });
    }
    saveAnalysis(type, data);
    res.json({ success: true });
  });

  // Feishu Webhook endpoint
  app.post('/api/feishu/send-report', async (req, res) => {
    const { content } = req.body;
    const webhookUrl = process.env.FEISHU_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(500).json({ error: 'FEISHU_WEBHOOK_URL is not configured' });
    }

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg_type: 'text',
          content: {
            text: content,
          },
        }),
      });

      const data = await response.json();
      // Feishu returns code 0 on success
      if (data.code !== 0) {
        throw new Error(data.msg || 'Feishu API error');
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Feishu Webhook Error:', error);
      res.status(500).json({ error: 'Failed to send report to Feishu' });
    }
  });

  // Env Check Endpoint for debugging
  app.get('/api/admin/env-check', (req, res) => {
    res.json({
      keys: Object.keys(process.env),
      feishuWebhookDefined: !!process.env.FEISHU_WEBHOOK_URL,
      appUrl: process.env.APP_URL,
      nodeEnv: process.env.NODE_ENV
    });
  });

  // Manual Trigger for Daily Report
  app.post('/api/admin/trigger-daily-report', async (req, res) => {
    try {
      const result = await generateAndSendDailyReport();
      res.json({ success: true, result });
    } catch (error) {
      console.error('Manual Report Trigger Error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  async function generateAndSendDailyReport() {
    const apiKey = process.env.GEMINI_API_KEY;
    const webhookUrl = process.env.FEISHU_WEBHOOK_URL;

    if (!apiKey || !webhookUrl) {
      const error = 'GEMINI_API_KEY or FEISHU_WEBHOOK_URL not configured';
      console.error(error);
      return { error };
    }

    console.log('Generating daily market report for Feishu...');
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      Current date and time: ${new Date().toISOString()}
      
      You are a professional China-focused markets analyst.
      Use Google Search grounding to gather the latest available public information about the market situation from the previous day or the weekend.
      
      Requirements:
      1. Summarize the A-share market tone (previous day or weekend news).
      2. Include key indices performance (SSE, SZSE, ChiNext, CSI 300, HSI).
      3. List 3-5 major financial news items.
      4. Provide a prediction for today's market opening and trend.
      5. Recommend 3 stocks or sectors to watch today with brief reasons.
      6. Format the output in Markdown, suitable for a Feishu message.
      7. Language: Simplified Chinese.
      
      Structure:
      # 每日早间市场内参 (${new Date().toLocaleDateString('zh-CN')})
      
      ## 1. 大盘回顾与总结
      ...
      
      ## 2. 核心财经要闻
      ...
      
      ## 3. 今日预测与操作建议
      ...
      
      ## 4. 今日关注个股/板块
      ...
    `.trim();

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const reportContent = response.text;
      if (!reportContent) throw new Error('Gemini returned empty report');

      console.log('Sending report to Feishu...');
      const feishuResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: reportContent },
        }),
      });

      const feishuData: any = await feishuResponse.json();
      if (feishuData.code !== 0) {
        throw new Error(`Feishu error: ${feishuData.msg}`);
      }

      console.log('Daily report sent successfully.');
      return { success: true, time: new Date().toISOString() };
    } catch (err) {
      console.error('Failed to generate/send daily report:', err);
      throw err;
    }
  }

  // Schedule: 9:00 AM Monday to Friday
  cron.schedule('0 9 * * 1-5', () => {
    console.log('Running scheduled daily market report task...');
    void generateAndSendDailyReport();
  }, {
    timezone: "Asia/Shanghai"
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    addLogEntry('server', 'startup', 'active', 'Server started and background tasks initialized');
  });
}

startServer();
