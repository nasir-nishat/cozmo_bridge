// Parses bs_exp.json → bs_exp_parsed.csv
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./jandi_exp_data/bs_exp.json', 'utf8'));

const WHO_MAP = {
  20409632: 'Gaya',
  33170503: 'John Park',
  34101221: 'Kevin (left)',
  34180917: 'Ricky',
  34199986: 'June',
  34313680: 'Jay',
  31182872: 'Jin',
  31421218: 'User_31421218',
  34758189: 'Euncheol',
  32586852: 'Joy',
  35207386: 'JuneYeonjun',
  35388649: 'Test',
};

// Note: \b word boundaries don't work with Korean (non-ASCII) chars in JS regex.
// Order matters — more specific patterns first.
const CARD_PATTERNS = [
  [/삼성카드/i,  'Samsung Card'],
  [/삼카/i,     'Samsung Card'],
  [/법인카드/i,  'Corporate Card'],
  [/법카/i,     'Corporate Card'],
  [/현금카드/i,  'Hyun Card (Debit)'],
  [/현카/i,     'Hyun Card (Debit)'],
  [/개인카드/i,  'Personal Card'],
  [/개인지출/i,  'Personal Card'],
  [/개인결재/i,  'Personal Card'],
  [/개인/i,     'Personal Card'],   // must come after more specific 개인* patterns
  [/법인/i,     'Corporate Card'],  // must come after 법인카드/법카
  [/현금/i,     'Cash'],            // must come after 현금카드/현카
  [/국민카드/i,  'KB Kookmin Card'],
  [/KB국민/i,   'KB Kookmin Card'],
  [/농협/i,     'Nonghyup Card'],
  [/쿠팡/i,     'Coupang (Online)'],
  [/(?:^|\s)joy(?:\s|$)/i, 'JOY Card'],
];

const PROP_RE = /\b(BS|SG|SJ|SA|SWA|JT|JTS|HT|HTA|HTB|TOUR|YT|L9|F9|B9|FB)\b/;

function extractCard(body) {
  if (!body) return '';
  for (const [re, label] of CARD_PATTERNS) {
    if (re.test(body)) return label;
  }
  return '';
}

function parseAmount(body) {
  if (!body) return '';
  // 만원 multiples: 50만원, 120만원
  const manMatch = body.match(/([0-9,]+)\s*만\s*원/);
  if (manMatch) return parseInt(manMatch[1].replace(/,/g, '')) * 10000;
  // 원-suffixed: 22,000원 / 22000원
  const wonMatch = body.match(/([0-9,]+)\s*원/);
  if (wonMatch) return parseInt(wonMatch[1].replace(/,/g, ''));
  // /exp format: trailing standalone number (with optional commas) before card/name
  // e.g. "/exp 2025-10-28 TOUR 물 15,600 개인" or "/exp ... 가스토치 14,500 COZE"
  const expMatch = body.match(/\b(\d{1,3}(?:,\d{3})+|\d{3,7})\s+(?:법인카드|개인카드|법인|개인|현금|삼카|현카|법카|삼성|COZE|JOY|joy|\S+)?\s*(?:\S+)?\s*$/i);
  if (expMatch) {
    const n = parseInt(expMatch[1].replace(/,/g, ''));
    if (n >= 100) return n;
  }
  return '';
}

function extractProperty(body, defaultProp) {
  if (!body) return defaultProp;
  if (/YT사무실/.test(body)) return 'YT';
  const m = body.match(PROP_RE);
  return m ? m[1] : defaultProp;
}

function extractDescription(body) {
  if (!body) return '';
  let t = body.replace(/\n+/g, ' ').trim();

  // /exp YYYY-MM-DD PROP desc amount card [name]
  if (/^\/exp\s/i.test(t)) {
    t = t.replace(/^\/exp\s+\d{4}-\d{2}-\d{2}\s+/i, '');
    t = t.replace(PROP_RE, '').trim();
    // Remove trailing: AMOUNT CARD [NAME]
    t = t.replace(/\s+\d{3,7}\s+\S.*$/, '').trim();
    return t.replace(/\s+/g, ' ').trim();
  }

  // Remove date prefixes
  t = t.replace(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*/g, '');
  t = t.replace(/^\d{4}[\.\s]\d{2}[\.\s]\d{2}\s+/, '');
  t = t.replace(/^\d{2}\.\d{2}\.\d{2}\s+/, '');
  t = t.replace(/^\d{1,2}월\s*\d{1,2}일\s+/, '');

  // Remove property code at start
  t = t.replace(/^(BS|SG|SJ|SA|SWA|JT|JTS|HT|HTA|HTB|TOUR|YT|L9|F9|B9|FB)\s+/i, '');
  // Remove person name at start if it looks like JUNE/JAY/JONE/GENIE etc
  t = t.replace(/^(JUNE|JONE|JAY|RICKY|JOHN|GENIE|JIN|JOY|GAYA|NISHAT)\s+/i, '');

  // Remove amount + card suffix: 22000원 현카 / 22,000원 / 50만원 현금
  // Also handles underscore-delimited: _1566000원 삼카
  t = t.replace(/[\s_][0-9,]+\s*만\s*원.*$/i, '');
  t = t.replace(/[\s_][0-9,]+\s*원.*$/i, '');
  // Remove standalone trailing number + card (no 원)
  t = t.replace(/\s+\d{3,7}\s+(법인카드|법카|삼성카드|삼카|현금카드|현카|개인카드|개인지출|개인결재|개인|법인|현금|joy).*$/i, '');

  return t.replace(/\s+/g, ' ').trim().replace(/^[-–—\s]+/, '').trim();
}

