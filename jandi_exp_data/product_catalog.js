// product_catalog.js
// "What do we buy when setting up a new Airbnb property?"
// Outputs a clean procurement catalog: Category | Product Name | Price (KRW)
// Strips all noise: who bought it, card type, property, frequency.
//
// Usage:
//   node jandi_exp_data/product_catalog.js              → console report
//   node jandi_exp_data/product_catalog.js --csv        → write product_catalog.csv

const fs = require('fs');
const path = require('path');

const toCsv = process.argv.includes('--csv');

// ─── NOISE: not expenses at all (chat messages, announcements, bank transfers) ─
const NOISE_PATTERNS = [
  // Chat reactions & sentences
  /^(네|넵|ㅇ|ㅇㅇ|ㅋㅋ|ㅠㅠ|티|대기|대리|같이 다 올렸어요|따로 만들어 놨어요)$/,
  /통잠|자러 갑니다|빠른 처리 부탁|머리가 터질|손대며 체계/,
  // Sentence fragments where 약 means "approximately" not "medicine"
  /비용이 약\s*₩|비용이 약\s*\d|고정비용은 약/,
  /JANDI Connect|대화에 새로운|Outgoing Webhook/,
  /공지 앞으로|비용 처리 때|법인은 COZE|개인사업자는 JOY/,
  /해당 토픽에 기록된|COZE가 부담하는 경비/,
  /카드 반납|법카 돌려주세요|아카이빙하는 방법|일괄 팀 내 배분/,
  /잘못씀 다시 올릴|올렸어요|가지고있던거는|그거 될텐데|남색카드/,
  /정확하게 어느 카드|근데 다들 얼른|저도 이제|건강식으로/,
  /3333\d{6,}|351[-\s]\d|301[-\s]\d|352[-\s]\d|287[-\s]\d/,  // bank account numbers
  /농협 \d|국민 \d|하나 \d|우리 \d|우체국 \d|기업 \d|카카오뱅크 \d|IBK\d/,
  /\d{10,}/,  // long account numbers
  // System/admin noise
  /SOS 입금|해빙 등 입금|출금 모두 처리|급여 등 나가야/,
  /^(B9|F9|L9|SA|SJ|YT|HTA|HT)$/,  // standalone property codes
];

// ─── OPERATIONAL: real expenses but NOT product purchases ─────────────────────
const OPERATIONAL_PATTERNS = [
  /조식|아침식사|아침밥/,
  /점심|저녁|식사|식대|밥값|중식|점저|John.*Gaya|Gaya.*John/,
  /주유|기름값|요소수|세차(?!도구)|타이어공기압|워셔액|엔진오일|타이어 수리/,
  /주차(?!.*용품)/,
  /인건비|외부DC|DC인건비|코디 식대|코디 음료|투어인건비|가이드인건비|포토슛인건비/,
  /회식|직원.*식비|스탭식대/,
  /과태료|범칙금/,
  /임대료|월세|보증금|관리비/,
  /세금|부가세|소득세|세무조정|종소세|등록면허세|조정보수료/,
  /가스정산|전기요금|전기료|전기정산|수도요금|공과금|도시가스|가스요금/,
  /구인광고|온라인마케팅업무지원기기/,
  /버스대절|차대절|콜밴|공항(?!.*용품)|택시|CT 택시|교통비|교통이동/,
  /버스대금|버스대여|전세버스|관광버스|차량대여|차량렌트|차량랩핑/,
  /부동산중계|중계료/,
  /법인세/,
  /투어 버스|투어 숙박|투어 전세|투어 차량|투어숙박|투어 관광|에버랜드|한복포토슛|경복궁/,
  /숙박비|숙박대금|GCA 숙박|^숙박$/,
  /착불택배|택배비|EMS 발송/,
  /이사인력|용달/,
  /3\.3%|3\.3공제/,
  /하수도 보수|하수도배관보수|전기공사(?!자재|부속|재료)/,
  /개업축하화환/,
  /일리캡슐|커피 3Box|YT커피|커피3통|커피보충|티백세트|티세트|탄산수|음료(?!기계)/,
  /과일(?!.*나이프|.*칼)/,
  /간식(?!용품)/,
  /유니폼/,
  /부동산|중개|입금건|빠른 처리/,
  /밴렌탈|대절버스예약|차량.*타이어교체|업무차량유지보수|차량 방향제|사이드미러|업무폰요금|타이어 공기압/,
  /^커피$|^COZE 커피$|^커피\s|^티$|^과일$|^간식$|^숙소 의약품$/,
  /^[0-9,]+\s*(법인|JOY|COZE)?$/,  // bare numbers or amounts
  /넵!|한도초과|날이였어요/,          // chat fragments with expense mixed in
  /^물$|^물\.아침$|^생수$|^편의점$|^식비$|^교통$|^대기$|^도시가시/,
  /투어 진행비품|투어.*비품|투어 핫팩|투어 숙박/,  // tour ops
  /수리자재구입/,
  // Breakfast consumables — recurring ops, not property setup
  /^버터$|^소금$|^딸기잼$|^소모품 딸기쨈$|^식용유$|^식용류$|^식용류구매$/,
];

