"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPropertyPricingQuestion = isPropertyPricingQuestion;
exports.getLivePropertyPricingEntry = getLivePropertyPricingEntry;
const hostfully_1 = require("../services/hostfully");
const PROPERTY_PRICE_RE = /\b(property|house|home|room|stay|night|nightly|extra night|extend|extension|availability|available|book|booking|reservation)\b/i;
const PRICE_RE = /\b(price|rate|cost|fee|charge|how much|quote|pricing|amount|total)\b/i;
const MONEY_KEY_RE = /(total|subtotal|price|rate|rent|amount|charge|fee|balance|paid|payout|cost)/i;
const IGNORE_KEY_RE = /(deposit|security|tax|vat|commission|service|cleaning|owner|host|currency|exchange|refund|cancellation|damage)/i;
function isPropertyPricingQuestion(text) {
    return PRICE_RE.test(text) && PROPERTY_PRICE_RE.test(text);
}
function fmtMoney(value, currency = 'KRW') {
    const n = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number(value.replace(/[^\d.-]/g, ''))
            : NaN;
    if (!Number.isFinite(n) || n <= 0)
        return null;
    const rounded = Math.round(n);
    if (currency.toUpperCase() === 'KRW')
        return `KRW ${rounded.toLocaleString('en-US')}`;
    return `${currency.toUpperCase()} ${rounded.toLocaleString('en-US')}`;
}
function findCurrency(obj) {
    const candidates = [
        obj?.currency,
        obj?.currencyCode,
        obj?.quote?.currency,
        obj?.pricing?.currency,
        obj?.financials?.currency,
        obj?.order?.currency,
    ].filter(Boolean);
    return String(candidates[0] || 'KRW');
}
function collectMoneyFields(obj, prefix = '', out = []) {
    if (!obj || typeof obj !== 'object' || out.length >= 20)
        return out;
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'number' || typeof value === 'string') {
            if (MONEY_KEY_RE.test(key) && !IGNORE_KEY_RE.test(key))
                out.push({ key: path, value });
        }
        else if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (/(quote|price|pricing|financial|amount|total|order|rate|rent|lead)/i.test(path)) {
                collectMoneyFields(value, path, out);
            }
        }
    }
    return out;
}
function labelFromKey(key) {
    const last = key.split('.').pop() || key;
    return last
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
function nightsBetween(checkIn, checkOut) {
    if (!checkIn || !checkOut)
        return null;
    const a = new Date(checkIn).getTime();
    const b = new Date(checkOut).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a)
        return null;
    return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
async function getLivePropertyPricingEntry(leadUid, guestMessage) {
    if (!isPropertyPricingQuestion(guestMessage))
        return null;
    const lead = await (0, hostfully_1.fetchLead)(leadUid);
    const currency = findCurrency(lead);
    const propertyName = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
    const checkIn = lead?.checkInLocalDateTime || lead?.checkInZonedDateTime;
    const checkOut = lead?.checkOutLocalDateTime || lead?.checkOutZonedDateTime;
    const nights = nightsBetween(checkIn, checkOut);
    const seen = new Set();
    const facts = [];
    for (const field of collectMoneyFields(lead)) {
        const money = fmtMoney(field.value, currency);
        if (!money || seen.has(money))
            continue;
        seen.add(money);
        facts.push(`${labelFromKey(field.key)} from Hostfully is ${money}.`);
        if (facts.length >= 4)
            break;
    }
    if (!facts.length)
        return null;
    facts.unshift(`Live Hostfully booking context: ${propertyName}.`);
    if (checkIn && checkOut)
        facts.push(`Current booking dates in Hostfully are ${String(checkIn).slice(0, 10)} to ${String(checkOut).slice(0, 10)}${nights ? ` (${nights} nights)` : ''}.`);
    if (nights && facts.some(f => /total/i.test(f)))
        facts.push('If the guest asks for a different date, extension, discount, or availability, staff must confirm the live quote before replying.');
    return {
        id: `hostfully-live-price-${leadUid}`,
        propertyCode: 'LIVE',
        category: 'payment',
        title: 'Live Hostfully property pricing',
        triggers: ['property price', 'nightly rate', 'booking price', 'stay cost'],
        facts,
        links: [],
        sensitive: false,
    };
}
