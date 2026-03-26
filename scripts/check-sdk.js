// List available Gemini models - pass API key as arg: node scripts/check-sdk.js YOUR_KEY
import {GoogleGenAI} from '@google/genai';

const apiKey = process.argv[2];
if (!apiKey) {
  console.log('Usage: node scripts/check-sdk.js YOUR_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({apiKey});

async function main() {
  const pager = await ai.models.list({config: {pageSize: 100}});
  const models = [];
  for (const model of pager) {
    if (model.name?.includes('gemini')) {
      models.push({name: model.name, displayName: model.displayName});
    }
  }
  // Sort and filter for flash/pro/lite
  const relevant = models.filter(m => 
    m.name?.includes('flash') || m.name?.includes('pro') || m.name?.includes('lite')
  );
  console.log('=== Relevant Gemini models ===');
  relevant.forEach(m => console.log(`  ${m.name}  →  ${m.displayName}`));
  console.log(`\nTotal gemini models found: ${models.length}`);
}

main().catch(e => console.error(e.message));
