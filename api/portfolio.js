let memPortfolio = [];
let memWatchlist = [];
let nextId = 1;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlObj     = new URL(req.url, 'http://localhost');
  const parts      = urlObj.pathname.replace(/^\/api\/portfolio\/?/, '').split('/').filter(Boolean);
  const isWatchlist = parts[0] === 'watchlist';
  const id         = parts[isWatchlist ? 1 : 0];

  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    body = await new Promise(resolve => {
      let d = '';
      req.on('data', c => d += c);
      req.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
  }

  if (isWatchlist) {
    if (req.method === 'GET') return res.json(memWatchlist);
    if (req.method === 'POST') {
      const sym = (body.symbol || '').toUpperCase();
      if (!sym) return res.status(400).json({ error: 'Symbol required' });
      if (!memWatchlist.find(w => w.symbol === sym)) {
        memWatchlist.push({ id: nextId++, symbol: sym, added_at: new Date().toISOString() });
      }
      return res.json(memWatchlist.find(w => w.symbol === sym));
    }
    if (req.method === 'DELETE' && id) {
      memWatchlist = memWatchlist.filter(w => w.symbol !== id.toUpperCase());
      return res.json({ success: true });
    }
  } else {
    if (req.method === 'GET') return res.json(memPortfolio);
    if (req.method === 'POST') {
      const { symbol, shares, buy_price, buy_date, notes } = body;
      if (!symbol || !shares || !buy_price || !buy_date) return res.status(400).json({ error: 'Missing fields' });
      const entry = { id: nextId++, symbol: symbol.toUpperCase(), shares: parseFloat(shares), buy_price: parseFloat(buy_price), buy_date, notes: notes||'', created_at: new Date().toISOString() };
      memPortfolio.push(entry);
      return res.json(entry);
    }
    if (req.method === 'DELETE' && id) {
      memPortfolio = memPortfolio.filter(h => h.id !== parseInt(id));
      return res.json({ success: true });
    }
  }
  return res.status(404).json({ error: 'Not found' });
};
