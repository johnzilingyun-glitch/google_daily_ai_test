import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface AppConfig {
  geminiApiKey: string;
  feishuWebhookUrl: string | undefined;
  appUrl: string | undefined;
  port: number;
  nodeEnv: string;
}

function loadConfig(): AppConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  if (!geminiApiKey) {
    console.warn(
      '\n⚠️  GEMINI_API_KEY is not set on the server.\n' +
      '   Users will need to enter their API key in the frontend settings.\n'
    );
  }

  return {
    geminiApiKey,
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || undefined,
    appUrl: process.env.APP_URL || undefined,
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

export const config = loadConfig();
