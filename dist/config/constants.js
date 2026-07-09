"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALERT_EVENTS = exports.CONFIG = void 0;
const IS_DEV = process.env.NODE_ENV === 'development';
console.log('🌍 ENV:', process.env.NODE_ENV);
console.log('🔗 API URL:', IS_DEV ? 'sandbox' : 'platform');
const parseBool = (value, defaultValue) => {
    if (value === undefined)
        return defaultValue;
    return value.toLowerCase() === 'true';
};
const parseNum = (value, defaultValue) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : defaultValue;
};
const parseStr = (value, defaultValue = '') => (value || defaultValue).toString().trim();
const parseCsv = (value) => (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
const APP_MODE = (process.env.APP_MODE || (IS_DEV ? 'dev' : 'prod')).toLowerCase();
const IS_APP_DEV = APP_MODE === 'dev';
const SEND_JANDI_IN_DEV = parseBool(process.env.SEND_JANDI_IN_DEV, false);
const USE_TEST_JANDI_WEBHOOK = parseBool(process.env.USE_TEST_JANDI_WEBHOOK, false);
const LINE_USE_TEST_JANDI_WEBHOOK = parseBool(process.env.LINE_USE_TEST_JANDI_WEBHOOK, false);
const WECHAT_USE_TEST_JANDI_WEBHOOK = parseBool(process.env.WECHAT_USE_TEST_JANDI_WEBHOOK, false);
const NOTE_POLL_INTERVAL_MS = process.env.NOTE_POLL_INTERVAL_MS !== undefined ? Number(process.env.NOTE_POLL_INTERVAL_MS) : 30 * 60 * 1000;
const MESSAGE_HISTORY_FALLBACK_ENABLED = parseBool(process.env.MESSAGE_HISTORY_FALLBACK_ENABLED, true);
const MESSAGE_HISTORY_CONTEXT_SIZE = parseNum(process.env.MESSAGE_HISTORY_CONTEXT_SIZE, 10);
const JANDI_WEBHOOK_PROD = parseStr(process.env.JANDI_WEBHOOK_PROD);
const JANDI_WEBHOOK_TEST = parseStr(process.env.JANDI_WEBHOOK_TEST);
exports.CONFIG = {
    APP_MODE,
    IS_APP_DEV,
    SEND_JANDI_IN_DEV,
    HOSTFULLY_API_URL: IS_DEV
        ? 'https://sandbox.hostfully.com/api/v3'
        : 'https://platform.hostfully.com/api/v3',
    HOSTFULLY_API_KEY: parseStr(process.env.HOSTFULLY_API_KEY),
    HOSTFULLY_AGENCY_UID: parseStr(process.env.HOSTFULLY_AGENCY_UID),
    COZE_PERSONAL_NUMBER: parseStr(process.env.COZE_PERSONAL_NUMBER, '821097802701@c.us'),
    COZE_BUSINESS_NUMBER: parseStr(process.env.COZE_BUSINESS_NUMBER, '821026226935@c.us'),
    LM_STUDIO_URL: 'http://localhost:1234/v1/chat/completions',
    LM_MODEL: 'google/gemma-4-e4b',
    LLM_MAX_TOKENS: 1000,
    LLM_TEMPERATURE: 0.7,
    SHEET_ID: parseStr(process.env.SHEET_ID),
    ENABLE_GOOGLE_CALENDAR: parseBool(process.env.ENABLE_GOOGLE_CALENDAR, false),
    GOOGLE_CALENDAR_ID: parseStr(process.env.GOOGLE_CALENDAR_ID, 'primary'),
    BUSINESS_CARD_PATH: './assets/GAYA_BZ.jpg',
    PORT: 3001,
    NOTE_POLL_INTERVAL_MS,
    BOOKING_FALLBACK_ENABLED: parseBool(process.env.BOOKING_FALLBACK_ENABLED, false),
    BOOKING_FALLBACK_LOOKBACK_MS: parseNum(process.env.BOOKING_FALLBACK_LOOKBACK_MS, 8 * 60 * 60 * 1000),
    GROUP_CREATION_DELAY_MS: 600000,
    GROUP_CREATION_REQUIRE_ALLOWLIST: parseBool(process.env.GROUP_CREATION_REQUIRE_ALLOWLIST, true),
    GROUP_CREATION_LEAD_ALLOWLIST: parseCsv(process.env.GROUP_CREATION_LEAD_ALLOWLIST),
    GROUP_CREATION_PROPERTY_ALLOWLIST: parseCsv(process.env.GROUP_CREATION_PROPERTY_ALLOWLIST),
    TELEGRAM_BOT_TOKEN: parseStr(process.env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_CHAT_ID: parseStr(process.env.TELEGRAM_CHAT_ID),
    TELEGRAM_API_ID: Number(process.env.TELEGRAM_API_ID) || 0,
    TELEGRAM_API_HASH: parseStr(process.env.TELEGRAM_API_HASH),
    TELEGRAM_SESSION: parseStr(process.env.TELEGRAM_SESSION),
    USE_TEST_JANDI_WEBHOOK,
    LINE_USE_TEST_JANDI_WEBHOOK,
    WECHAT_USE_TEST_JANDI_WEBHOOK,
    JANDI_WEBHOOK_URL: USE_TEST_JANDI_WEBHOOK ? JANDI_WEBHOOK_TEST : JANDI_WEBHOOK_PROD,
    JANDI_WEBHOOK_URL_TEST: JANDI_WEBHOOK_TEST,
    ENABLE_JANDI: parseBool(process.env.ENABLE_JANDI, true),
    TG_ONLY_ALERTS: IS_APP_DEV && !SEND_JANDI_IN_DEV,
    JANDI_WEBHOOK_EXPENSE: 'https://wh.jandi.com/connect-api/webhook/20409630/fbacffc5fe846b9b3071d6588fda9436',
    JANDI_PROPERTY_WEBHOOKS: {
        BS: 'https://wh.jandi.com/connect-api/webhook/20409630/51aabac06ade290c96ea099c68d2ef48',
        HT: 'https://wh.jandi.com/connect-api/webhook/20409630/a5fb7d8e0cef788c3b0733de222adcf6',
        HTA: 'https://wh.jandi.com/connect-api/webhook/20409630/a5fb7d8e0cef788c3b0733de222adcf6',
        HTB: 'https://wh.jandi.com/connect-api/webhook/20409630/a5fb7d8e0cef788c3b0733de222adcf6',
        JT: 'https://wh.jandi.com/connect-api/webhook/20409630/1b3e3b46d33b460254b20d323f8a0d2f',
        JTS: 'https://wh.jandi.com/connect-api/webhook/20409630/04ed39637aa3f05c87e7313dcb818356',
        SA: 'https://wh.jandi.com/connect-api/webhook/20409630/d8f885ad1a8e1cdcb535756225bdd087',
        SG: 'https://wh.jandi.com/connect-api/webhook/20409630/bb47ce694a963f7200675b70b6dfea23',
        SJ: 'https://wh.jandi.com/connect-api/webhook/20409630/657ac2c9efc301947019ee7fb4ddc27e',
        YT: 'https://wh.jandi.com/connect-api/webhook/20409630/2488c9c9da1292fe255e0d18bf4d43ab',
        L9: 'https://wh.jandi.com/connect-api/webhook/20409630/2488c9c9da1292fe255e0d18bf4d43ab',
        F9: 'https://wh.jandi.com/connect-api/webhook/20409630/2488c9c9da1292fe255e0d18bf4d43ab',
        B9: 'https://wh.jandi.com/connect-api/webhook/20409630/2488c9c9da1292fe255e0d18bf4d43ab',
        FB: 'https://wh.jandi.com/connect-api/webhook/20409630/2488c9c9da1292fe255e0d18bf4d43ab',
        GK: 'https://wh.jandi.com/connect-api/webhook/20409630/66195fad373d44b26df5fd44715dee27',
        GKA: 'https://wh.jandi.com/connect-api/webhook/20409630/66195fad373d44b26df5fd44715dee27',
        GKB: 'https://wh.jandi.com/connect-api/webhook/20409630/66195fad373d44b26df5fd44715dee27',
    },
    ENABLE_EXPENSE_AUTO_SEND: parseBool(process.env.ENABLE_EXPENSE_AUTO_SEND, false),
    EXPENSE_AUTO_SEND_CHECKIN_FROM: parseStr(process.env.EXPENSE_AUTO_SEND_CHECKIN_FROM, '2026-05-29'),
    ENABLE_WHATSAPP: parseBool(process.env.ENABLE_WHATSAPP, true),
    ENABLE_LINE: parseBool(process.env.ENABLE_LINE, false),
    ENABLE_KAKAO: parseBool(process.env.ENABLE_KAKAO, false),
    KAKAO_SEND_URL: parseStr(process.env.KAKAO_SEND_URL),
    ENABLE_WECHAT: parseBool(process.env.ENABLE_WECHAT, false),
    MESSAGE_HISTORY_FALLBACK_ENABLED,
    MESSAGE_HISTORY_CONTEXT_SIZE,
    LINE_HISTORY_FALLBACK_ENABLED: parseBool(process.env.LINE_HISTORY_FALLBACK_ENABLED, MESSAGE_HISTORY_FALLBACK_ENABLED),
    LINE_HISTORY_CONTEXT_SIZE: parseNum(process.env.LINE_HISTORY_CONTEXT_SIZE, MESSAGE_HISTORY_CONTEXT_SIZE),
    KAKAO_HISTORY_FALLBACK_ENABLED: parseBool(process.env.KAKAO_HISTORY_FALLBACK_ENABLED, MESSAGE_HISTORY_FALLBACK_ENABLED),
    KAKAO_HISTORY_CONTEXT_SIZE: parseNum(process.env.KAKAO_HISTORY_CONTEXT_SIZE, MESSAGE_HISTORY_CONTEXT_SIZE),
    KAKAO_DEBOUNCE_MS: parseNum(process.env.KAKAO_DEBOUNCE_MS, 10000),
    WECHAT_HISTORY_FALLBACK_ENABLED: parseBool(process.env.WECHAT_HISTORY_FALLBACK_ENABLED, MESSAGE_HISTORY_FALLBACK_ENABLED),
    WECHAT_HISTORY_CONTEXT_SIZE: parseNum(process.env.WECHAT_HISTORY_CONTEXT_SIZE, MESSAGE_HISTORY_CONTEXT_SIZE),
    FORCE_DEV_GROUP_MEMBERS: parseBool(process.env.FORCE_DEV_GROUP_MEMBERS, false),
    DEV_GROUP_MEMBER_JIDS: ['821097802701@c.us', '821026226935@c.us'],
    LINE_CHANNEL_ACCESS_TOKEN: parseStr(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    LINE_CHANNEL_SECRET: parseStr(process.env.LINE_CHANNEL_SECRET),
    LINE_BUSINESS_CARD_IMAGE_URL: parseStr(process.env.LINE_BUSINESS_CARD_IMAGE_URL),
    EVOLUTION_API_URL: parseStr(process.env.EVOLUTION_API_URL, 'http://localhost:8080'),
    EVOLUTION_INSTANCE: parseStr(process.env.EVOLUTION_INSTANCE, 'cozmo'),
    EVOLUTION_API_KEY: parseStr(process.env.EVOLUTION_API_KEY),
    EVOLUTION_WEBHOOK_URL: parseStr(process.env.EVOLUTION_WEBHOOK_URL, 'http://host.docker.internal:3001/wa/webhook'),
    GROUP_CREATION_ENABLED: parseBool(process.env.GROUP_CREATION_ENABLED, false),
    SEND_INBOX_MESSAGE: parseBool(process.env.SEND_INBOX_MESSAGE, true),
    SEND_GUEST_INVITE_DM: parseBool(process.env.SEND_GUEST_INVITE_DM, true),
    OPENAI_API_KEY: parseStr(process.env.OPENAI_API_KEY),
    ENABLE_JANDI_RECEIPT_SCAN: parseBool(process.env.ENABLE_JANDI_RECEIPT_SCAN, false),
    JANDI_OUTGOING_TOKEN: parseStr(process.env.JANDI_OUTGOING_TOKEN),
    JANDI_ASK_TOKEN: parseStr(process.env.JANDI_ASK_TOKEN),
    ENABLE_JANDI_WATCHER: parseBool(process.env.ENABLE_JANDI_WATCHER, false),
    JANDI_EMAIL: parseStr(process.env.JANDI_EMAIL),
    JANDI_PASSWORD: parseStr(process.env.JANDI_PASSWORD),
    JANDI_TEAM_URL: parseStr(process.env.JANDI_TEAM_URL, 'https://cose.jandi.com'),
    JANDI_WATCH_ROOM_ID: parseStr(process.env.JANDI_WATCH_ROOM_ID),
    JANDI_EXPENSE_WEBHOOK: parseStr(process.env.JANDI_EXPENSE_WEBHOOK),
    ENABLE_CHECKOUT_REMINDER: parseBool(process.env.ENABLE_CHECKOUT_REMINDER, false),
    ENABLE_CHECKIN_REMINDER: parseBool(process.env.ENABLE_CHECKIN_REMINDER, false),
    SUPABASE_URL: parseStr(process.env.SUPABASE_URL),
    SUPABASE_ANON_KEY: parseStr(process.env.SUPABASE_ANON_KEY),
    ENABLE_GROUP_AI_REPLY: parseBool(process.env.ENABLE_GROUP_AI_REPLY, false),
    ENABLE_JANDI_AI_REPLY: parseBool(process.env.ENABLE_JANDI_AI_REPLY, false),
    ENABLE_AUTO_REPLY: parseBool(process.env.ENABLE_AUTO_REPLY, false),
    ENABLE_WA_DM_AUTO_REPLY: parseBool(process.env.ENABLE_WA_DM_AUTO_REPLY, false),
    WA_AUTO_REPLY_MIN_CONFIDENCE: parseNum(process.env.WA_AUTO_REPLY_MIN_CONFIDENCE, 0.75),
    SERPER_API_KEY: parseStr(process.env.SERPER_API_KEY),
};
exports.ALERT_EVENTS = {
    NEW_INQUIRY: '🔍 <b>New Inquiry</b>',
    NEW_HOLD: '⏸️ <b>On Hold</b>',
    // NEW_BOOKING handled separately (triggers group creation flow)
    NEW_BOOKING_REQUEST: '📋 <b>Booking Request</b>',
    BOOKING_UPDATED: '✏️ <b>Booking Updated</b>',
    BOOKING_CANCELLED: '❌ <b>Booking Cancelled</b>',
    NEW_BLOCKED_DATES: '📅 <b>Calendar Blocked</b>',
    UNIT_CHANGED: '🔄 <b>Unit Changed</b>',
    // PROPERTY_AVAILABILITY_UPDATED: '🔁 <b>Availability Updated</b>',
    NEW_PROPERTY: '🏠 <b>New Property</b>',
    UPDATED_PROPERTY: '🏠 <b>Property Updated</b>',
    DELETED_PROPERTY: '🗑️ <b>Property Deleted</b>',
    ACTIVATED_PROPERTY: '✅ <b>Property Activated</b>',
    DEACTIVATED_PROPERTY: '🚫 <b>Property Deactivated</b>',
    PINCODE_CREATED: '🔑 <b>Pin Code Created</b>',
    PINCODE_UPDATED: '🔑 <b>Pin Code Updated</b>',
    PINCODE_DELETED: '🔑 <b>Pin Code Deleted</b>',
    // NEW_INBOX_MESSAGE handled separately (shows message body)
    // INBOX_THREAD_UPDATED: '💬 <b>Thread Updated</b>',
};
