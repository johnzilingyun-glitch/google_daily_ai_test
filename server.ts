import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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

  // GitHub OAuth URL endpoint
  app.get('/api/auth/github/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    // Ensure APP_URL doesn't have a trailing slash for consistency
    const baseUrl = process.env.APP_URL?.replace(/\/$/, '');
    const redirectUri = `${baseUrl}/auth/github/callback`;
    
    if (!clientId) {
      return res.status(500).json({ error: 'GITHUB_CLIENT_ID is not configured' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user user:email',
      response_type: 'code',
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  // Default GitHub Token endpoint
  app.get('/api/auth/github/token', (req, res) => {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      res.json({ token });
    } else {
      res.status(404).json({ error: 'Default GITHUB_TOKEN not configured' });
    }
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

  // GitHub OAuth Callback
  app.get('/auth/github/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.send('No code provided');
    }

    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      // In a real app, you'd store this token in a secure session/cookie
      // For this demo, we'll just send it back to the client via postMessage
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GITHUB_AUTH_SUCCESS',
                  token: '${tokenData.access_token}'
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('GitHub OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  let lastSyncResult: any = { status: 'never', time: null };

  // Sync Log Endpoint for debugging
  app.get('/api/admin/sync-log', (req, res) => {
    res.json(lastSyncResult);
  });

  // Env Check Endpoint for debugging
  app.get('/api/admin/env-check', (req, res) => {
    res.json({
      keys: Object.keys(process.env),
      githubTokenDefined: !!process.env.GITHUB_TOKEN,
      feishuWebhookDefined: !!process.env.FEISHU_WEBHOOK_URL,
      appUrl: process.env.APP_URL,
      nodeEnv: process.env.NODE_ENV,
      lastSync: lastSyncResult
    });
  });

  // Manual Sync Endpoint for debugging
  app.post('/api/admin/sync-now', async (req, res) => {
    try {
      const token = process.env.GITHUB_TOKEN;
      const repoPath = 'johnzilingyun-glitch/daily_ai_test';
      
      if (!token) {
        return res.status(500).json({ error: 'GITHUB_TOKEN not found' });
      }

      console.log('Manual sync triggered...');
      const results: any[] = [];
      const filesToSync = [
        'src/App.tsx',
        'src/services/aiService.ts',
        'server.ts',
        'package.json',
        'vite.config.ts',
        '.env.example',
        'index.html',
        'src/main.tsx',
        'src/index.css',
        'src/types.ts',
        'src/constants.ts',
        'src/constants.tsx',
        'metadata.json'
      ];

      const fs = await import('fs/promises');
      for (const filePath of filesToSync) {
        try {
          const fullPath = path.join(process.cwd(), filePath);
          let content = '';
          try {
            content = await fs.readFile(fullPath, 'utf-8');
          } catch (e) {
            results.push({ file: filePath, status: 'skipped', reason: 'File not found' });
            continue;
          }
          
          const getFileResponse = await fetch(`https://api.github.com/repos/${repoPath}/contents/${filePath}`, {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'AI-Studio-Build',
              'Accept': 'application/vnd.github.v3+json'
            },
          });
          
          let sha: string | undefined;
          if (getFileResponse.ok) {
            const fileData: any = await getFileResponse.json();
            sha = fileData.sha;
          }

          const putResponse = await fetch(`https://api.github.com/repos/${repoPath}/contents/${filePath}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': 'AI-Studio-Build',
              'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
              message: `Auto-sync ${filePath} from AI Studio Build`,
              content: Buffer.from(content).toString('base64'),
              sha,
            }),
          });

          if (putResponse.ok) {
            results.push({ file: filePath, status: 'success' });
          } else {
            const error = await putResponse.json();
            results.push({ file: filePath, status: 'error', error });
          }
        } catch (err) {
          results.push({ file: filePath, status: 'error', error: String(err) });
        }
      }
      res.json({ success: true, results });
    } catch (globalError) {
      console.error('Global Sync Error:', globalError);
      res.status(500).json({ error: String(globalError) });
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
    
    // Automatic Background Sync to GitHub on startup
    const syncToGithub = async () => {
      const token = process.env.GITHUB_TOKEN;
      const repoPath = 'johnzilingyun-glitch/daily_ai_test';
      
      if (!token) {
        console.warn('GITHUB_TOKEN not found in environment, skipping background sync.');
        lastSyncResult = { status: 'error', error: 'GITHUB_TOKEN not found', time: new Date().toISOString() };
        return;
      }

      console.log(`Starting background sync to GitHub repo: ${repoPath}...`);
      lastSyncResult = { status: 'running', time: new Date().toISOString() };
      
      const filesToSync = [
        'src/App.tsx',
        'src/services/aiService.ts',
        'server.ts',
        'package.json',
        'vite.config.ts',
        '.env.example',
        'index.html',
        'src/main.tsx',
        'src/index.css',
        'src/types.ts',
        'src/constants.ts',
        'src/constants.tsx',
        'metadata.json'
      ];

      const fs = await import('fs/promises');
      let successCount = 0;
      let failCount = 0;
      const details: any[] = [];

      for (const filePath of filesToSync) {
        try {
          const fullPath = path.join(process.cwd(), filePath);
          let content = '';
          try {
            content = await fs.readFile(fullPath, 'utf-8');
          } catch (e) {
            console.log(`Skipping ${filePath}: file not found locally.`);
            details.push({ file: filePath, status: 'skipped', reason: 'File not found' });
            continue;
          }
          
          // 1. Get current file SHA if it exists
          const getFileResponse = await fetch(`https://api.github.com/repos/${repoPath}/contents/${filePath}`, {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'AI-Studio-Build',
              'Accept': 'application/vnd.github.v3+json'
            },
          });
          
          let sha: string | undefined;
          if (getFileResponse.ok) {
            const fileData: any = await getFileResponse.json();
            sha = fileData.sha;
            
            // Optimization: Check if content is actually different
            const remoteContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
            if (remoteContent === content) {
              console.log(`File ${filePath} is already up to date.`);
              successCount++;
              details.push({ file: filePath, status: 'up-to-date' });
              continue;
            }
          }

          // 2. Push content to GitHub
          const putResponse = await fetch(`https://api.github.com/repos/${repoPath}/contents/${filePath}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': 'AI-Studio-Build',
              'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
              message: `Auto-sync ${filePath} from AI Studio Build`,
              content: Buffer.from(content).toString('base64'),
              sha,
            }),
          });

          if (putResponse.ok) {
            console.log(`Successfully synced ${filePath}`);
            successCount++;
            details.push({ file: filePath, status: 'synced' });
          } else {
            const error = await putResponse.json();
            console.error(`Failed to sync ${filePath}:`, JSON.stringify(error));
            failCount++;
            details.push({ file: filePath, status: 'error', error });
          }
        } catch (err) {
          console.error(`Error syncing ${filePath}:`, err);
          failCount++;
          details.push({ file: filePath, status: 'error', error: String(err) });
        }
      }
      console.log(`Background sync completed. Success: ${successCount}, Failed: ${failCount}`);
      lastSyncResult = { 
        status: failCount === 0 ? 'success' : 'partial_success', 
        successCount, 
        failCount, 
        details,
        time: new Date().toISOString() 
      };
    };

    // Run sync after a short delay to ensure server is fully ready
    setTimeout(() => {
      void syncToGithub();
    }, 5000);
  });
}

startServer();
