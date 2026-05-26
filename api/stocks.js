// api/stocks.js
// Uses Yahoo Finance via server-side fetch (no CORS issues server-side)
// Falls back to mock data if Yahoo is unavailable

const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
      },
      timeout: 8000,
    };
    const req = https.get(url, opts, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Parse error (${res.statusCode}): ${data.slice(0,100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function normalizeSymbol(symbol) {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
  const indian = ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','WIPRO',
    'HINDUNILVR','BAJFINANCE','TATAMOTORS','TATASTEEL','SUNPHARMA','HCLTECH','TECHM',
    'AXISBANK','KOTAKBANK','BAJAJFINSV','TITAN','NTPC','ONGC','ADANIENT'];
  if (indian.includes(s)) return s + '.NS';
  return s;
}

const YF1 = 'https://query1.finance.yahoo.com';
const YF2 = 'https://query2.finance.yahoo.com';

async function yfGet(path, useYF2 = false) {
  const base = useYF2 ? YF2 : YF1;
  try { return await httpGet(`${base}${path}`); }
  catch(e) {
    if (!useYF2) return yfGet(path, true); // fallback to query2
    throw e;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlObj = new URL(req.url, 'http://localhost');
  const parts  = urlObj.pathname.replace(/^\/api\/stocks\/?/, '').split('/').filter(Boolean);
  const route  = parts[0] || '';
  const symbol = parts[1] ? decodeURIComponent(parts[1]).toUpperCase() : '';
  const query  = Object.fromEntries(urlObj.searchParams);

  console.log(`[stocks] route=${route} symbol=${symbol}`);

  try {
    // SEARCH
    if (route === 'search') {
      const q = query.q || '';
      if (!q) return res.json([]);
      const data = await yfGet(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`);
      const quotes = data?.finance?.result?.[0]?.quotes || [];
      const results = quotes.map(r => ({
        symbol: r.symbol,
        name: r.longname || r.shortname || r.symbol,
        exchange: r.exchDisp || r.exchange || '',
        exchangeShortName: r.exchDisp || r.exchange || '',
        market: (r.symbol?.endsWith('.NS') || r.symbol?.endsWith('.BO') || r.exchange === 'NSI' || r.exchange === 'BSE') ? 'IN' : 'US',
      }));
      const mkt = query.market || 'ALL';
      return res.json(mkt !== 'ALL' ? results.filter(r => r.market === mkt) : results);
    }

    const sym = normalizeSymbol(symbol);
    const isIndian = sym.endsWith('.NS') || sym.endsWith('.BO');

    // QUOTE
    if (route === 'quote') {
      const data = await yfGet(`/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`);
      const result = data?.chart?.result?.[0];
      if (!result) return res.json(null);
      const meta = result.meta;
      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      const price = meta.regularMarketPrice;
      return res.json([{
        symbol: sym,
        name: meta.longName || meta.shortName || sym,
        price: price,
        changesPercentage: prev ? ((price - prev) / prev * 100) : 0,
        change: prev ? (price - prev) : 0,
        marketCap: meta.marketCap || null,
        pe: meta.trailingPE || null,
        eps: meta.epsTrailingTwelveMonths || null,
        yearHigh: meta.fiftyTwoWeekHigh || null,
        yearLow: meta.fiftyTwoWeekLow || null,
        currency: meta.currency || (isIndian ? 'INR' : 'USD'),
        exchange: meta.exchangeName || '',
        volume: meta.regularMarketVolume || null,
      }]);
    }

    // HISTORY
    if (route === 'history') {
      const rangeMap = {'1month':'1mo','3months':'3mo','6months':'6mo','1year':'1y','3years':'3y','5years':'5y'};
      const intMap   = {'1month':'1d','3months':'1d','6months':'1d','1year':'1wk','3years':'1wk','5years':'1mo'};
      const period   = query.period || '1year';
      const range    = rangeMap[period] || '1y';
      const interval = intMap[period] || '1wk';
      const data = await yfGet(`/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`);
      const result = data?.chart?.result?.[0];
      if (!result) return res.json([]);
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      return res.json(timestamps.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        close: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
      })).filter(d => d.close !== null));
    }

    // PROFILE + RATIOS + INCOME + SCORE — use quoteSummary
    const modules = {
      profile: 'assetProfile,price',
      ratios:  'financialData,defaultKeyStatistics',
      income:  'incomeStatementHistory',
      score:   'financialData,defaultKeyStatistics,incomeStatementHistory',
    };

    if (modules[route]) {
      const mod = modules[route];
      const data = await yfGet(`/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${mod}`);
      const result = data?.quoteSummary?.result?.[0] || {};

      if (route === 'profile') {
        const p = result.assetProfile || {};
        const pr = result.price || {};
        return res.json([{
          companyName: pr.longName || pr.shortName || sym,
          sector: p.sector || '',
          industry: p.industry || '',
          description: p.longBusinessSummary || '',
          exchange: pr.exchangeName || '',
        }]);
      }

      if (route === 'ratios') {
        const fd = result.financialData || {};
        const ks = result.defaultKeyStatistics || {};
        return res.json([{
          peRatioTTM: ks.trailingPE?.raw || null,
          priceToBookRatioTTM: ks.priceToBook?.raw || null,
          netProfitMarginTTM: fd.profitMargins?.raw || null,
          returnOnEquityTTM: fd.returnOnEquity?.raw || null,
          debtEquityRatioTTM: fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 100 : null,
          currentRatioTTM: fd.currentRatio?.raw || null,
          dividendYielTTM: ks.dividendYield?.raw || 0,
          payoutRatioTTM: ks.payoutRatio?.raw || 0,
        }]);
      }

      if (route === 'income') {
        const stmts = result.incomeStatementHistory?.incomeStatementHistory || [];
        return res.json(stmts.map(s => ({
          date: new Date((s.endDate?.raw || 0) * 1000).getFullYear().toString(),
          calendarYear: new Date((s.endDate?.raw || 0) * 1000).getFullYear().toString(),
          revenue: s.totalRevenue?.raw || 0,
          netIncome: s.netIncome?.raw || 0,
          eps: s.basicEPS?.raw || 0,
        })));
      }

      if (route === 'score') {
        const fd = result.financialData || {};
        const ks = result.defaultKeyStatistics || {};
        const stmts = result.incomeStatementHistory?.incomeStatementHistory || [];
        const rg = stmts.length >= 2 && stmts[0].totalRevenue?.raw && stmts[1].totalRevenue?.raw
          ? (stmts[0].totalRevenue.raw - stmts[1].totalRevenue.raw) / Math.abs(stmts[1].totalRevenue.raw) : 0;
        const eg = stmts.length >= 2 && stmts[0].basicEPS?.raw && stmts[1].basicEPS?.raw
          ? (stmts[0].basicEPS.raw - stmts[1].basicEPS.raw) / Math.abs(stmts[1].basicEPS.raw) : 0;

        const pe = ks.trailingPE?.raw || null;
        const nm = fd.profitMargins?.raw || 0;
        const roe = fd.returnOnEquity?.raw || 0;
        const de = fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 100 : 0;
        const cr = fd.currentRatio?.raw || 1;
        const dy = ks.dividendYield?.raw || 0;
        const posE = stmts.filter(s => (s.netIncome?.raw || 0) > 0).length;

        const peGood=isIndian?18:15, peFair=isIndian?30:25, peHigh=isIndian?50:40;
        let v=10;
        if(pe&&pe>0&&pe<peGood)v+=10; else if(pe&&pe>0&&pe<peFair)v+=6; else if(pe&&pe>0&&pe<peHigh)v+=2; else v-=2;
        let g=10;
        if(rg>0.2)g+=6; else if(rg>0.1)g+=4; else if(rg>0)g+=2; else g-=3;
        if(eg>0.2)g+=4; else if(eg>0)g+=2; else g-=2;
        let p=10;
        if(nm>0.2)p+=5; else if(nm>0.1)p+=3; else if(nm>0)p+=1; else p-=4;
        if(roe>0.2)p+=5; else if(roe>0.1)p+=3; else if(roe>0)p+=1; else p-=3;
        let d=8;
        if(de>=0&&de<0.5)d+=5; else if(de<1)d+=3; else if(de<2)d+=1; else d-=3;
        if(cr>2)d+=2; else if(cr>1)d+=1; else d-=2;
        const m=7;
        const e=Math.max(0,Math.min(10,Math.round(5+(posE/Math.max(stmts.length,1))*5)));
        const div=dy>0.01&&dy<(isIndian?0.08:0.06)?5:dy>0?2:0;
        const scores={valuation:Math.max(0,Math.min(20,v)),growth:Math.max(0,Math.min(20,g)),
          profitability:Math.max(0,Math.min(20,p)),debt:Math.max(0,Math.min(15,d)),
          momentum:m,earnings:e,dividend:div};
        const total=Object.values(scores).reduce((a,b)=>a+b,0);
        const action=total>=78?'Strong Buy':total>=62?'Buy':total>=45?'Hold':'Avoid';
        const risks=[];
        if(pe&&pe>peHigh)risks.push(`High valuation P/E > ${peHigh}`);
        if(de>2)risks.push('High debt levels');
        if(nm<0)risks.push('Currently unprofitable');
        if(cr<1)risks.push('Liquidity risk');
        if(rg<0)risks.push('Revenue declining');
        return res.json({
          total:Math.round(total),max:100,breakdown:scores,action,
          confidence:total>=78?'High':total>=62?'Medium-High':total>=45?'Medium':'Low',
          risks,signal:total>=62?'Buy':total>=45?'Hold':'Avoid',
          riskRating:d<6||nm<0?'High':total>=60?'Low':'Medium',
          market:isIndian?'IN':'US'
        });
      }
    }

    return res.status(404).json({ error: `Unknown route: ${route}` });
  } catch(err) {
    console.error(`[stocks] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
};
