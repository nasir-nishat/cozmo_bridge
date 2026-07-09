module.exports = {
  apps: [{
    name: 'cozmo-bridge',
    script: 'node',
    args: '-r ts-node/register src/index.ts',
    cwd: 'C:\\Users\\cozmo\\.openclaw\\workspace',
    env: {
      NODE_ENV: 'production',
      APP_MODE: 'prod',

      // ─── Hostfully ────────────────────────────────────────────────────────────
      HOSTFULLY_API_KEY: 'YOUR_HOSTFULLY_API_KEY',
      HOSTFULLY_AGENCY_UID: 'YOUR_HOSTFULLY_AGENCY_UID',

      // ─── Telegram ────────────────────────────────────────────────────────────
      TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN',
      TELEGRAM_CHAT_ID: 'YOUR_TELEGRAM_CHAT_ID',
      TELEGRAM_API_ID: 'YOUR_TELEGRAM_API_ID',
      TELEGRAM_API_HASH: 'YOUR_TELEGRAM_API_HASH',
      TELEGRAM_SESSION: 'YOUR_TELEGRAM_SESSION',

      // ─── Google Sheets ────────────────────────────────────────────────────────
      SHEET_ID: 'YOUR_GOOGLE_SHEET_ID',

      // ─── Google Calendar (Hostfully bookings → calendar events) ───────────────
      ENABLE_GOOGLE_CALENDAR: 'false',
      GOOGLE_CALENDAR_ID: 'primary',

      // ─── JANDI ───────────────────────────────────────────────────────────────
      JANDI_WEBHOOK_PROD: 'YOUR_JANDI_WEBHOOK_PROD_URL',
      JANDI_WEBHOOK_TEST: 'YOUR_JANDI_WEBHOOK_TEST_URL',
      USE_TEST_JANDI_WEBHOOK: 'false',
      LINE_USE_TEST_JANDI_WEBHOOK: 'false',
      SEND_JANDI_IN_DEV: 'true',

      // ─── LINE ────────────────────────────────────────────────────────────────
      ENABLE_LINE: 'true',
      LINE_CHANNEL_ACCESS_TOKEN: 'YOUR_LINE_CHANNEL_ACCESS_TOKEN',
      LINE_CHANNEL_SECRET: 'YOUR_LINE_CHANNEL_SECRET',

      // ─── WhatsApp (Evolution API) ─────────────────────────────────────────────
      ENABLE_WHATSAPP: 'true',
      EVOLUTION_API_URL: 'http://localhost:8080',
      EVOLUTION_INSTANCE: 'cozmo',
      EVOLUTION_API_KEY: 'YOUR_EVOLUTION_API_KEY',

      // ─── KakaoTalk ───────────────────────────────────────────────────────────
      ENABLE_KAKAO: 'false',

      // ─── WeChat (WechatFerry — Windows only, WeChat PC 3.9.12.17 must be running) ──
      ENABLE_WECHAT: 'false',

      // ─── Supabase ─────────────────────────────────────────────────────────────
      SUPABASE_URL: 'https://xxxx.supabase.co',
      SUPABASE_ANON_KEY: 'eyJ...',

      // ─── OpenAI ──────────────────────────────────────────────────────────────
      OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY',

      // ─── Booking & polling ───────────────────────────────────────────────────
      NOTE_POLL_INTERVAL_MS: '480000',
      BOOKING_FALLBACK_ENABLED: 'true',
      BOOKING_FALLBACK_LOOKBACK_MS: '28800000',
      MESSAGE_HISTORY_FALLBACK_ENABLED: 'true',
      MESSAGE_HISTORY_CONTEXT_SIZE: '10',

      // ─── Group creation ───────────────────────────────────────────────────────
      GROUP_CREATION_ENABLED: 'true',
      GROUP_CREATION_REQUIRE_ALLOWLIST: 'false',
      FORCE_DEV_GROUP_MEMBERS: 'false',
      GROUP_CREATION_LEAD_ALLOWLIST: '',
      // Staff IDs managed in src/data/staff-ids.json — no env vars needed
    },
    post_update: ['taskkill /F /IM chrome.exe /T'],
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000
  }]
}