// Escape CSV field
function esc(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const HEADER = [
  'record_id', 'date', 'property', 'description',
  'amount_krw', 'card_type', 'posted_by',
  'has_image', 'image_count', 'image_names', 'raw_body',
];

const rows = [HEADER.join(',')];

for (const entry of data) {
  const body = entry.body || '';
  const defaultProp = (entry.room.match(/\[([A-Z]+)\]/) || [])[1] || 'BS';

  const property  = extractProperty(body, defaultProp);
  const desc      = extractDescription(body);
  const amount    = parseAmount(body);
  const card      = extractCard(body);
  const who       = WHO_MAP[entry.who] || ('User_' + entry.who);
  const hasImg    = entry.images && entry.images.length > 0;
  const imgCount  = entry.images ? entry.images.length : 0;
  const imgNames  = entry.images ? entry.images.map(i => i.name).join('|') : '';

  rows.push([
    entry.recordId,
    entry.date,
    property,
    esc(desc),
    amount,
    card || 'Not Specified',
    who,
    hasImg ? 'TRUE' : 'FALSE',
    imgCount,
    esc(imgNames),
    esc(body),
  ].join(','));
}

fs.writeFileSync('./jandi_exp_data/bs_exp_parsed.csv', rows.join('\n'), 'utf8');
console.log(`Written ${rows.length - 1} rows.`);

// --- Analysis ---
const parsed = data.map(entry => {
  const body = entry.body || '';
  const defaultProp = (entry.room.match(/\[([A-Z]+)\]/) || [])[1] || 'BS';
  return {
    date: entry.date,
    property: extractProperty(body, defaultProp),
    amount: parseAmount(body),
    card: extractCard(body),
    who: WHO_MAP[entry.who] || ('User_' + entry.who),
    hasImg: entry.images && entry.images.length > 0,
    body,
  };
});

const withAmount = parsed.filter(r => r.amount !== '');
const totalAmount = withAmount.reduce((s, r) => s + Number(r.amount), 0);

console.log('\n=== ANALYSIS ===');
console.log('Total records:', parsed.length);
console.log('Records with amount parsed:', withAmount.length);
console.log('Records image-only (no body):', parsed.filter(r => !r.body).length);
console.log('Total spend (KRW):', totalAmount.toLocaleString('ko-KR'), '원');

// By property
console.log('\nBy Property:');
const byProp = {};
withAmount.forEach(r => { byProp[r.property] = (byProp[r.property] || 0) + Number(r.amount); });
Object.entries(byProp).sort((a,b) => b[1]-a[1]).forEach(([p,amt]) => {
  console.log(` ${p.padEnd(6)} ₩${amt.toLocaleString('ko-KR')}`);
});

// By card type
console.log('\nBy Card Type:');
const byCard = {};
withAmount.forEach(r => { byCard[r.card || 'Not Specified'] = (byCard[r.card || 'Not Specified'] || 0) + Number(r.amount); });
Object.entries(byCard).sort((a,b) => b[1]-a[1]).forEach(([c,amt]) => {
  console.log(` ${c.padEnd(20)} ₩${amt.toLocaleString('ko-KR')}`);
});

// By poster
console.log('\nBy Poster (amount):');
const byWho = {};
withAmount.forEach(r => { byWho[r.who] = (byWho[r.who] || 0) + Number(r.amount); });
Object.entries(byWho).sort((a,b) => b[1]-a[1]).forEach(([w,amt]) => {
  console.log(` ${w.padEnd(20)} ₩${amt.toLocaleString('ko-KR')}`);
});

// By month
console.log('\nBy Month (top 5):');
const byMonth = {};
withAmount.forEach(r => {
  const m = (r.date || '').slice(0, 7);
  if (m) byMonth[m] = (byMonth[m] || 0) + Number(r.amount);
});
Object.entries(byMonth).sort((a,b) => b[1]-a[1]).slice(0,8).forEach(([m,amt]) => {
  console.log(` ${m}  ₩${amt.toLocaleString('ko-KR')}`);
});

// Has image stats
const withImg = parsed.filter(r => r.hasImg);
console.log('\nRecords with image:', withImg.length, '/', parsed.length);
console.log('Records with image + amount:', withImg.filter(r => r.amount !== '').length);
