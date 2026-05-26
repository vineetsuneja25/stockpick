import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

// ─── CONFIG ────────────────────────────────────────────────
// All stock data goes through our Vercel serverless functions
// which use Yahoo Finance (free, no API key needed)
const API_BASE = "/api";

async function apiCall(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch(e) {
    console.error("API error:", path, e.message);
    return null;
  }
}

// ─── MARKET DETECTION ─────────────────────────────────────
// Detects whether a symbol is Indian (NSE/BSE) or US
function detectMarket(symbol) {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith(".NS") || s.endsWith(".BO") || s.endsWith(".BSE")) return "IN";
  // Common Indian blue-chips that trade on NSE without suffix
  const indianSymbols = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","WIPRO",
    "HINDUNILVR","BAJFINANCE","ADANIENT","ADANIPORTS","MARUTI","SUNPHARMA","TATAMOTORS",
    "TATASTEEL","NTPC","POWERGRID","COALINDIA","ONGC","BPCL","IOC","GAIL","HCLTECH",
    "TECHM","LTIM","AXISBANK","KOTAKBANK","INDUSINDBK","BAJAJFINSV","TITAN","NESTLEIND",
    "BRITANNIA","DABUR","MARICO","PIDILITIND","ASIANPAINT","ULTRACEMCO","GRASIM","HINDALCO",
    "JSWSTEEL","VEDL","APOLLOHOSP","CIPLA","DRREDDY","DIVISLAB","BIOCON","LUPIN"];
  if (indianSymbols.includes(s)) return "IN";
  return "US";
}

// Normalise symbol for API calls
function normaliseSymbol(symbol) {
  const s = symbol.toUpperCase().trim();
  const market = detectMarket(s);
  if (market === "IN") {
    if (s.endsWith(".NS") || s.endsWith(".BO")) return s;
    return s + ".NS"; // default to NSE
  }
  return s;
}

// Currency symbol based on market
function getCurrency(symbol) {
  return detectMarket(symbol) === "IN" ? "₹" : "$";
}

