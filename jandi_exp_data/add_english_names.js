// add_english_names.js
// Adds english_name column to product_catalog.csv
// Usage: node jandi_exp_data/add_english_names.js

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'product_catalog.csv');

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
// Korean product name → English name
// Key is matched with startsWith for variants (e.g. multiple "종량제봉투..." entries)
const EXACT = {
  '사무실 세탁기건조기2조':                   'Washer & Dryer Set #2',
  '사무실 세탁기건조기1조':                   'Washer & Dryer Set #1',
  '식기세척기세제':                           'Dishwasher Detergent',
  '중고 휴대폰 3대 구매(숙소 추가 스탭용)':  'Used Smartphones ×3 (Staff)',
  '연남동사무실모니터':                       'Office Monitor (Yeonnam)',
  '충전케이블':                               'Charging Cable',
  '마우스':                                   'Computer Mouse',
  '랜선':                                     'LAN / Ethernet Cable',
  '키보드마우스세트':                         'Keyboard & Mouse Set',
  '연남동스피커':                             'Office Speaker (Yeonnam)',
  'PC용품':                                   'PC Accessories',
  '웹켐':                                     'Webcam',
  'DP케이블':                                 'DisplayPort Cable',
  'CGA 리모컨':                               'CGA Remote Control',
  '리모컨 거치대':                            'Remote Control Holder',
  '도어락':                                   'Smart Door Lock',
  'IOT장비':                                  'IoT Device',
  'IOT스마트소켓':                            'IoT Smart Socket',
  '열쇠함':                                   'Key Cabinet',
  '열쇠복사':                                 'Key Duplication',
  '선반주문':                                 'Shelving Unit',
  '지도액자':                                 'Framed Map Art',
  '연남동사무실 공간박스':                    'Storage Box (Yeonnam Office)',
  '책상':                                     'Desk',
  'COZE 조명':                                'Lighting Fixture',
  '전기삶통':                                 'Electric Sterilizer / Boiler',
  'COZE 샤워헤드2종':                         'Shower Head (2 types)',
  '수전부속':                                 'Faucet Parts',
  '전기자재':                                 'Electrical Materials',
  '전기테스터기':                             'Electrical Tester',
  'COZE 방충용품2조세트':                     'Bug Screen Kit (2-set)',
  '작업공구 세트':                            'Tool Set',
  '전동공구':                                 'Power Tool',
  '방충용품일체':                             'Bug Screen Full Set',
  'coze 공구':                                'Tool Kit (COZE)',
  '방충약제':                                 'Pest Control Chemical',
  '인테리어공구':                             'Interior Tools',
  '착화제':                                   'Fire Starter',
  '방충용품':                                 'Bug Screen Supplies',
  '토치':                                     'Torch / Blowtorch',
  '아메니티':                                 'Guest Amenity Kit',
  '호텔아메니티':                             'Hotel Amenity Kit',
  '아메니티(칫솔) 2000개':                    'Toothbrush Amenities ×2000',
  '바디스펀지':                               'Body Sponge',
  '시니어용품':                               'Senior Care Products',
  '비누':                                     'Soap',
  '샴푸린스':                                 'Shampoo & Conditioner',
  '휴지':                                     'Toilet Paper',
  '소모품(휴지)':                             'Toilet Paper (Consumable)',
  '티슈':                                     'Facial Tissue',
  '바디워시':                                 'Body Wash',
  '물티슈':                                   'Wet Wipes',
  '특수세제':                                 'Specialty Detergent',
  '세제':                                     'Detergent',
  'COZE 세제':                                'Detergent (COZE)',
  '수세미':                                   'Scouring Pad',
  'COZE 세탁세제':                            'Laundry Detergent (COZE)',
  '세탁세제':                                 'Laundry Detergent',
  '소금세탁세제':                             'Salt Laundry Detergent',
  '유충제거제':                               'Larvae Remover',
  '쓰레기봉투':                               'Garbage Bag',
  '살충제':                                   'Insecticide',
  '모기기피제':                               'Mosquito Repellent',
  '주방세제':                                 'Dish Soap',
  '청소용품':                                 'Cleaning Supplies',
  '음식물종량제묶음구매':                     'Food Waste Bags (Bundle)',
  '음식물종량제구매':                         'Food Waste Bags',
  '모기살충제':                               'Mosquito Insecticide',
  '장작':                                     'Firewood',
  '바베큐소모품':                             'BBQ Consumables',
  '숯':                                       'Charcoal',
  '바베큐비품':                               'BBQ Equipment',
  'COZE 핫팩':                                'Hand Warmers (COZE)',
  '번개탄':                                   'Quick-Light Charcoal',
  '숯번개탄':                                 'Charcoal Briquettes',
  '버터':                                     'Butter',
  '바베큐용품':                               'BBQ Supplies',
  '핫팩':                                     'Hand Warmers',
  '딸기잼':                                   'Strawberry Jam',
  '투어 핫팩':                                'Hand Warmers (Tour)',
  '부탄가스':                                 'Butane Gas',
  '물 핫팩':                                  'Water Hand Warmer',
  '소모품 딸기쨈':                            'Strawberry Jam (Consumable)',
  '부탄가스구매':                             'Butane Gas',
  '식용유':                                   'Cooking Oil',
  '식용류구매':                               'Cooking Oil Purchase',
  '식용류':                                   'Cooking Oil / Ingredients',
  '소금':                                     'Salt',
  '키친타월':                                 'Kitchen Paper Towel',
  '우비':                                     'Rain Poncho',
  'COZE 문서쇄단기':                          'Document Shredder',
  '라벨프린터기':                             'Label Printer',
  '봉투 구매':                                'Envelopes',
  '잉크리필':                                 'Ink Refill',
  '휴지비품':                                 'Toilet Paper Supply',
  'COZE 라벨지':                              'Label Sticker Roll',
  'A4용지':                                   'A4 Paper',
  '폐기물스티커':                             'Waste Disposal Sticker',
  '휴대용 짐가방 저울 12개':                  'Luggage Scale ×12',
  '캣키트':                                   'Cat Kit',
  '베터리':                                   'Battery',
  '건전지구매':                               'Battery Purchase',
};

