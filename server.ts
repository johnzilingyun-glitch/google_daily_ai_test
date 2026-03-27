import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

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

  // Market Indices Endpoint (used by marketService for ground truth data)
  app.get('/api/stock/indices', async (req, res) => {
    const { market } = req.query;
    console.log(`API Request: /api/stock/indices - market: ${market}`);

    const indexSymbols: Record<string, { symbol: string; name: string }[]> = {
      'A-Share': [
        { symbol: '000001.SS', name: '上证综指' },
        { symbol: '399001.SZ', name: '深证成指' },
        { symbol: '399006.SZ', name: '创业板指' },
        { symbol: '000300.SS', name: '沪深300' },
        { symbol: '^HSI', name: '恒生指数' },
      ],
      'HK-Share': [
        { symbol: '^HSI', name: '恒生指数' },
        { symbol: '^HSTECH', name: '恒生科技指数' },
        { symbol: '^HSCE', name: '国企指数' },
        { symbol: '^HSCCI', name: '红筹指数' },
        { symbol: '^S&P/HKEX GEM', name: '创业板指数' },
      ],
      'US-Share': [
        { symbol: '^GSPC', name: 'S&P 500' },
        { symbol: '^IXIC', name: '纳斯达克综合' },
        { symbol: '^DJI', name: '道琼斯工业' },
        { symbol: '^RUT', name: '罗素2000' },
        { symbol: '^SOX', name: '费城半导体' },
      ],
    };

    const marketKey = (market as string) || 'A-Share';
    const symbols = indexSymbols[marketKey] || indexSymbols['A-Share'];

    try {
      const results = [];
      for (const idx of symbols) {
        try {
          const quote = await yahooFinance.quote(idx.symbol as any);
          if (quote) {
            const price = quote.regularMarketPrice;
            const prevClose = quote.regularMarketPreviousClose;
            let change = quote.regularMarketChange;
            let changePercent = quote.regularMarketChangePercent;

            if (change === undefined && price !== undefined && prevClose !== undefined) {
              change = price - prevClose;
            }
            if (changePercent === undefined && change !== undefined && prevClose !== undefined && prevClose !== 0) {
              changePercent = (change / prevClose) * 100;
            }

            const marketTime = quote.regularMarketTime ? new Date(quote.regularMarketTime) : new Date();
            const formattedTime = marketTime.toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            results.push({
              name: idx.name,
              symbol: idx.symbol,
              price: price,
              change: change !== undefined ? parseFloat(change.toFixed(2)) : 0,
              changePercent: changePercent !== undefined ? parseFloat(changePercent.toFixed(2)) : 0,
              previousClose: prevClose,
              lastUpdated: formattedTime + ' CST',
              source: 'Yahoo Finance API',
              marketState: quote.marketState,
            });
          }
        } catch (e) {
          console.warn(`Failed to fetch index ${idx.symbol}:`, e);
        }
      }

      console.log(`Successfully fetched ${results.length}/${symbols.length} indices for ${marketKey}`);
      res.json(results);
    } catch (error) {
      console.error('Indices fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch indices data' });
    }
  });

  // Real-time Stock Data Endpoint
  app.get('/api/stock/realtime', async (req, res) => {
    const { symbol, market, symbols } = req.query;
    console.log(`API Request: /api/stock/realtime - symbol: ${symbol}, market: ${market}, symbols: ${symbols}`);
    
    // Handle multiple symbols if provided
    if (symbols && typeof symbols === 'string' && symbols.trim()) {
      try {
        const rawSymbolList = symbols.split(',').map(s => s.trim()).filter(s => !!s);
        if (rawSymbolList.length === 0) {
          return res.status(400).json({ error: 'No valid symbols provided' });
        }
        
        // Map symbols to Yahoo Finance format
        const symbolList = rawSymbolList.map(s => {
          let sym = s.toUpperCase();
          if (sym.endsWith('.SH')) sym = sym.replace('.SH', '.SS');
          if (sym.length === 6) {
            if (sym.startsWith('60') || sym.startsWith('68')) return `${sym}.SS`;
            if (sym.startsWith('00') || sym.startsWith('30')) return `${sym}.SZ`;
            if (sym.startsWith('8') || sym.startsWith('4')) return `${sym}.BJ`;
          }
          return sym;
        });

        console.log(`Fetching batch quotes for: ${symbolList.join(', ')}`);
        const results = await yahooFinance.quote(symbolList as any);
        
        // Format results to be consistent with single quote response
        const formattedResults = results.map(result => {
          let changePercent = result.regularMarketChangePercent;
          let change = result.regularMarketChange;
          const price = result.regularMarketPrice;
          const prevClose = result.regularMarketPreviousClose;

          // Fallback calculations
          if (change === undefined && price !== undefined && prevClose !== undefined) {
            change = price - prevClose;
          }
          if (changePercent === undefined && change !== undefined && prevClose !== undefined && prevClose !== 0) {
            changePercent = (change / prevClose) * 100;
          }

          // Robustness check for changePercent (decimal vs percentage)
          if (changePercent !== undefined && Math.abs(changePercent) < 0.1 && changePercent !== 0 && change !== undefined && price !== undefined) {
             // If changePercent is very small but change is significant, it's likely a decimal
             if (Math.abs(change) > 0.005 * price) {
               changePercent = changePercent * 100;
             }
          }

          const marketTime = result.regularMarketTime ? new Date(result.regularMarketTime) : new Date();
          const formattedTime = marketTime.toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          return {
            symbol: result.symbol,
            name: result.shortName || result.longName || result.symbol,
            price: price,
            change: change !== undefined ? parseFloat(change.toFixed(2)) : 0,
            changePercent: changePercent !== undefined ? parseFloat(changePercent.toFixed(2)) : 0,
            previousClose: prevClose,
            currency: result.currency,
            lastUpdated: formattedTime,
            marketState: result.marketState,
            source: 'Yahoo Finance API',
            exchange: result.fullExchangeName || result.exchange,
            quoteDelay: result.exchangeDataDelayedBy || 0
          };
        });

        console.log(`Successfully fetched and formatted ${formattedResults.length} quotes.`);
        return res.json(formattedResults);
      } catch (error) {
        console.error('Yahoo Finance Batch Error:', error);
        return res.status(500).json({ error: 'Failed to fetch batch stock data' });
      }
    }

    if (!symbol || typeof symbol !== 'string' || !symbol.trim() || !market) {
      return res.status(400).json({ error: 'Symbol and market are required' });
    }

    try {
      let yfSymbol = (symbol as string).trim().toUpperCase();
      
      // Handle common suffix variations
      yfSymbol = yfSymbol.replace('.SH', '.SS');
      
      // If the symbol already contains a dot or starts with a caret, assume it's already a valid Yahoo symbol
      if (!yfSymbol.includes('.') && !yfSymbol.startsWith('^')) {
        if (market === 'A-Share') {
          // Use East Money Suggest API to smartly resolve Chinese names and pinyins (e.g. MRYL, 迈瑞医疗) into 6-digit codes
          if (!/^\d{6}$/.test(yfSymbol)) {
            try {
              const encodedInput = encodeURIComponent((symbol as string).trim());
              const emUrl = `https://searchapi.eastmoney.com/api/suggest/get?cb=cb&input=${encodedInput}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8`;
              const response = await fetch(emUrl);
              const text = await response.text();
              const match = text.match(/^cb\((.*)\)$/);
              if (match && match[1]) {
                const data = JSON.parse(match[1]);
                if (data?.QuotationCodeTable?.Data?.length > 0) {
                  const bestCode = data.QuotationCodeTable.Data[0].Code;
                  if (bestCode && /^\d{6}$/.test(bestCode)) {
                    console.log(`Smart Resolved '${yfSymbol}' to '${bestCode}' via EastMoney`);
                    yfSymbol = bestCode;
                  }
                }
              }
            } catch (error) {
              console.error(`EastMoney resolution failed for ${yfSymbol}:`, error);
            }
          }

          // Only append suffix if it's a 6-digit number
          if (/^\d{6}$/.test(yfSymbol)) {
            if (yfSymbol.startsWith('60') || yfSymbol.startsWith('68')) {
              yfSymbol = `${yfSymbol}.SS`;
            } else if (yfSymbol.startsWith('00') || yfSymbol.startsWith('30')) {
              yfSymbol = `${yfSymbol}.SZ`;
            } else if (yfSymbol.startsWith('43') || yfSymbol.startsWith('83') || yfSymbol.startsWith('87')) {
              yfSymbol = `${yfSymbol}.BJ`;
            } else if (yfSymbol.startsWith('6')) {
              yfSymbol = `${yfSymbol}.SS`;
            } else {
              yfSymbol = `${yfSymbol}.SZ`;
            }
          }
        } else if (market === 'HK-Share') {
          if (/^\d+$/.test(yfSymbol)) {
            yfSymbol = `${yfSymbol.padStart(5, '0')}.HK`;
          }
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
        let searchResults = await yahooFinance.search(symbol as string);
        
        // Fallback search with "stock" keyword if first search yields no results
        if ((!searchResults.quotes || searchResults.quotes.length === 0) && typeof symbol === 'string') {
          console.log(`Search for ${symbol} yielded no results, trying with 'stock' keyword...`);
          searchResults = await yahooFinance.search(`${symbol} stock`);
        }

        if (searchResults.quotes && searchResults.quotes.length > 0) {
          // Find the best match for the requested market
          const bestMatch = searchResults.quotes.find((q: any) => {
            if (market === 'A-Share') return q.symbol.endsWith('.SS') || q.symbol.endsWith('.SZ') || q.symbol.endsWith('.BJ');
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

      // Robustness check for changePercent (Yahoo sometimes returns decimal like 0.0118 instead of 1.18)
      let changePercent = result.regularMarketChangePercent;
      let change = result.regularMarketChange;
      const price = result.regularMarketPrice;
      const prevClose = result.regularMarketPreviousClose;

      // Fallback calculations
      if (change === undefined && price !== undefined && prevClose !== undefined) {
        change = price - prevClose;
      }
      if (changePercent === undefined && change !== undefined && prevClose !== undefined && prevClose !== 0) {
        changePercent = (change / prevClose) * 100;
      }

      if (changePercent !== undefined && Math.abs(changePercent) < 0.1 && changePercent !== 0 && change !== undefined && price !== undefined) {
        // If changePercent is very small but change is significant, it's likely a decimal
        if (Math.abs(change) > 0.005 * price) {
          changePercent = changePercent * 100;
        }
      }
      
      // Format last updated time
      const dataTime = result.regularMarketTime ? new Date(result.regularMarketTime) : new Date();
      const formattedTime = dataTime.toLocaleString('zh-CN', { 
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' CST';

      res.json({
        symbol: result.symbol || symbol,
        name: result.shortName || result.longName || symbol,
        price: price,
        change: change !== undefined ? parseFloat(change.toFixed(2)) : 0,
        changePercent: changePercent !== undefined ? parseFloat(changePercent.toFixed(2)) : 0,
        previousClose: prevClose,
        open: result.regularMarketOpen,
        dayHigh: result.regularMarketDayHigh,
        dayLow: result.regularMarketDayLow,
        volume: result.regularMarketVolume,
        marketCap: result.marketCap,
        pe: result.trailingPE,
        currency: result.currency,
        lastUpdated: formattedTime,
        source: 'Yahoo Finance API',
        exchange: result.fullExchangeName || result.exchange,
        marketState: result.marketState,
        quoteDelay: result.exchangeDataDelayedBy || 0
      });
    } catch (error) {
      console.error('Yahoo Finance Error:', error);
      res.status(500).json({ error: 'Failed to fetch real-time stock data' });
    }
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
