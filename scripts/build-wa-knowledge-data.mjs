import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const archiveFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-chat-data.json');
const outputFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-knowledge-data.json');
const archive = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));

const definitions = [
  {
    id: 'private-van-tour',
    category: 'services',
    title: 'Private van tour',
    match: ['COZE Private Van Tour', 'Vehicles & Base Rates', 'Hyundai Staria'],
    triggers: ['private tour', 'van tour', 'staria', 'county', 'driver', 'tour host'],
    facts: [
      'Private van tours are quoted as a 10-hour charter.',
      'Hyundai Staria supports up to 10 guests and is listed at KRW 500,000.',
      'Hyundai County supports up to 23 guests and is listed at KRW 800,000.',
      'The base rate includes fuel, parking, and tolls.',
      'The base rate excludes 10% VAT, meals, and admission tickets.',
      'Overtime is listed as KRW 50,000/hour for Staria and KRW 100,000/hour for County.',
      'Tour hosts can support Korean, English, Japanese, and Chinese.',
      'On-board comforts mentioned in exports include Wi-Fi, bottled water, chargers, wheelchair by advance request, stroller rental/storage, and child or booster seats.',
    ],
    links: ['https://purple-variraptor-26e.notion.site/COZE-PRIVATE-TOUR-2b58919e326f80209482f45bc01cd968?pvs=149'],
  },
  {
    id: 'airport-van',
    category: 'transport',
    title: 'Airport van service',
    match: ['Complete Guidebook about Airport Vans', 'Gimpo Airport', 'Incheon Airport'],
    triggers: ['airport pickup', 'airport van', 'incheon', 'gimpo', 'luggage transport'],
    facts: [
      'Guests should provide travel date, arrival time, airline, and flight number to reserve airport transport.',
      'After confirmation, COZE sends pickup instructions and driver contact details.',
      'Listed extra rates: Gimpo Airport to accommodation is KRW 70,000 for 4-seater and KRW 90,000 for 7-seater.',
      'Listed extra rates: Incheon Airport to accommodation is KRW 100,000 for 4-seater and KRW 120,000 for 7-seater.',
      'Seoul city luggage transport is listed as a flat KRW 60,000.',
      'Seven guests plus luggage can feel tight in a 7-seater; two 4-seaters are recommended for more space.',
    ],
    links: [],
  },
  {
    id: 'guest-smartphone',
    category: 'property',
    title: 'Guest smartphone',
    match: ['Guest Smartphone Provided', 'smartphone with a Korean phone number', 'pre-installed'],
    triggers: ['guest phone', 'smartphone', 'hotspot', 'korean phone', 'apps'],
    facts: [
      'Several property manuals mention a guest smartphone with a Korean number, unlimited data/calls, and essential apps.',
      'The guest smartphone can be used as a Wi-Fi hotspot.',
      'Common apps mentioned include Coupang Eats, KakaoTaxi, Naver Maps, and local navigation tools.',
    ],
    links: [],
  },
  {
    id: 'food-delivery-coupang',
    category: 'food',
    title: 'Food delivery via Coupang Eats',
    match: ['Coupang Eats', 'send us a screenshot', 'final order'],
    triggers: ['food delivery', 'coupang', 'order food', 'delivery app'],
    facts: [
      'Guests can use the guest smartphone to open Coupang Eats.',
      'Guests add items to the cart and send COZE a screenshot of the final order summary.',
      'COZE places and pays for the order, then guests reimburse COZE at checkout.',
      'Cash or crypto reimbursement is repeatedly mentioned; card or bank transfer can add fees.',
    ],
    links: [],
  },
  {
    id: 'breakfast-grocery',
    category: 'food',
    title: 'Breakfast grocery option',
    match: ['COZE Breakfast Grocery Option', 'Daily Breakfast Refills', 'orders close every night at 9 PM'],
    triggers: ['breakfast', 'groceries', 'grocery refill', 'morning delivery'],
    facts: [
      'For early or regular check-ins, breakfast groceries may be prepared inside the home before arrival.',
      'For late check-ins, breakfast groceries may be delivered to the main gate at 6 AM the next morning.',
      'Guests should place the empty delivery bag back outside the gate after unpacking.',
      'Daily breakfast refill orders close at 9 PM for next-morning arrangement.',
    ],
    links: [],
  },
  {
    id: 'payment-settlement',
    category: 'payment',
    title: 'Expense and payment settlement',
    match: ['Expense & Payment', 'Settlement Timing', 'Cash (Recommended)', 'additional 10% VAT'],
    triggers: ['payment', 'settlement', 'expenses', 'cash', 'card', 'bank transfer', 'vat'],
    facts: [
      'COZE may cover expenses upfront for airport vans, food deliveries, shopping orders, or tours.',
      'Expenses are summarized one day before checkout and settled together.',
      'Cash is repeatedly recommended because it avoids the non-refundable 10% VAT charge.',
      'Card or bank transfer may incur additional fees, including VAT or foreign-card surcharges.',
      'Local bank transfer in the guest currency is mentioned as available for some currencies, with 10% VAT added.',
    ],
    links: [],
  },
  {
    id: 'waste-disposal',
    category: 'house-rules',
    title: 'Waste disposal',
    match: ['Waste Disposal Guide in Seoul', 'Food Waste Disposal', 'recycling'],
    triggers: ['trash', 'garbage', 'waste', 'recycling', 'food waste'],
    facts: [
      'Seoul waste disposal is strict and separated by type.',
      'Exports repeatedly include guidance for regular trash, recycling, food waste, and large-item disposal.',
      'One operational note says if trash is full, guests may leave it by the front door and COZE will clear it in the morning.',
      'Property-specific disposal details should be checked before responding because rules can differ by building.',
    ],
    links: [],
  },
  {
    id: 'checkout',
    category: 'checkout',
    title: 'Checkout instructions',
    match: ['Checkout Instructions', 'Checkout Time', 'Before You Leave'],
    triggers: ['checkout', 'leave', 'departure', 'airport transfer'],
    facts: [
      'Checkout time is repeatedly listed as 11:00 AM.',
      'Guests needing transportation support should book at least 12 hours in advance.',
      'Guests are asked to gather belongings, avoid leaving items behind, and place trash in designated bins.',
      'Payment settlement can be handled during checkout.',
      'Bank transfer or credit-card settlement may add 10% tax according to the exported instructions.',
    ],
    links: [],
  },
  {
    id: 'taxi-matching',
    category: 'transport',
    title: 'Taxi and MPV matching',
    match: ['Taxi Matching', 'IM TAXI', 'MPV Taxi', 'screenshot your pin'],
    triggers: ['taxi', 'mpv', 'call a ride', 'current location', 'naver pin'],
    facts: [
      'COZE can assist with real-time taxi or MPV bookings.',
      'Guests away from the property can open Naver Map, enable GPS, screenshot their current pin, and send it to COZE.',
      'MPV or large-family transport is positioned for groups that need to travel together.',
    ],
    links: [],
  },
  {
    id: 'naver-map-local-guide',
    category: 'neighborhood',
    title: 'Naver Map local guide',
    match: ['Naver Map', 'bookmarked', 'restaurants', 'supermarkets', 'ATMs'],
    triggers: ['naver map', 'restaurant', 'nearby', 'local guide', 'atm', 'clinic'],
    facts: [
      'Property manuals repeatedly direct guests to Naver Map bookmarks for local recommendations.',
      'Common bookmark categories include restaurants, supermarkets, convenience stores, hospitals, clinics, ATMs, and banks.',
      'Guests may need to install or sign up for Naver Map to use the neighborhood guides.',
    ],
    links: [],
  },
  {
    id: 'hanbok-photo-shoot',
    category: 'experiences',
    title: 'Hanbok photo shoot',
    match: ['Hanbok Photo Shoot', 'K-drama moment'],
    triggers: ['hanbok', 'photo shoot', 'palace photos', 'photographer'],
    facts: [
      'COZE offers a Hanbok photo shoot experience with a professional photographer.',
      'The experience mentions palace backdrops and hanbok styling for guests, couples, friends, or families.',
    ],
    links: ['https://hanbok-photo-shoot-famil-4ugms5e.gamma.site/'],
  },
  {
    id: 'cooking-class',
    category: 'experiences',
    title: 'Korean cooking class',
    match: ['Cooking Class', 'local market', 'Korean dishes'],
    triggers: ['cooking class', 'kimchi class', 'korean food class', 'market tour'],
    facts: [
      'COZE offers a Korean cooking class experience.',
      'The class mentions visiting a local market, discovering Korean ingredients, and learning Korean dishes with hosts.',
    ],
    links: ['https://purple-variraptor-26e.notion.site/Seasonal-Korean-Cooking-Class-Chop-mix-sizzle-and-feast-your-way-through-a-Korean-home-style-meal-33a8919e326f80b09076e6823e8e9ea8?pvs=143'],
  },
  {
    id: 'property-sg',
    category: 'property',
    title: 'SG property facts',
    propertyCodes: ['SG'],
    match: ['COZE SG STAY MANUAL', '178-60, Seongbuk-dong', 'Parking is on the uphill driveway'],
    triggers: ['sg address', 'sg parking', 'seongbuk', 'our village'],
    facts: [
      'SG address: 178-60, Seongbuk-dong, Seongbuk-gu, Seoul, Republic of Korea.',
      'SG car/taxi navigation address: 178-23, Seongbuk-dong, Seongbuk-gu, Seoul.',
      'SG has one free parking space in front of the house.',
      'No idling in front of SG because neighbors are sensitive to exhaust fumes.',
      'SG parking is on an uphill driveway; vehicles up to Hyundai Staria size can fit.',
      'Low EVs or sports sedans may scrape on the SG driveway.',
      'Nearby paid parking mentioned: Seongbuk-donggil Public Parking Lot.',
    ],
    links: ['https://naver.me/xs3GCRVs', 'https://naver.me/xyjnW8t8'],
  },
  {
    id: 'property-sj',
    category: 'property',
    title: 'SJ property facts',
    propertyCodes: ['SJ'],
    match: ['COZE SJ', 'Sunwha The Sharp', 'Chilpae-ro'],
    triggers: ['sj address', 'seoul station', 'sunwha', 'chilpae'],
    facts: [
      'SJ address: #1207, APT B, Sunwha The Sharp APT, 27 Chilpae-ro, Jung-gu, Seoul, Republic of Korea 04511.',
      'SJ is described as a serviced apartment near Seoul Station.',
      'SJ building rules emphasize quiet hallways and no personal items or luggage left in shared corridors.',
    ],
    links: ['https://naver.me/xkqJwrTc'],
  },
  {
    id: 'property-yeonnam',
    category: 'property',
    title: 'Yeonnam 09 property facts',
    propertyCodes: ['FB', 'L9', 'YT'],
    match: ['Seongmisan-ro 23-gil', 'BIRD 09', 'FISH 09', 'LOTUS 09'],
    triggers: ['l9 address', 'f9 address', 'b9 address', 'yeonnam', 'fish bird lotus'],
    facts: [
      'B9, F9, L9, FB, and YT exports point to 16-5, Seongmisan-ro 23-gil, Mapo-gu, Seoul, Republic of Korea.',
      'Yeonnam 09 manuals mention Naver Map bookmarks for restaurants, stores, banks, hospitals, and hidden gems.',
      'Some Yeonnam units mention curbside parking nearby, but guests should ask the team to check the latest local parking situation.',
    ],
    links: ['https://naver.me/5JpRM6v7'],
  },
  {
    id: 'sensitive-access-policy',
    category: 'safety',
    title: 'Sensitive access information policy',
    match: ['Door Code', 'Main Gate', 'PIN'],
    triggers: ['door code', 'gate code', 'wifi password', 'pin', 'key box'],
    facts: [
      'Door codes, key-box pins, gate codes, and Wi-Fi passwords are sensitive and must not be answered from this reusable KB.',
      'If a guest asks for access credentials, route to the authorized message source or a staff-approved property manual workflow.',
      'Do not expose credentials in admin previews intended for broad team visibility.',
    ],
    links: [],
    sensitive: true,
  },
];