// Prefix-based fallbacks for entries with trailing numbers/junk
const PREFIX = [
  ['레이 앵글(렉) 시공', 'Vehicle Rack Installation'],
  ['BBQ 용품',          'BBQ Supplies & Equipment'],
  ['핫팩 (Hand Warmer)', 'Hand Warmers'],
  ['숯 / 번개탄',        'Charcoal / Quick-Light Briquettes'],
  ['식용유 (Cooking Oil)', 'Cooking Oil'],
  ['레이차량 타이어',    'Vehicle Tire Air Check'],
  ['가스토치',          'Gas Torch'],
  ['PU 선운각 물티슈',  'PU Sununkak Wet Wipes'],
  ['일반종량제봉투',     'Standard Trash Bags'],
  ['종량제봉투',        'Trash Bags (Volume-Based)'],
  ['종량제 봉투',       'Trash Bags'],
  ['쓰레기봉투',        'Garbage Bags'],
  ['세제류',            'Detergent Set'],
  ['GCA 종량제봉투',    'GCA Trash Bags'],
  ['전용 세제',         'Dedicated Detergent'],
  ['바베큐용품',        'BBQ Supplies'],
  ['2025.',             'Extension Cord Materials'],
  ['/ex0',              'Charcoal (HT)'],
  ['25 07 31',          'Work Phone Repair (Screen + Battery)'],
];

function translate(name) {
  if (EXACT[name]) return EXACT[name];
  for (const [prefix, en] of PREFIX) {
    if (name.startsWith(prefix)) return en;
  }
  return '';  // mark as needing review
}

// ─── PARSE & REWRITE CSV ──────────────────────────────────────────────────────
function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
    else cur += c;
  }
  fields.push(cur);
  return fields;
}

function esc(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n').filter(Boolean);
const header = parseCsvLine(lines[0]);

// Remove existing english_name column if already present
const existingIdx = header.indexOf('english_name');
const cleanHeader = existingIdx >= 0 ? header.filter((_, i) => i !== existingIdx) : header;

const rows = lines.slice(1).map(l => {
  const f = parseCsvLine(l);
  return existingIdx >= 0 ? f.filter((_, i) => i !== existingIdx) : f;
});

let missing = 0;
const newRows = rows.map(r => {
  const name = r[1] || '';
  const en = translate(name);
  if (!en) { missing++; console.warn(`  ⚠️  No translation: ${name}`); }
  return [...r.map(esc), esc(en || name)].join(',');
});

const newHeader = [...cleanHeader, 'english_name'].join(',');
fs.writeFileSync(CSV_PATH, [newHeader, ...newRows].join('\n'), 'utf8');

console.log(`✅ Done — ${rows.length} products, ${missing} without translation (shown as Korean fallback)`);
console.log('\nSample:');
rows.slice(0, 8).forEach(r => {
  const en = translate(r[1] || '');
  console.log(`  ${(r[1] || '').padEnd(38)} → ${en}`);
});