// Format number with currency
function fmtC(n, symbol) {
  const c = getCurrency(symbol);
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${c}${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${c}${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e7)  return `${c}${(n / 1e7).toFixed(0)}Cr`; // crores for Indian
  if (abs >= 1e5)  return `${c}${(n / 1e5).toFixed(0)}L`;  // lakhs
  if (abs >= 1e6)  return `${c}${(n / 1e6).toFixed(0)}M`;
  return `${c}${n}`;
}

// ─── MOCK DATA ─────────────────────────────────────────────
const MOCK_STOCKS = {
  AAPL: {
    quote: [{ symbol: "AAPL", name: "Apple Inc.", price: 189.30, changesPercentage: 1.24, marketCap: 2940000000000, pe: 29.4, eps: 6.43, yearHigh: 199.62, yearLow: 164.08 }],
    profile: [{ companyName: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics", description: "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.", exchange: "NASDAQ" }],
  },
  MSFT: {
    quote: [{ symbol: "MSFT", name: "Microsoft Corporation", price: 415.60, changesPercentage: 0.87, marketCap: 3090000000000, pe: 36.1, eps: 11.52, yearHigh: 430.82, yearLow: 309.45 }],
    profile: [{ companyName: "Microsoft Corporation", sector: "Technology", industry: "Software—Infrastructure", description: "Microsoft Corporation develops and supports software, services, devices and solutions worldwide.", exchange: "NASDAQ" }],
  },
  TSLA: {
    quote: [{ symbol: "TSLA", name: "Tesla Inc.", price: 177.80, changesPercentage: -2.14, marketCap: 567000000000, pe: 47.2, eps: 3.77, yearHigh: 299.29, yearLow: 138.80 }],
    profile: [{ companyName: "Tesla, Inc.", sector: "Consumer Cyclical", industry: "Auto Manufacturers", description: "Tesla designs and manufactures electric vehicles, battery energy storage, solar panels and related products.", exchange: "NASDAQ" }],
  },
  "RELIANCE.NS": {
    quote: [{ symbol: "RELIANCE.NS", name: "Reliance Industries Ltd", price: 2847.50, changesPercentage: 0.62, marketCap: 19280000000000, pe: 27.3, eps: 104.3, yearHigh: 3024.90, yearLow: 2220.30 }],
    profile: [{ companyName: "Reliance Industries Ltd", sector: "Energy", industry: "Oil & Gas Integrated", description: "Reliance Industries Limited operates as a conglomerate in India. It operates through Oil to Chemicals, Oil and Gas, Retail, and Digital Services segments.", exchange: "NSE" }],
  },
  "TCS.NS": {
    quote: [{ symbol: "TCS.NS", name: "Tata Consultancy Services", price: 3892.15, changesPercentage: -0.34, marketCap: 14120000000000, pe: 29.1, eps: 133.8, yearHigh: 4255.00, yearLow: 3311.00 }],
    profile: [{ companyName: "Tata Consultancy Services Ltd", sector: "Technology", industry: "IT Services & Consulting", description: "Tata Consultancy Services is an IT services, consulting and business solutions organization that has been partnering with many of the world's largest businesses.", exchange: "NSE" }],
  },
  "HDFCBANK.NS": {
    quote: [{ symbol: "HDFCBANK.NS", name: "HDFC Bank Ltd", price: 1678.40, changesPercentage: 1.12, marketCap: 12760000000000, pe: 19.4, eps: 86.5, yearHigh: 1880.00, yearLow: 1363.55 }],
    profile: [{ companyName: "HDFC Bank Ltd", sector: "Financial Services", industry: "Banks - Private Sector", description: "HDFC Bank Limited provides banking and financial services to individuals and businesses in India and internationally.", exchange: "NSE" }],
  },
};

const MOCK_HISTORY_US = Array.from({ length: 52 }, (_, i) => ({
  date: new Date(Date.now() - (51 - i) * 7 * 86400000).toISOString().split("T")[0],
  close: parseFloat((165 + Math.sin(i / 5) * 15 + i * 0.3 + Math.random() * 8).toFixed(2)),
}));
const MOCK_HISTORY_IN = Array.from({ length: 52 }, (_, i) => ({
  date: new Date(Date.now() - (51 - i) * 7 * 86400000).toISOString().split("T")[0],
  close: parseFloat((2600 + Math.sin(i / 4) * 120 + i * 4 + Math.random() * 60).toFixed(2)),
}));

const MOCK_SCORE = { total: 72, max: 100, action: "Buy", confidence: "Medium-High", signal: "Buy", riskRating: "Medium", risks: ["Valuation premium vs peers", "Revenue growth moderating"], breakdown: { valuation: 14, growth: 16, profitability: 17, debt: 12, momentum: 7, earnings: 8, dividend: 3 } };

const MOCK_INCOME_US = Array.from({ length: 4 }, (_, i) => ({ date: `${2024 - i}`, calendarYear: `${2024 - i}`, revenue: (380 - i * 15) * 1e9, netIncome: (95 - i * 8) * 1e9, eps: 6.43 - i * 0.5 }));
const MOCK_INCOME_IN = Array.from({ length: 4 }, (_, i) => ({ date: `${2024 - i}`, calendarYear: `${2024 - i}`, revenue: (920 - i * 40) * 1e9, netIncome: (180 - i * 15) * 1e9, eps: 104.3 - i * 8 }));

// ─── HELPERS ───────────────────────────────────────────────
const fmt = (n, d = 2) => n != null ? Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtPct = (n) => n != null ? `${Number(n).toFixed(2)}%` : "—";

const ACTION_COLORS = { "Strong Buy": "#00d4aa", "Buy": "#4ade80", "Hold": "#fbbf24", "Avoid": "#f87171" };
const RISK_COLORS   = { Low: "#4ade80", Medium: "#fbbf24", High: "#f87171" };
const MARKET_FLAG   = { US: "🇺🇸", IN: "🇮🇳" };

async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(`/api${path}`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Direct FMP data fetchers - bypass backend entirely
async function getQuote(symbol) { return apiCall(`/stocks/quote/${encodeURIComponent(symbol)}`); }
async function getProfile(symbol) { return apiCall(`/stocks/profile/${encodeURIComponent(symbol)}`); }
async function getRatios(symbol) { return apiCall(`/stocks/ratios/${encodeURIComponent(symbol)}`); }
async function getIncome(symbol) { return apiCall(`/stocks/income/${encodeURIComponent(symbol)}`); }
async function getHistory(symbol, period) { return apiCall(`/stocks/history/${encodeURIComponent(symbol)}?period=${period}`); }
async function searchStocks(q) { return apiCall(`/stocks/search?q=${encodeURIComponent(q)}`); }
async function getScore(symbol) { return apiCall(`/stocks/score/${encodeURIComponent(symbol)}`); }

function computeScoreFrontend({q, r, inc, indian}) {
  const scores = {};
  const pe = r.peRatioTTM || q.pe;
  const peGood=indian?18:15, peFair=indian?30:25, peHigh=indian?50:40;
  let v=10;
  if(pe>0&&pe<peGood)v+=10; else if(pe>0&&pe<peFair)v+=6; else if(pe>0&&pe<peHigh)v+=2; else v-=2;
  const pb=r.priceToBookRatioTTM;
  if(pb>0&&pb<2)v+=2; else if(pb>0&&pb<5)v+=1;
  scores.valuation=Math.max(0,Math.min(20,v));
  let g=10;
  if(inc.length>=2){
    const rg=inc[0].revenue>0?(inc[0].revenue-inc[1].revenue)/Math.abs(inc[1].revenue):0;
    const eg=inc[0].eps>0?(inc[0].eps-inc[1].eps)/Math.abs(inc[1].eps):0;
    if(rg>0.2)g+=6; else if(rg>0.1)g+=4; else if(rg>0)g+=2; else g-=3;
    if(eg>0.2)g+=4; else if(eg>0)g+=2; else g-=2;
  }
  scores.growth=Math.max(0,Math.min(20,g));
  let p=10; const nm=r.netProfitMarginTTM,roe=r.returnOnEquityTTM;
  if(nm>0.2)p+=5; else if(nm>0.1)p+=3; else if(nm>0)p+=1; else p-=4;
  if(roe>0.2)p+=5; else if(roe>0.1)p+=3; else if(roe>0)p+=1; else p-=3;
  scores.profitability=Math.max(0,Math.min(20,p));
  let d=8; const de=r.debtEquityRatioTTM,cr=r.currentRatioTTM;
  if(de>=0&&de<0.5)d+=5; else if(de<1)d+=3; else if(de<2)d+=1; else d-=3;
  if(cr>2)d+=2; else if(cr>1)d+=1; else d-=2;
  scores.debt=Math.max(0,Math.min(15,d));
  let m=5;
  if(q.price&&q.yearHigh&&q.yearLow){
    const pos=(q.yearHigh-q.yearLow)>0?(q.price-q.yearLow)/(q.yearHigh-q.yearLow):0.5;
    if(pos>0.7)m+=5; else if(pos>0.4)m+=3; else m+=1;
    m+=q.changesPercentage>0?1:-1;
  }
  scores.momentum=Math.max(0,Math.min(10,m));
  const posE=inc.filter(i=>i.netIncome>0).length;
  scores.earnings=Math.max(0,Math.min(10,Math.round(5+(posE/Math.max(inc.length,1))*5)));
  const dy=r.dividendYielTTM||r.dividendYieldTTM||0,pr=r.payoutRatioTTM||0;
  scores.dividend=dy>0.01&&dy<(indian?0.08:0.06)&&pr<0.7?5:dy>0?2:0;
  const total=Object.values(scores).reduce((a,b)=>a+b,0);
  const action=total>=78?"Strong Buy":total>=62?"Buy":total>=45?"Hold":"Avoid";
  const risks=[];
  if(pe>peHigh)risks.push(`Elevated valuation (P/E > ${peHigh})`);
  if((de||0)>2)risks.push("High debt-to-equity ratio");
  if((nm||0)<0)risks.push("Company currently unprofitable");
  if((cr||1)<1)risks.push("Liquidity concern (current ratio < 1)");
  if(inc.length>=2&&inc[0].revenue<inc[1].revenue)risks.push("Revenue declining YoY");
  return {
    total:Math.round(total),max:100,breakdown:scores,action,
    confidence:total>=78?"High":total>=62?"Medium-High":total>=45?"Medium":"Low",
    risks, signal:total>=62?"Buy":total>=45?"Hold":"Avoid",
    riskRating:d<6||(nm||0)<0?"High":total>=60?"Low":"Medium",
    market:indian?"IN":"US"
  };
}

function getMockQuote(symbol) {
  const norm = normaliseSymbol(symbol);
  return MOCK_STOCKS[norm]?.quote?.[0] || MOCK_STOCKS[symbol]?.quote?.[0] || null;
}
function getMockProfile(symbol) {
  const norm = normaliseSymbol(symbol);
  return MOCK_STOCKS[norm]?.profile?.[0] || MOCK_STOCKS[symbol]?.profile?.[0] || null;
}

// ─── SMALL COMPONENTS ──────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function MarketBadge({ symbol }) {
  const market = detectMarket(symbol);
  const isIndian = market === "IN";
  return (
    <span style={{ background: isIndian ? "#ff671722" : "#0099ff22", color: isIndian ? "#ff9933" : "#0099ff", border: `1px solid ${isIndian ? "#ff993344" : "#0099ff44"}`, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
      {MARKET_FLAG[market]} {isIndian ? "NSE/BSE" : "US"}
    </span>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 12, padding: "14px 16px", flex: "1 1 auto", minWidth: 90 }}>
      <div style={{ color: "#6b7899", fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{ color: accent || "#e8eaf6", fontSize: 17, fontWeight: 800, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ScoreRing({ score, max = 100 }) {
  const pct = (score / max) * 100;
  const r = 40, circ = 2 * Math.PI * r;
  const color = pct >= 70 ? "#00d4aa" : pct >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle cx={48} cy={48} r={r} fill="none" stroke="#1e2535" strokeWidth={7} />
        <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round" transform="rotate(-90 48 48)" style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "monospace" }}>{score}</div>
        <div style={{ fontSize: 9, color: "#6b7899" }}>/{max}</div>
      </div>
    </div>
  );
}

function BreakdownBar({ label, val, max, color }) {
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "#8892b0" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "monospace" }}>{val}/{max}</span>
      </div>
      <div style={{ background: "#1e2535", borderRadius: 99, height: 4, overflow: "hidden" }}>
        <div style={{ background: color, width: `${(val / max) * 100}%`, height: "100%", borderRadius: 99, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

// Popular stocks quick-pick panel
const POPULAR_US = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META", "BRK.B"];
const POPULAR_IN = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "WIPRO", "TATAMOTORS"];

function SearchBar({ onSelect, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("US");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (q.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const combined = await searchStocks(q);
      setResults(combined || []);
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const popular = tab === "US" ? POPULAR_US : POPULAR_IN;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080b12f0", zIndex: 500, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 12px", display: "flex", gap: 10, alignItems: "center" }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search symbol or company…"
          style={{ flex: 1, background: "#0f1117", border: "1px solid #2d3748", borderRadius: 12, color: "#e8eaf6", padding: "14px 16px", fontSize: 16, outline: "none", WebkitAppearance: "none" }} />
        <button onClick={onClose} style={{ background: "#1e2535", border: "none", color: "#8892b0", borderRadius: 10, padding: "14px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0, minHeight: 48 }}>Cancel</button>
      </div>

      {/* Market tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px" }}>
        {["US", "IN"].map(m => (
          <button key={m} onClick={() => setTab(m)}
            style={{ background: tab === m ? "#1e2535" : "transparent", color: tab === m ? "#e8eaf6" : "#4a5568", border: `1px solid ${tab === m ? "#2d3748" : "transparent"}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 36 }}>
            {MARKET_FLAG[m]} {m === "US" ? "US Markets" : "India NSE/BSE"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }}>
        {/* Popular picks when no query */}
        {q.length === 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>POPULAR {tab === "US" ? "US" : "INDIAN"} STOCKS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {popular.map(sym => (
                <button key={sym} onClick={() => { onSelect(tab === "IN" ? sym + ".NS" : sym); onClose(); }}
                  style={{ background: "#0f1117", border: "1px solid #1e2535", color: "#00d4aa", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "monospace", minHeight: 40 }}>
                  {sym}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 8 }}>
              {tab === "IN" ? "Tip: Indian stocks use .NS suffix (e.g. RELIANCE.NS) — we add it automatically" : "Type a symbol or company name to search"}
            </div>
          </div>
        )}

        {loading && <div style={{ padding: "20px 0", color: "#6b7899", textAlign: "center", fontSize: 14 }}>Searching…</div>}

        {results.map(r => (
          <div key={r.symbol} onClick={() => { onSelect(r.symbol); onClose(); }}
            style={{ padding: "14px 0", borderBottom: "1px solid #1e2535", display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
            <div style={{ minWidth: 80 }}>
              <div style={{ fontWeight: 800, color: "#00d4aa", fontFamily: "monospace", fontSize: 14 }}>{r.symbol}</div>
              <div style={{ fontSize: 10, color: r.market === "IN" ? "#ff9933" : "#0099ff", marginTop: 2 }}>{MARKET_FLAG[r.market]} {r.market}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#e8eaf6", fontSize: 13 }}>{r.name}</div>
              <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>{r.exchangeShortName || r.exchange}</div>
            </div>
          </div>
        ))}

        {!loading && q.length > 0 && results.length === 0 && (
          <div style={{ padding: "24px 0", color: "#4a5568", textAlign: "center", fontSize: 14 }}>
            No results for "{q}"
            <div style={{ fontSize: 12, marginTop: 6 }}>Try adding .NS for Indian stocks (e.g. INFY.NS)</div>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceChart({ symbol }) {
  const [data, setData] = useState([]);
  const [period, setPeriod] = useState("1year");
  const [loading, setLoading] = useState(true);
  const isIndian = detectMarket(symbol) === "IN";
  const currency = getCurrency(symbol);

  useEffect(() => {
    setLoading(true);
    const norm = normaliseSymbol(symbol);
    getHistory(norm, period).then(d => {
      if (d && d.length > 0) {
        setData(d.slice().reverse().map(p => ({ date: p.date?.slice(5), price: p.close })));
      } else {
        const mock = isIndian ? MOCK_HISTORY_IN : MOCK_HISTORY_US;
        setData(mock.map(p => ({ date: p.date?.slice(5), price: p.close })));
      }
      setLoading(false);
    });
  }, [symbol, period, isIndian]);

  const isUp = data.length >= 2 && data[data.length - 1]?.price >= data[0]?.price;
  const color = isUp ? "#00d4aa" : "#f87171";
  const periods = ["1month", "3months", "6months", "1year", "3years"];

  return (
    <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: "20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, color: "#e8eaf6", fontSize: 14, fontWeight: 700 }}>Price History</h3>
        <div style={{ display: "flex", gap: 3 }}>
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ background: period === p ? "#1e2535" : "transparent", color: period === p ? "#00d4aa" : "#6b7899", border: "1px solid " + (period === p ? "#2d3748" : "transparent"), borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, minHeight: 32 }}>
              {p.replace("months","M").replace("month","M").replace("year","Y").replace("years","Y")}
            </button>
          ))}
        </div>
      </div>
      {loading
        ? <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a5568" }}>Loading…</div>
        : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis dataKey="date" tick={{ fill: "#4a5568", fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#4a5568", fontSize: 9 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${currency}${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} domain={["auto","auto"]} width={52} />
              <Tooltip contentStyle={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#6b7899" }} itemStyle={{ color }}
                formatter={v => [`${currency}${fmt(v)}`, "Price"]} />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#cg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
    </div>
  );
}

function RevenueChart({ symbol }) {
  const [data, setData] = useState([]);
  const isIndian = detectMarket(symbol) === "IN";

  useEffect(() => {
    const norm = normaliseSymbol(symbol);
    getIncome(norm).then(d => {
      const src = (d && d.length > 0) ? d : (isIndian ? MOCK_INCOME_IN : MOCK_INCOME_US);
      setData(src.slice().reverse().map(i => ({
        year: i.calendarYear || i.date?.slice(0, 4),
        revenue: parseFloat((i.revenue / 1e9).toFixed(1)),
        netIncome: parseFloat((i.netIncome / 1e9).toFixed(1)),
      })));
    });
  }, [symbol, isIndian]);

  const unit = isIndian ? "₹B" : "$B";

  return (
    <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: "20px 16px" }}>
      <h3 style={{ margin: "0 0 16px", color: "#e8eaf6", fontSize: 14, fontWeight: 700 }}>Revenue & Net Income ({unit})</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: "#4a5568", fontSize: 10 }} tickLine={false} />
          <YAxis tick={{ fill: "#4a5568", fontSize: 9 }} tickLine={false} axisLine={false}
            tickFormatter={v => `${unit.slice(0,1)}${v}B`} width={44} />
          <Tooltip contentStyle={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 8, fontSize: 12 }}
            formatter={(v, n) => [`${unit.slice(0,1)}${v}B`, n === "revenue" ? "Revenue" : "Net Income"]} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#6b7899" }} />
          <Bar dataKey="revenue" fill="#2d3f7e" radius={[4,4,0,0]} name="revenue" />
          <Bar dataKey="netIncome" fill="#00d4aa" radius={[4,4,0,0]} name="netIncome" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AIAnalysis({ symbol }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const norm = normaliseSymbol(symbol);

  const generate = async () => {
    setLoading(true);
    const data = await apiFetch(`/analysis/generate/${encodeURIComponent(norm)}`, { method: "POST" });
    setAnalysis(data?.analysis || "⚠️ Could not generate analysis. Make sure your backend is running with ANTHROPIC_API_KEY set.");
    setGenerated(true);
    setLoading(false);
  };

  const formatted = analysis
    .replace(/## (.+)/g, '<div style="color:#00d4aa;margin:16px 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">$1</div>')
    .replace(/• (.+)/g, '<div style="margin:4px 0;color:#8892b0;padding-left:12px;">• $1</div>')
    .replace(/\n\n/g, '<div style="height:8px"></div>');

  return (
    <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: "20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: "#e8eaf6", fontSize: 14, fontWeight: 700 }}>AI Research Analysis</h3>
          <p style={{ margin: "3px 0 0", color: "#4a5568", fontSize: 11 }}>Powered by Claude · Not financial advice</p>
        </div>
        <button onClick={generate} disabled={loading}
          style={{ background: loading ? "#1e2535" : "linear-gradient(135deg,#00d4aa,#0099ff)", color: loading ? "#4a5568" : "#fff", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", flexShrink: 0, minHeight: 44 }}>
          {loading ? "Generating…" : generated ? "Refresh" : "Generate"}
        </button>
      </div>
      {generated && <div style={{ borderTop: "1px solid #1e2535", paddingTop: 14, color: "#8892b0", fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: formatted }} />}
      {!generated && !loading && (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#4a5568" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
          <div style={{ fontSize: 13 }}>Tap "Generate" for an AI research report on {symbol}</div>
        </div>
      )}
    </div>
  );
}

// ─── PAGES ─────────────────────────────────────────────────

function DashboardPage({ watchlist, onRemoveWatch, onNavigate }) {
  const [quotes, setQuotes] = useState({});
  const [scores, setScores] = useState({});

  useEffect(() => {
    watchlist.forEach(async sym => {
      const norm = normaliseSymbol(sym);
      const q = await getQuote(norm);
      setQuotes(prev => ({ ...prev, [sym]: q?.[0] || getMockQuote(sym) || {} }));
      const s = await getScore(norm);
      setScores(prev => ({ ...prev, [sym]: s || MOCK_SCORE }));
    });
  }, [watchlist]);

  if (watchlist.length === 0) return (
    <div style={{ textAlign: "center", padding: "80px 0", color: "#4a5568" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, marginBottom: 6, color: "#6b7899" }}>Your watchlist is empty</div>
      <div style={{ fontSize: 13 }}>Tap 🔍 Search to find US or Indian stocks</div>
    </div>
  );

  // Group by market
  const usStocks = watchlist.filter(s => detectMarket(s) === "US");
  const inStocks = watchlist.filter(s => detectMarket(s) === "IN");

  const StockCard = ({ sym }) => {
    const q = quotes[sym] || {};
    const s = scores[sym] || {};
    const isUp = (q.changesPercentage || 0) >= 0;
    const currency = getCurrency(sym);
    const isIndian = detectMarket(sym) === "IN";
    return (
      <div onClick={() => onNavigate("detail", sym)}
        style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: 16, cursor: "pointer", WebkitTapHighlightColor: "transparent", marginBottom: 10 }}
        onTouchStart={e => e.currentTarget.style.borderColor = "#2d3748"}
        onTouchEnd={e => e.currentTarget.style.borderColor = "#1e2535"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#00d4aa", fontFamily: "monospace" }}>{sym.replace(".NS","").replace(".BO","")}</div>
              <MarketBadge symbol={sym} />
            </div>
            <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>{q.name?.slice(0, 26) || "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#e8eaf6", fontFamily: "monospace" }}>{currency}{fmt(q.price)}</div>
            <div style={{ fontSize: 12, color: isUp ? "#4ade80" : "#f87171", fontWeight: 600 }}>{isUp ? "▲" : "▼"} {Math.abs(q.changesPercentage || 0).toFixed(2)}%</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
          <div><div style={{ fontSize: 9, color: "#4a5568", marginBottom: 1 }}>MKT CAP</div><div style={{ fontSize: 12, fontWeight: 700, color: "#8892b0" }}>{fmtC(q.marketCap, sym)}</div></div>
          <div><div style={{ fontSize: 9, color: "#4a5568", marginBottom: 1 }}>P/E</div><div style={{ fontSize: 12, fontWeight: 700, color: "#8892b0" }}>{q.pe?.toFixed(1) || "—"}</div></div>
          <div><div style={{ fontSize: 9, color: "#4a5568", marginBottom: 1 }}>EPS</div><div style={{ fontSize: 12, fontWeight: 700, color: "#8892b0" }}>{currency}{q.eps?.toFixed(isIndian ? 1 : 2) || "—"}</div></div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {s.action && <Badge label={s.action} color={ACTION_COLORS[s.action] || "#8892b0"} />}
            {s.riskRating && <Badge label={s.riskRating + " Risk"} color={RISK_COLORS[s.riskRating] || "#8892b0"} />}
          </div>
          <button onClick={e => { e.stopPropagation(); onRemoveWatch(sym); }}
            style={{ background: "transparent", border: "1px solid #2d3748", color: "#6b7899", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, minHeight: 36 }}>
            Remove
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {inStocks.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#ff9933", fontWeight: 700, letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            🇮🇳 INDIAN STOCKS
          </div>
          {inStocks.map(sym => <StockCard key={sym} sym={sym} />)}
        </div>
      )}
      {usStocks.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#0099ff", fontWeight: 700, letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            🇺🇸 US STOCKS
          </div>
          {usStocks.map(sym => <StockCard key={sym} sym={sym} />)}
        </div>
      )}
    </div>
  );
}

function StockDetailPage({ symbol, onAddWatch, watchlist }) {
  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [score, setScore] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const norm = normaliseSymbol(symbol);
  const isIndian = detectMarket(symbol) === "IN";
  const currency = getCurrency(symbol);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getQuote(norm),
      getProfile(norm),
      getScore(norm),
      getRatios(norm),
    ]).then(([q, p, s, r]) => {
      setQuote(q?.[0] || getMockQuote(symbol) || {});
      setProfile(p?.[0] || getMockProfile(symbol) || {});
      setScore(s || MOCK_SCORE);
      setMetrics(r?.[0] || {});
      setLoading(false);
    });
  }, [symbol, norm]);

  if (loading) return <div style={{ textAlign: "center", padding: 64, color: "#4a5568" }}>Loading {symbol}…</div>;

  const isUp = (quote?.changesPercentage || 0) >= 0;
  const inWatch = watchlist.includes(symbol);
  const displaySymbol = symbol.replace(".NS","").replace(".BO","");

  const scoreBreakdownConfig = [
    { key: "valuation", label: "Valuation", max: 20 },
    { key: "growth", label: "Growth", max: 20 },
    { key: "profitability", label: "Profitability", max: 20 },
    { key: "debt", label: "Debt Health", max: 15 },
    { key: "momentum", label: "Momentum", max: 10 },
    { key: "earnings", label: "Earnings", max: 10 },
    { key: "dividend", label: "Dividend", max: 5 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header card */}
      <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#e8eaf6", fontFamily: "monospace", lineHeight: 1 }}>{displaySymbol}</div>
              <MarketBadge symbol={symbol} />
            </div>
            <div style={{ color: "#6b7899", marginTop: 4, fontSize: 12 }}>{profile?.companyName}</div>
            <div style={{ color: "#4a5568", fontSize: 11 }}>{profile?.sector} · {profile?.industry}</div>
            <div style={{ color: "#4a5568", fontSize: 10, marginTop: 2 }}>Exchange: {profile?.exchange || (isIndian ? "NSE" : "—")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#e8eaf6", fontFamily: "monospace" }}>{currency}{fmt(quote?.price)}</div>
            <div style={{ fontSize: 13, color: isUp ? "#4ade80" : "#f87171", fontWeight: 700 }}>{isUp ? "▲" : "▼"} {Math.abs(quote?.changesPercentage || 0).toFixed(2)}% today</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {score?.action && <Badge label={score.action} color={ACTION_COLORS[score.action] || "#8892b0"} />}
            {score?.riskRating && <Badge label={score.riskRating + " Risk"} color={RISK_COLORS[score.riskRating] || "#8892b0"} />}
          </div>
          <button onClick={() => onAddWatch(symbol)} disabled={inWatch}
            style={{ background: inWatch ? "#1e2535" : "linear-gradient(135deg,#00d4aa,#0099ff)", color: inWatch ? "#4a5568" : "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: inWatch ? "not-allowed" : "pointer", minHeight: 44 }}>
            {inWatch ? "✓ Watching" : "+ Watchlist"}
          </button>
        </div>
      </div>

      {/* Metrics 2-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MetricCard label="Market Cap" value={fmtC(quote?.marketCap, symbol)} />
        <MetricCard label="P/E Ratio" value={quote?.pe?.toFixed(1) || "—"} />
        <MetricCard label="EPS" value={`${currency}${fmt(quote?.eps)}`} />
        <MetricCard label="Net Margin" value={fmtPct((metrics?.netProfitMarginTTM || 0) * 100)} />
        <MetricCard label="52W High" value={`${currency}${fmt(quote?.yearHigh)}`} accent="#4ade80" />
        <MetricCard label="52W Low" value={`${currency}${fmt(quote?.yearLow)}`} accent="#f87171" />
        <MetricCard label="ROE" value={fmtPct((metrics?.returnOnEquityTTM || 0) * 100)} />
        <MetricCard label="Debt/Equity" value={metrics?.debtEquityRatioTTM?.toFixed(2) || "—"} />
      </div>

      {/* Score panel */}
      <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <ScoreRing score={score?.total || 0} />
          <div>
            <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 1, marginBottom: 3 }}>STOCKPICK SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: ACTION_COLORS[score?.action] || "#e8eaf6" }}>{score?.action}</div>
            <div style={{ fontSize: 12, color: "#6b7899" }}>Confidence: {score?.confidence}</div>
          </div>
        </div>
        {scoreBreakdownConfig.map(({ key, label, max }) => {
          const val = score?.breakdown?.[key] || 0;
          const pct = val / max;
          const col = pct >= 0.7 ? "#00d4aa" : pct >= 0.4 ? "#fbbf24" : "#f87171";
          return <BreakdownBar key={key} label={label} val={val} max={max} color={col} />;
        })}
        {score?.risks?.length > 0 && (
          <div style={{ borderTop: "1px solid #1e2535", paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>KEY RISKS</div>
            {score.risks.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#8892b0", marginBottom: 3 }}>• {r}</div>)}
          </div>
        )}
      </div>

      <PriceChart symbol={symbol} />
      <RevenueChart symbol={symbol} />

      <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 16, padding: 16 }}>
        <h3 style={{ margin: "0 0 10px", color: "#e8eaf6", fontSize: 14, fontWeight: 700 }}>About {profile?.companyName}</h3>
        <p style={{ margin: 0, color: "#8892b0", fontSize: 13, lineHeight: 1.7 }}>{profile?.description || "No description available."}</p>
      </div>

      <AIAnalysis symbol={symbol} />
    </div>
  );
}

function ComparePage({ onNavigate }) {
  const [symbols, setSymbols] = useState(["AAPL", "TCS.NS"]);
  const [data, setData] = useState({});
  const [newSym, setNewSym] = useState("");

  const loadStock = useCallback(async (sym) => {
    const norm = normaliseSymbol(sym);
    const [q, s, r] = await Promise.all([
      getQuote(norm),
      getScore(norm),
      getRatios(norm),
    ]);
    setData(prev => ({
      ...prev,
      [sym]: {
        quote: q?.[0] || getMockQuote(sym) || {},
        score: s || MOCK_SCORE,
        ratios: r?.[0] || {},
        currency: getCurrency(sym),
        market: detectMarket(sym),
      }
    }));
  }, []);

  useEffect(() => { symbols.forEach(loadStock); }, [symbols, loadStock]);

  const addSymbol = () => {
    const s = newSym.trim();
    const norm = normaliseSymbol(s);
    if (s && !symbols.find(x => normaliseSymbol(x) === norm) && symbols.length < 4) {
      const key = detectMarket(s) === "IN" && !s.includes(".") ? s + ".NS" : s.toUpperCase();
      setSymbols([...symbols, key]);
      loadStock(key);
      setNewSym("");
    }
  };

  const metrics = [
    { label: "Market", get: (d, sym) => <MarketBadge symbol={sym} /> },
    { label: "Price", get: (d) => `${d.currency}${fmt(d.quote?.price)}` },
    { label: "Daily Chg", get: (d) => { const v = d.quote?.changesPercentage; return <span style={{ color: v >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{v >= 0 ? "▲" : "▼"}{Math.abs(v||0).toFixed(2)}%</span>; } },
    { label: "Mkt Cap", get: (d, sym) => fmtC(d.quote?.marketCap, sym) },
    { label: "P/E", get: (d) => d.quote?.pe?.toFixed(1) || "—" },
    { label: "EPS", get: (d) => `${d.currency}${fmt(d.quote?.eps)}` },
    { label: "52W Hi", get: (d) => `${d.currency}${fmt(d.quote?.yearHigh)}` },
    { label: "52W Lo", get: (d) => `${d.currency}${fmt(d.quote?.yearLow)}` },
    { label: "Net Mgn", get: (d) => fmtPct((d.ratios?.netProfitMarginTTM||0)*100) },
    { label: "ROE", get: (d) => fmtPct((d.ratios?.returnOnEquityTTM||0)*100) },
    { label: "D/E", get: (d) => d.ratios?.debtEquityRatioTTM?.toFixed(2) || "—" },
    { label: "Score", get: (d) => <span style={{ fontWeight: 800, color: "#00d4aa" }}>{d.score?.total||"—"}/100</span> },
    { label: "Signal", get: (d) => d.score?.action ? <Badge label={d.score.action} color={ACTION_COLORS[d.score.action]} /> : "—" },
    { label: "Risk", get: (d) => d.score?.riskRating ? <Badge label={d.score.riskRating} color={RISK_COLORS[d.score.riskRating]} /> : "—" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 3px", fontSize: 24, fontWeight: 900, color: "#e8eaf6" }}>Compare</h2>
        <p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>Mix US 🇺🇸 and Indian 🇮🇳 stocks</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={newSym} onChange={e => setNewSym(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addSymbol()}
          placeholder="Add symbol (e.g. NVDA or INFY)"
          style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 8, color: "#e8eaf6", padding: "10px 12px", fontSize: 14, outline: "none", flex: 1, minWidth: 120, WebkitAppearance: "none" }} />
        <button onClick={addSymbol} style={{ background: "#1e2535", color: "#00d4aa", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44 }}>Add</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {symbols.map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, background: "#1e2535", borderRadius: 8, padding: "7px 12px" }}>
            <span style={{ fontSize: 10 }}>{MARKET_FLAG[detectMarket(s)]}</span>
            <span style={{ color: "#00d4aa", fontWeight: 800, fontSize: 13, fontFamily: "monospace", cursor: "pointer" }} onClick={() => onNavigate("detail", s)}>{s.replace(".NS","").replace(".BO","")}</span>
            <button onClick={() => setSymbols(symbols.filter(x => x !== s))} style={{ background: "none", border: "none", color: "#6b7899", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", minHeight: 24 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 16, border: "1px solid #1e2535" }}>
        <table style={{ borderCollapse: "collapse", minWidth: symbols.length > 2 ? 500 : "100%", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2535" }}>
              <th style={{ padding: "12px 14px", textAlign: "left", color: "#4a5568", fontSize: 11, fontWeight: 600, background: "#0f1117", position: "sticky", left: 0, zIndex: 1, whiteSpace: "nowrap" }}>METRIC</th>
              {symbols.map(s => (
                <th key={s} style={{ padding: "12px 14px", textAlign: "center", color: "#00d4aa", fontSize: 14, fontWeight: 900, fontFamily: "monospace", cursor: "pointer", background: "#0f1117", minWidth: 90 }}
                  onClick={() => onNavigate("detail", s)}>
                  <div>{s.replace(".NS","").replace(".BO","")}</div>
                  <div style={{ fontSize: 9, color: detectMarket(s) === "IN" ? "#ff9933" : "#0099ff", fontFamily: "sans-serif", fontWeight: 600 }}>{MARKET_FLAG[detectMarket(s)]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(({ label, get }, i) => (
              <tr key={label} style={{ borderBottom: "1px solid #0a0d14", background: i % 2 === 0 ? "#0f1117" : "#080b12" }}>
                <td style={{ padding: "10px 14px", color: "#6b7899", fontSize: 12, position: "sticky", left: 0, background: i % 2 === 0 ? "#0f1117" : "#080b12", zIndex: 1, whiteSpace: "nowrap" }}>{label}</td>
                {symbols.map(s => (
                  <td key={s} style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#e8eaf6" }}>
                    {data[s] ? get(data[s], s) : <span style={{ color: "#2d3748" }}>…</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "#4a5568", textAlign: "center" }}>
        Note: Cross-market comparisons use local currencies ($ vs ₹) — P/E and ratios are directly comparable
      </div>
    </div>
  );
}

function PortfolioPage() {
  const [holdings, setHoldings] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [form, setForm] = useState({ symbol: "", shares: "", buy_price: "", buy_date: "", notes: "" });
  const [adding, setAdding] = useState(false);
  const [marketFilter, setMarketFilter] = useState("ALL");

  useEffect(() => {
    apiFetch("/portfolio").then(d => { if (d && d.length > 0) setHoldings(d); });
  }, []);

  useEffect(() => {
    [...new Set(holdings.map(h => h.symbol))].forEach(async sym => {
      const norm = normaliseSymbol(sym);
      const q = await getQuote(norm);
      setQuotes(prev => ({ ...prev, [sym]: q?.[0] || getMockQuote(sym) || {} }));
    });
  }, [holdings]);

  const addHolding = async () => {
    if (!form.symbol || !form.shares || !form.buy_price || !form.buy_date) return;
    const sym = detectMarket(form.symbol) === "IN" && !form.symbol.includes(".")
      ? form.symbol.toUpperCase() + ".NS" : form.symbol.toUpperCase();
    const data = await apiFetch("/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, symbol: sym }) });
    const entry = data || { ...form, id: Date.now(), symbol: sym, shares: parseFloat(form.shares), buy_price: parseFloat(form.buy_price) };
    setHoldings([...holdings, entry]);
    setForm({ symbol: "", shares: "", buy_price: "", buy_date: "", notes: "" });
    setAdding(false);
  };

  const removeHolding = async (id) => {
    await apiFetch(`/portfolio/${id}`, { method: "DELETE" });
    setHoldings(holdings.filter(h => h.id !== id));
  };

  const enriched = holdings.map(h => {
    const currentPrice = quotes[h.symbol]?.price || h.buy_price;
    const currentValue = currentPrice * h.shares;
    const costBasis = h.buy_price * h.shares;
    const gainLoss = currentValue - costBasis;
    const market = detectMarket(h.symbol);
    const currency = getCurrency(h.symbol);
    return { ...h, currentPrice, currentValue, costBasis, gainLoss, gainLossPct: (gainLoss / costBasis) * 100, market, currency };
  });

  const filtered = marketFilter === "ALL" ? enriched : enriched.filter(h => h.market === marketFilter);

  // Separate totals by market
  const usTotalValue = enriched.filter(h => h.market === "US").reduce((a, h) => a + h.currentValue, 0);
  const inTotalValue = enriched.filter(h => h.market === "IN").reduce((a, h) => a + h.currentValue, 0);
  const totalGL = enriched.reduce((a, h) => a + h.gainLoss, 0);
  const totalCost = enriched.reduce((a, h) => a + h.costBasis, 0);
  const totalGLPct = totalCost > 0 ? (totalGL / totalCost) * 100 : 0;

  const inputStyle = { background: "#0f1117", border: "1px solid #1e2535", borderRadius: 8, color: "#e8eaf6", padding: "12px 14px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box", WebkitAppearance: "none" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: "#e8eaf6" }}>Portfolio</h2>
          <p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>US 🇺🇸 & Indian 🇮🇳 holdings</p>
        </div>
        <button onClick={() => setAdding(!adding)}
          style={{ background: "linear-gradient(135deg,#00d4aa,#0099ff)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44 }}>
          + Add
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {usTotalValue > 0 && <MetricCard label="🇺🇸 US Value" value={`$${(usTotalValue/1000).toFixed(1)}k`} />}
        {inTotalValue > 0 && <MetricCard label="🇮🇳 India Value" value={`₹${(inTotalValue/1000).toFixed(1)}k`} />}
        <MetricCard label="Overall G/L" value={totalGL >= 0 ? `+${totalGL.toFixed(0)}` : totalGL.toFixed(0)} accent={totalGL >= 0 ? "#4ade80" : "#f87171"} sub={`${totalGLPct >= 0 ? "+" : ""}${totalGLPct.toFixed(2)}%`} />
        <MetricCard label="Positions" value={holdings.length} />
      </div>

      {/* Market filter */}
      {enriched.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["ALL","US","IN"].map(m => (
            <button key={m} onClick={() => setMarketFilter(m)}
              style={{ background: marketFilter === m ? "#1e2535" : "transparent", color: marketFilter === m ? "#e8eaf6" : "#4a5568", border: `1px solid ${marketFilter === m ? "#2d3748" : "transparent"}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 36 }}>
              {m === "ALL" ? "All" : MARKET_FLAG[m] + " " + m}
            </button>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 12px", color: "#e8eaf6", fontSize: 14 }}>Add New Position</h3>
          <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 10, lineHeight: 1.6 }}>
            💡 For Indian stocks, enter the NSE symbol (e.g. <span style={{ color: "#ff9933" }}>RELIANCE</span> or <span style={{ color: "#ff9933" }}>RELIANCE.NS</span>). For US stocks, use the ticker (e.g. <span style={{ color: "#0099ff" }}>AAPL</span>).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {[["symbol","Symbol (e.g. AAPL or RELIANCE)","text"],["shares","Shares","number"],["buy_price","Buy Price","number"],["buy_date","Date Bought","date"]].map(([k,ph,tp]) => (
              <div key={k}>
                <label style={{ fontSize: 11, color: "#4a5568", display: "block", marginBottom: 4 }}>{ph}</label>
                <input type={tp} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} placeholder={ph} style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addHolding} style={{ background: "#00d4aa", color: "#000", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", flex: 1, minHeight: 48 }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ background: "transparent", color: "#6b7899", border: "1px solid #2d3748", borderRadius: 8, padding: "12px 20px", fontSize: 14, cursor: "pointer", minHeight: 48 }}>Cancel</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#4a5568" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>💼</div>
          <div style={{ fontSize: 14 }}>{holdings.length === 0 ? "No positions yet. Tap + Add to start." : `No ${marketFilter} positions.`}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(h => (
            <div key={h.id} style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#00d4aa", fontFamily: "monospace" }}>{h.symbol.replace(".NS","").replace(".BO","")}</div>
                    <MarketBadge symbol={h.symbol} />
                  </div>
                  <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>{h.shares} shares @ {h.currency}{fmt(h.buy_price)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#e8eaf6", fontFamily: "monospace" }}>{h.currency}{fmt(h.currentValue)}</div>
                  <div style={{ fontSize: 13, color: h.gainLoss >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                    {h.gainLoss >= 0 ? "+" : ""}{h.currency}{Math.abs(h.gainLoss).toFixed(0)} ({h.gainLossPct >= 0 ? "+" : ""}{h.gainLossPct.toFixed(1)}%)
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#6b7899" }}>
                  Current: <span style={{ color: "#e8eaf6", fontFamily: "monospace" }}>{h.currency}{fmt(h.currentPrice)}</span>
                </div>
                <button onClick={() => removeHolding(h.id)} style={{ background: "transparent", border: "1px solid #2d3748", color: "#6b7899", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, minHeight: 36 }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  return (
    <div>
      <h2 style={{ margin: "0 0 3px", fontSize: 24, fontWeight: 900, color: "#e8eaf6" }}>Settings</h2>
      <p style={{ margin: "0 0 20px", color: "#4a5568", fontSize: 13 }}>Data powered by Yahoo Finance — no API key needed</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#0f1117", border: "1px solid #00d4aa33", borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", color: "#00d4aa", fontSize: 14, fontWeight: 700 }}>Live Data Active</h3>
          <p style={{ margin: 0, color: "#6b7899", fontSize: 13, lineHeight: 1.6 }}>Stockpick uses Yahoo Finance for all stock data — free, no API key required. Search any stock and tap to view live prices, charts, and analysis.</p>
        </div>
        <div style={{ background: "#0f1117", border: "1px solid #ff993322", borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: "0 0 10px", color: "#ff9933", fontSize: 14, fontWeight: 700 }}>Indian Stocks</h3>
          <div style={{ fontSize: 12, color: "#6b7899", marginBottom: 6 }}>Use NSE symbols with .NS suffix:</div>
          <div style={{ fontSize: 12, color: "#ff9933", fontFamily: "monospace", lineHeight: 1.8 }}>RELIANCE.NS, TCS.NS, INFY.NS, HDFCBANK.NS, ICICIBANK.NS, SBIN.NS, WIPRO.NS, TATAMOTORS.NS</div>
        </div>
        <div style={{ background: "#0f1117", border: "1px solid #0099ff22", borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: "0 0 10px", color: "#0099ff", fontSize: 14, fontWeight: 700 }}>US Stocks</h3>
          <div style={{ fontSize: 12, color: "#6b7899", lineHeight: 1.8 }}>AAPL, MSFT, GOOGL, NVDA, TSLA, AMZN, META, JPM, V, JNJ, WMT, BRK-B</div>
        </div>
        <div style={{ background: "#0f1117", border: "1px solid #1e2535", borderRadius: 14, padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", color: "#e8eaf6", fontSize: 14, fontWeight: 700 }}>AI Analysis</h3>
          <p style={{ margin: 0, color: "#6b7899", fontSize: 12 }}>Powered by Claude (Anthropic). Requires ANTHROPIC_API_KEY set in Vercel environment variables.</p>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────
export default function Stockpick() {
  const [page, setPage] = useState("dashboard");
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [watchlist, setWatchlist] = useState(["AAPL", "RELIANCE.NS", "MSFT", "TCS.NS"]);
  const [searchOpen, setSearchOpen] = useState(false);

  const navigate = (p, sym) => { if (sym) setSelectedSymbol(sym); setPage(p); window.scrollTo(0, 0); };
  const addToWatch = (sym) => { if (!watchlist.includes(sym)) setWatchlist([...watchlist, sym]); };
  const removeFromWatch = (sym) => setWatchlist(watchlist.filter(s => s !== sym));

  const navItems = [
    { id: "dashboard", label: "Home",      icon: "⬡" },
    { id: "watchlist", label: "Watch",     icon: "☆" },
    { id: "compare",   label: "Compare",   icon: "⇄" },
    { id: "portfolio", label: "Portfolio", icon: "◈" },
    { id: "settings",  label: "Settings",  icon: "⚙" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", color: "#e8eaf6", fontFamily: "system-ui,-apple-system,'SF Pro Display',sans-serif", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 20px))" }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { background: #080b12; }
        body { margin: 0; padding: 0; background: #080b12; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #080b12; }
        ::-webkit-scrollbar-thumb { background: #1e2535; border-radius: 2px; }
        input, button { font-family: inherit; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* Safe area top spacer for iPhone notch / Dynamic Island */}
      <div style={{ height: "env(safe-area-inset-top, 44px)", minHeight: 44, background: "#080b12", position: "sticky", top: 0, zIndex: 201 }} />

      {/* Top header */}
      <header style={{ borderBottom: "1px solid #1e2535", paddingLeft: 16, paddingRight: 16, display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: "env(safe-area-inset-top, 44px)", background: "#080b12", zIndex: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#00d4aa,#0099ff)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>◈</div>
          <div>
            <span style={{ fontWeight: 900, fontSize: 17, letterSpacing: -0.3 }}>Stockpick</span>
            <span style={{ fontSize: 9, color: "#4a5568", marginLeft: 6 }}>🇺🇸 🇮🇳</span>
          </div>
        </div>
        <button onClick={() => setSearchOpen(true)}
          style={{ background: "#0f1117", border: "1px solid #1e2535", color: "#6b7899", borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minHeight: 44, WebkitTapHighlightColor: "transparent" }}>
          <span>🔍</span> Search
        </button>
      </header>

      {/* Back button for detail page */}
      {page === "detail" && (
        <div style={{ padding: "10px 16px 0" }}>
          <button onClick={() => setPage("dashboard")}
            style={{ background: "transparent", border: "none", color: "#00d4aa", fontSize: 14, cursor: "pointer", padding: "4px 0", minHeight: 36, fontWeight: 600 }}>
            ← Back
          </button>
        </div>
      )}

      <main style={{ padding: "16px 16px 0", maxWidth: 640, margin: "0 auto" }}>
        {page === "dashboard" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: "#e8eaf6" }}>Dashboard</h2>
              <p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>US 🇺🇸 & Indian 🇮🇳 markets</p>
            </div>
            <DashboardPage watchlist={watchlist} onRemoveWatch={removeFromWatch} onNavigate={navigate} />
          </div>
        )}
        {page === "watchlist" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: "0 0 3px", fontSize: 24, fontWeight: 900, color: "#e8eaf6" }}>Watchlist</h2>
              <p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>Tap a stock to view full analysis</p>
            </div>
            {watchlist.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {watchlist.map(s => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, background: "#1e2535", borderRadius: 8, padding: "7px 12px" }}>
                    <span style={{ fontSize: 10 }}>{MARKET_FLAG[detectMarket(s)]}</span>
                    <span style={{ color: "#00d4aa", fontWeight: 800, fontSize: 13, fontFamily: "monospace", cursor: "pointer" }} onClick={() => navigate("detail", s)}>{s.replace(".NS","").replace(".BO","")}</span>
                    <button onClick={() => removeFromWatch(s)} style={{ background: "none", border: "none", color: "#6b7899", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", minHeight: 24 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <DashboardPage watchlist={watchlist} onRemoveWatch={removeFromWatch} onNavigate={navigate} />
          </div>
        )}
        {page === "detail"    && <StockDetailPage symbol={selectedSymbol} onAddWatch={addToWatch} watchlist={watchlist} />}
        {page === "compare"   && <ComparePage onNavigate={navigate} />}
        {page === "portfolio" && <PortfolioPage />}
        {page === "settings"  && <SettingsPage />}
      </main>

      {/* Bottom tab bar */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#080b12ee", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid #1e2535", display: "flex", zIndex: 300, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ flex: 1, background: "transparent", border: "none", color: page === n.id ? "#00d4aa" : "#4a5568", cursor: "pointer", padding: "10px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "color 0.15s", minHeight: 56 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{n.icon}</span>
            <span style={{ fontSize: 9, fontWeight: page === n.id ? 700 : 500, letterSpacing: 0.3 }}>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Search overlay */}
      {searchOpen && <SearchBar onSelect={sym => navigate("detail", sym)} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