function findSources(entry) {
  const terms = entry.match.map(term => term.toLowerCase());
  const sources = [];
  const seen = new Set();

  for (const chat of archive.chats) {
    if (entry.propertyCodes && !entry.propertyCodes.includes(chat.propertyCode)) continue;
    for (const message of chat.messages) {
      if (!message.sender?.startsWith('COZE_')) continue;
      const text = message.text.toLowerCase();
      if (!terms.some(term => text.includes(term))) continue;
      const key = `${chat.id}:${message.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        chatId: chat.id,
        title: chat.title,
        propertyCode: chat.propertyCode,
        guestName: chat.guestName,
        messageId: message.id,
        timestamp: message.timestamp,
      });
    }
  }

  return sources;
}

const entries = definitions.map(({ match, ...entry }) => {
  const sources = findSources({ ...entry, match });
  return {
    ...entry,
    sourceCount: sources.length,
    propertiesSeen: [...new Set(sources.map(source => source.propertyCode).filter(Boolean))].sort(),
    sources,
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'src/knowledge/wa-chat-data.json',
  policy: {
    purpose: 'Reusable local-AI retrieval facts distilled from WhatsApp exports.',
    excludes: ['raw chat transcripts', 'door codes', 'key-box pins', 'gate codes', 'Wi-Fi passwords', 'API keys'],
    useRule: 'Use as retrieval context only. Guest-facing wording must still follow the project message policy.',
  },
  entryCount: entries.length,
  categories: [...new Set(entries.map(entry => entry.category))].sort(),
  entries,
};

fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(rootDir, outputFile).split(path.sep).join('/')}`);
console.log(`Entries: ${payload.entryCount}`);
