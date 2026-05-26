// api/analysis.js
// Uses Claude API with web_search tool to fetch real stock data
// No FMP/Yahoo needed - Claude searches the web for current prices

const https = require('https');

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const urlObj = new URL(req.url, 'http://localhost');
  const parts  = urlObj.pathname.split('/').filter(Boolean);
  const sym    = (parts[parts.length - 1] || '').toUpperCase();
  if (!sym || sym === 'ANALYSIS') return res.status(400).json({ error: 'Symbol required' });

  const indian = sym.endsWith('.NS') || sym.endsWith('.BO');
  const curr   = indian ? '₹' : '$';
  const displaySym = sym.replace('.NS','').replace('.BO','');

  try {
    const prompt = `Search for current stock data for ${sym} and write a research analysis.

First search for: "${displaySym} stock price today ${indian ? 'NSE India' : 'NYSE NASDAQ'}"
Also search for: "${displaySym} stock financial analysis revenue earnings 2024"

Then write a research note with EXACTLY these sections:
## Business Overview
(What does the company do, competitive position)
## Financial Health
(Recent revenue, profit margins, debt situation)
## Valuation View
(Is the stock cheap or expensive based on P/E and peers)
## Growth Outlook
(Key growth drivers for next 1-3 years)
## Key Risks
• Risk 1
• Risk 2  
• Risk 3
## Research Opinion
(Overall verdict, who should buy this stock)

Use ${curr} for prices. Be specific with numbers from search results. Plain English, no hype.`;

    const response = await httpPost(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      },
      {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      }
    );

    // Extract text from response (may include tool use blocks)
    const text = (response?.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || 'Analysis unavailable.';

    res.json({ analysis: text, symbol: sym, market: indian ? 'IN' : 'US', generatedAt: new Date().toISOString() });
  } catch(err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