// ─── VAGUE: too generic to be useful as a specific product name ───────────────
const VAGUE_PATTERNS = [
  /^(소모품|비품|다이소|자재|운영자재|운영부자재|보수자재|공구자재|시공자재|오피스용품|사무용품|생존비품|청소비품|다이소건전지구매)$/i,
  /^(BS소모품|SG비품|YT비품|SA 비품|COZE 비품|COZE 소모품|JTS소모품|비품구입|비품\(다이소\)|다이소\(비품\))$/i,
  /^(탕비실비품|숙소.*비품|비품.*수리|레이 다이소|COZE 컨시어지차량비품구매|자재구입|공구$)$/i,
  /운영자재.*SG|회사 차량.*레이|자재 \d+.*법카|소모품 \d+.*개인/,
];

// ─── PRODUCT CATEGORIES ───────────────────────────────────────────────────────
// First match wins — specific first, generic last
const CATEGORIES = [
  {
    en: 'Large Appliances',
    kr: '대형 가전',
    patterns: [/세탁기|건조기|냉장고|에어컨|보일러|TV|텔레비전|오븐|전자레인지|식기세척기|정수기|공기청정기|로봇청소기|청소기(?!용품)|제습기|가습기|환풍기|제빙기|음식물분쇄기|열풍기|스타리아(?!.*주유)/],
  },
  {
    en: 'Electronics & Tech',
    kr: '전자기기',
    patterns: [/모니터|웹켐|카메라(?!.*감시)|노트북|스피커|휴대폰|스마트폰|충전기|멀티탭|랜선|LAN(?!공사)|공유기|DP케이블|충전케이블|키보드마우스|마우스(?!패드)|PC엑세서리|마우스패드|PC용품|컴퓨터구매|연남동.*모니터|연남동.*스피커|CGA 리모컨|리모컨 거치대/],
  },
  {
    en: 'Security & IoT',
    kr: '보안 & IoT',
    patterns: [/감시카메라|CCTV|샤오미.*카메라|IOT|스마트소켓|도어락|디지털락|열쇠함|열쇠복사/],
  },
  {
    en: 'Furniture & Décor',
    kr: '가구 & 인테리어',
    patterns: [/가구|침대|소파|책상|의자|선반(?!주문)|렉|스피드렉|그림|액자|블라인드|브라인드|커튼|거울|쿠션|카펫|조명|전등|스탠드|화분|시계|테이블텐트|접이식테이블|책장|컨퍼런스보드|공간박스|우산보관함|옷걸이|선반주문/],
  },
  {
    en: 'Electrical & Plumbing',
    kr: '전기 & 배관',
    patterns: [/콘센트|전기부속|전기자재|전기삶통|전기테스터기|전기.*익스텐션|전기.*코드|전기재료|전기공사자재|샤워헤드|수전|연질튜브|물받이트랩|관수장비부속|수도자재|배관|LAN공사|전기부속/],
  },
  {
    en: 'Tools & Hardware',
    kr: '공구 & 자재',
    patterns: [/드릴|전동공구|작업공구|interi어공구|인테리어공구|공구 세트|coze 공구|방충용품|방충약제|방충용품|방충자재|방충도어|방충(?!세제)|앵글|석고앙카|게단논슬립|목공자재|건축자재|목장갑|가스토치|토치|착화제|도어락(?!디지털)/],
  },
  {
    en: 'Guest Amenities',
    kr: '어메니티 (게스트용)',
    patterns: [/아메니티|칫솔|치약|샴푸|린스|바디워시|바디스폰지|바디스펀지|비누|슬리퍼|면봉|화장지|휴지(?!비품)|티슈|물티슈|면도기|생리대|시니어용품/],
  },
  {
    en: 'Cleaning & Laundry',
    kr: '청소 & 세탁용품',
    patterns: [/세탁세제|세제(?!류.*금액)|특수세제|전용 세제|락스|청소용품|청소도구|청소기용품|빗자루|쓰레기봉투|종량제봉투|종량제 봉투|비닐봉투|분리수거함|쓰레기통|걸레|밀대|욕실청소|주방세제|세정제|모기약|모기기피제|향균|소독|세제류|수세미|유충제거제|살충제|음식물종량제/],
  },
  {
    en: 'Medical & Safety',
    kr: '의약품 & 안전용품',
    patterns: [/^의약품$|^숙소 의약품$|구급상자|소화기|방독마스크|감기약(?!서비스)|제초제/],
  },
  {
    en: 'Kitchen & BBQ',
    kr: '주방 & BBQ',
    patterns: [/주방용품|냄비|프라이팬|식기(?!세척기세제)|그릇|도마|가스렌지|인덕션|커피.*드립|커피.*머신|커피.*세트|버터(?!.*조식)|딸기쨈|잼(?!.*나이프)|오일(?!.*엔진)|식용유|식용류|향신료|숯(?!.*번개)|번개탄|장작|바베큐|BBQ|핫팩(?!.*투어)|부탄가스|소금/],
  },
  {
    en: 'Bedding & Linen',
    kr: '침구 & 린넨',
    patterns: [/이불|베개|시트(?!지)|침구|수건|타월|가운|드라이시트|키친타월/],
  },
  {
    en: 'Outdoor & Garden',
    kr: '야외 & 정원',
    patterns: [/관수장비|잔디깍기|예초기|제초제(?!약품)|정원|잔디|화분받침|야외간판|테라스어닝|테라스난간렉산|우비/],
  },
  {
    en: 'Office Supplies',
    kr: '사무용품',
    patterns: [/A4|복사용지|라벨프린터|명함|사무용품|문구|잉크리필|이미지인쇄|원목 아크릴|그림인쇄|해바라기수전안내 인쇄물|봉투 구매|폐기물스티커|문서쇄단기|COZE 라벨지|휴지비품/],
  },
  {
    en: 'Consumables & Misc',
    kr: '기타 소모품',
    patterns: [/건전지|배터리(?!.*스마트)|베터리|핫팩(?!.*투어)|충전케이블|휴대용 짐가방 저울|짐가방|캣키트|이사용품|폐기물봉투/],
  },
];

