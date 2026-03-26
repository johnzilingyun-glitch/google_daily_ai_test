import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import fs from 'fs';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = config.port;

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

  app.post('/api/admin/log', (req, res) => {
    const { field, oldValue, newValue, description } = req.body;
    if (!field || !description) {
      return res.status(400).json({ error: 'Field and description are required' });
    }
    addLogEntry(field, oldValue, newValue, description);
    res.json({ success: true });
  });

  // Feishu Webhook endpoint
  app.post('/api/feishu/send-report', async (req, res) => {
    const { content } = req.body;
    const webhookUrl = config.feishuWebhookUrl;

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
      feishuWebhookDefined: !!config.feishuWebhookUrl,
      appUrl: config.appUrl,
      nodeEnv: config.nodeEnv,
    });
  });

  // Real-time Stock Data Endpoint
  app.get('/api/stock/realtime', async (req, res) => {
    const { symbol, market, symbols } = req.query;
    console.log(`API Request: /api/stock/realtime - symbol: ${symbol}, market: ${market}, symbols: ${symbols}`);
    
    // Handle multiple symbols if provided
    if (symbols && typeof symbols === 'string' && symbols.trim()) {
      try {
        const symbolList = symbols.split(',').map(s => s.trim()).filter(s => !!s);
        if (symbolList.length === 0) {
          return res.status(400).json({ error: 'No valid symbols provided' });
        }
        console.log(`Fetching batch quotes for: ${symbolList.join(', ')}`);
        const results = await yahooFinance.quote(symbolList as any);
        console.log(`Successfully fetched ${results.length} quotes.`);
        return res.json(results);
      } catch (error) {
        console.error('Yahoo Finance Batch Error:', error);
        return res.status(500).json({ error: 'Failed to fetch batch stock data' });
      }
    }

    if (!symbol || typeof symbol !== 'string' || !symbol.trim() || !market) {
      return res.status(400).json({ error: 'Symbol and market are required' });
    }

    try {
      let yfSymbol = (symbol as string).trim();
      
      // If the symbol already contains a dot or starts with a caret, assume it's already a valid Yahoo symbol
      if (!yfSymbol.includes('.') && !yfSymbol.startsWith('^')) {
        if (market === 'A-Share') {
          if (yfSymbol.startsWith('6')) {
            yfSymbol = `${yfSymbol}.SS`;
          } else {
            yfSymbol = `${yfSymbol}.SZ`;
          }
        } else if (market === 'HK-Share') {
          yfSymbol = `${yfSymbol.padStart(5, '0')}.HK`;
        }
      }

      console.log(`Fetching quote for: ${yfSymbol} (Original: ${symbol}, Market: ${market})`);
      let result: any;
      try {
        result = await yahooFinance.quote(yfSymbol);
      } catch (e) {
        console.log(`Quote failed for ${yfSymbol}, trying search...`);
      }
      
      if (!result) {
        // Try searching if quote fails (might be a name or abbreviation)
        const searchResults = await yahooFinance.search(symbol as string);
        if (searchResults.quotes && searchResults.quotes.length > 0) {
          // Find the best match for the requested market
          const bestMatch = searchResults.quotes.find((q: any) => {
            if (market === 'A-Share') return q.symbol.endsWith('.SS') || q.symbol.endsWith('.SZ');
            if (market === 'HK-Share') return q.symbol.endsWith('.HK');
            return true;
          }) || searchResults.quotes[0];
          
          console.log(`Search found best match: ${bestMatch.symbol} for ${symbol}`);
          result = await yahooFinance.quote(bestMatch.symbol as any);
        }
      }
      
      if (!result) {
        throw new Error(`No data returned from Yahoo Finance for ${yfSymbol} or search ${symbol}`);
      }

      res.json({
        symbol,
        name: result.shortName || result.longName || symbol,
        price: result.regularMarketPrice,
        change: result.regularMarketChange,
        changePercent: result.regularMarketChangePercent,
        previousClose: result.regularMarketPreviousClose,
        open: result.regularMarketOpen,
        dayHigh: result.regularMarketDayHigh,
        dayLow: result.regularMarketDayLow,
        volume: result.regularMarketVolume,
        marketCap: result.marketCap,
        pe: result.trailingPE,
        currency: result.currency,
        lastUpdated: new Date().toISOString(),
        source: 'Yahoo Finance API'
      });
    } catch (error) {
      console.error('Yahoo Finance Error:', error);
      res.status(500).json({ error: 'Failed to fetch real-time stock data' });
    }
  });

  // Vite middleware for development
  if (config.nodeEnv !== 'production') {
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