const UNCATEGORIZED_LABEL = '❓ 미분류 (Uncategorized)';

// ─── PARSE CSV ────────────────────────────────────────────────────────────────
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

const csvPath = path.join(__dirname, 'bs_exp_parsed.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
const header = parseCsvLine(lines[0]);
const COL = {};
header.forEach((h, i) => { COL[h.trim()] = i; });

// ─── CLEAN DESCRIPTION ────────────────────────────────────────────────────────
function cleanDesc(raw) {
  let t = (raw || '').replace(/\n+/g, ' ').trim();
  // Remove /expense /사무실/ prefix patterns
  t = t.replace(/^\/exp(?:ense)?\s+(?:\d{2,4}[-./]\d{2}[-./]\d{2}\s+)?/i, '');
  t = t.replace(/^사무실\s*\/?\s*/i, '');
  t = t.replace(/^(BS|SG|SJ|SA|SWA|JT|JTS|HT|HTA|HTB|YT|L9|F9|B9|FB|TOUR)\s*[\/\s]/i, '');
  // Remove property names at start
  t = t.replace(/^(BS|SG|SJ|SA|SWA|JT|JTS|HT|HTA|HTB|YT|L9|F9|B9|FB)(?=[^A-Z]|$)/i, '').trim();
  // Remove trailing /AMOUNT/CARD or just /AMOUNT
  t = t.replace(/\/\d{3,}\/.*$/, '').replace(/\/[A-Z]{2,}$/, '').trim();
  // Remove leading/trailing dash
  t = t.replace(/^[-–\s]+/, '').replace(/[-–\s]+$/, '').trim();
  return t;
}

// ─── CLASSIFY ─────────────────────────────────────────────────────────────────
function isNoise(desc, raw) {
  const text = desc + ' ' + raw;
  return NOISE_PATTERNS.some(re => re.test(text));
}
function isOperational(desc, raw) {
  const combined = desc + ' ' + raw;
  if (OPERATIONAL_PATTERNS.some(re => re.test(combined))) return true;
  // Exact-match checks on cleaned desc only (avoids rawBody contaminating anchor matches)
  const EXACT_OPS = /^(커피|COZE 커피|티|과일|간식|숙박|숙소 의약품|대리|아침|점심|저녁|티켓|GCA 미팅|중식|주유|주차|레이 다이소|COZE 컨시어지차량비품구매|화요일 차량 방향제|사이드미러 교체|CT 택시|렌탈|물|물 아침|물\.아침|생수|교통|교통 이동|대기|편의점|식비|도시가시|티구매|폐기물|쌍화차|우비|물 핫팩|투어 핫팩|버터|소금|딸기잼|식용유|식용류)$/;
  if (EXACT_OPS.test(desc)) return true;
  // Bare number entries like "440000 법인" or "32480 JOY"
  if (/^[\d,]+(\s+(법인|JOY|COZE|현카|삼카|법카))?$/.test(desc)) return true;
  // Bank account strings
  if (/우리은행|국민은행|하나은행|농협은행|\d{4}[\s-]\d{3,}/.test(desc)) return true;
  return false;
}
function isVague(desc) {
  return VAGUE_PATTERNS.some(re => re.test(desc.trim()));
}
function categorize(text) {
  for (const cat of CATEGORIES) {
    if (cat.patterns.some(re => re.test(text))) return cat.en;
  }
  return null;
}

// ─── PROCESS ──────────────────────────────────────────────────────────────────
// products[category] = [ { name, price } ]
const products = {};
const uncategorized = [];
let stats = { total: 0, noise: 0, ops: 0, vague: 0, noAmount: 0, kept: 0 };

for (const line of lines.slice(1)) {
  const f = parseCsvLine(line);
  const rawDesc  = (f[COL['description']] || '').trim();
  const rawBody  = (f[COL['raw_body']] || '').trim();
  const amtStr   = (f[COL['amount_krw']] || '').trim();

  stats.total++;

  const desc = cleanDesc(rawDesc) || cleanDesc(rawBody);

  if (!desc) continue;
  if (isNoise(desc, rawBody))       { stats.noise++; continue; }
  if (isOperational(desc, rawBody)) { stats.ops++;   continue; }
  if (isVague(desc))                { stats.vague++; continue; }

  const amount = amtStr ? parseInt(amtStr) : 0;
  if (amount <= 0) { stats.noAmount++; continue; }

  const category = categorize(desc + ' ' + rawBody) || UNCATEGORIZED_LABEL;
  stats.kept++;

  // Normalize similar names so duplicates merge cleanly
  const NORMALIZE = [
    [/^(COZE )?바베큐(소모품|비품|용품.*)$/, 'BBQ 용품 (소모품/비품)'],
    [/^숯번개탄$|^번개탄$/, '숯 / 번개탄'],
    [/^\/ex0.*숯$|^숯$/, '숯'],
    [/^바베큐용품 10.*$/, 'BBQ 용품 (소모품/비품)'],
    [/^COZE 핫팩$|^핫팩$/, '핫팩 (Hand Warmer)'],
    [/^식용유$|^식용류$|^식용류구매$/, '식용유 (Cooking Oil)'],
    [/^딸기잼$|^소모품 딸기쨈$/, '딸기잼'],
  ];
  let normalizedName = desc;
  for (const [re, canonical] of NORMALIZE) {
    if (re.test(desc)) { normalizedName = canonical; break; }
  }

  const entry = { name: normalizedName, price: amount };
  if (category === UNCATEGORIZED_LABEL) {
    uncategorized.push(entry);
  } else {
    if (!products[category]) products[category] = [];
    // Deduplicate by normalized name (keep highest price as reference)
    const existing = products[category].find(e => e.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) { if (amount > existing.price) existing.price = amount; }
    else products[category].push(entry);
  }
}

// Sort each category by price descending
for (const cat of Object.keys(products)) {
  products[cat].sort((a, b) => b.price - a.price);
}
uncategorized.sort((a, b) => b.price - a.price);

// ─── OUTPUT ───────────────────────────────────────────────────────────────────
const catOrder = CATEGORIES.map(c => c.en).filter(c => products[c]?.length);

if (toCsv) {
  const outPath = path.join(__dirname, 'product_catalog.csv');
  const esc = v => `"${String(v).replace(/"/g,'""')}"`;
  const rows = ['category,product_name,price_krw'];
  for (const cat of catOrder) {
    for (const item of products[cat]) rows.push([esc(cat), esc(item.name), item.price].join(','));
  }
  for (const item of uncategorized) rows.push([esc('Uncategorized'), esc(item.name), item.price].join(','));
  fs.writeFileSync(outPath, rows.join('\n'), 'utf8');
  console.log(`✅ Written ${rows.length - 1} products → ${outPath}`);
  console.log(`   Stats: ${stats.total} total · ${stats.noise} noise · ${stats.ops} operational · ${stats.vague} vague · ${stats.noAmount} no-price · ${stats.kept} kept`);
} else {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   NEW PROPERTY PROCUREMENT CATALOG                  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  for (const cat of catOrder) {
    const items = products[cat];
    const catTotal = items.reduce((s, e) => s + e.price, 0);
    const catDef = CATEGORIES.find(c => c.en === cat);
    console.log(`\n▸ ${catDef ? catDef.kr + ' / ' : ''}${cat}  (${items.length} products)`);
    console.log('─'.repeat(60));
    for (const item of items) {
      const price = item.price > 0 ? `₩${item.price.toLocaleString('ko-KR')}` : '(price not recorded)';
      console.log(`  ${item.name.padEnd(40)} ${price}`);
    }
    console.log(`  ${'─'.repeat(56)}`);
    console.log(`  ${'SUBTOTAL'.padEnd(40)} ₩${catTotal.toLocaleString('ko-KR')}`);
  }

  if (uncategorized.length) {
    console.log(`\n▸ ❓ Uncategorized  (${uncategorized.length} items — review these)`);
    console.log('─'.repeat(60));
    for (const item of uncategorized.slice(0, 30)) {
      const price = item.price > 0 ? `₩${item.price.toLocaleString('ko-KR')}` : '';
      console.log(`  ${item.name.padEnd(40)} ${price}`);
    }
    if (uncategorized.length > 30) console.log(`  ... and ${uncategorized.length - 30} more`);
  }

  const grandTotal = [...catOrder, UNCATEGORIZED_LABEL]
    .flatMap(c => (c === UNCATEGORIZED_LABEL ? uncategorized : products[c] || []))
    .reduce((s, e) => s + e.price, 0);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  TOTAL PRODUCT SPEND: ₩${grandTotal.toLocaleString('ko-KR').padEnd(28)}║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`Stats: ${stats.total} records · ${stats.ops} operational · ${stats.noise} noise · ${stats.vague} vague · ${stats.kept} products kept\n`);
}
