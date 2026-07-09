module.exports = {
  apps: [{
    name: 'cozmo-bridge',
    script: 'node',
    args: '-r ts-node/register src/index.ts',
    cwd: 'C:\\COZE_CORP\\cozmo_bridge',
    env: {
      NODE_ENV: 'production',
      APP_MODE: 'prod',

      // ─── Hostfully ────────────────────────────────────────────────────────────
      HOSTFULLY_API_KEY: 'Jtzt22PhP4yGHb00',
      HOSTFULLY_AGENCY_UID: 'daa492e4-e5c5-4fb5-b223-1a5a10f5f563',

      // ─── Telegram ────────────────────────────────────────────────────────────
      TELEGRAM_BOT_TOKEN: '8519469737:AAERhZrnwSYGsuFWbxdHxB294C1Og_eoSmU',
      TELEGRAM_CHAT_ID: '8769782643',
      TELEGRAM_API_ID: '37579834',
      TELEGRAM_API_HASH: 'b9dac86a449cf6ab2460e8ac7c32f64c',
      TELEGRAM_SESSION: '1BQANOTEuMTA4LjU2LjEyNQG7ed9Ud+z1RldNaIRwsK3IevLBvKjYedgqtnwQrP9R31B2AfyV8LE7zs55EmZaLktTsdcAhVK8GtaAoBoqYlcSMijEEujftzo0WzoLs7rmMF7Mnql1XUndDjubdpWpkkhQW3TPdWWCG7LKyJ7j2CnJTzMdI2lYdialB7FRR6tiEam0TcYvfJanad1njCln+U5xyXmvPUVUusTdfAb9ynpqjNhTIVKw87dzH6G9mALUPju1h8hBxqJdmd2D5pubEvu7tOpMCaW4Hb9jAbkkf3jpghRAtmLoGVK+u5DxUg8cdKf5MiTyNrkqdlA5PQS/+bAwetrTla1dSlrvLZWK83kmDw==',

      // ─── Google Sheets ────────────────────────────────────────────────────────
      SHEET_ID: '1xzDlJ9LXIXAtz6qpJfRqlEK5Fvmok9sgEMgYVpQmpc0',

      // ─── Google Calendar (Hostfully → cozmo@coze.care calendar) ───────────────
      ENABLE_GOOGLE_CALENDAR: 'true',
      GOOGLE_CALENDAR_ID: 'primary',
      CALENDAR_ID_BS: 'c_2ddeccdfea7e000f6b32fc95fb004137328fcb2c50b63117979c81e03b494a5f@group.calendar.google.com',
      CALENDAR_ID_SG: 'c_87e7823790fa13e4d263fef4e7a06ef92f0917e7d24bcca4e820f368bb3fe0b6@group.calendar.google.com',
      CALENDAR_ID_SJ: 'c_4443eac1e5d60c2395e37286795a6dc3eeef3a4dc4ab09a3311e66436c3b45cf@group.calendar.google.com',
      CALENDAR_ID_SA: 'c_1d9805dc455148f2e9bffd9851d900fdbda88c5d01a7d0b68bff342e1f77a06b@group.calendar.google.com',
      CALENDAR_ID_JT: 'c_fa90a7dd8ad9dd4786830c2e0c6667e9901279bc955390eaeac6ac30bdbaca47@group.calendar.google.com',
      CALENDAR_ID_JTS: 'c_956f36c3db6c819f3152e76ace480c23eed06cb81701b1b3dac6123b4fe0a43a@group.calendar.google.com',
      CALENDAR_ID_B9: 'c_fb607805afb605221dc4c9d40e766441788ccf666853567afb0e32e35ea71580@group.calendar.google.com',
      CALENDAR_ID_L9: 'c_f2f65f4ded0e7adb3d6e6415bcaf528acee8911317798681ed1568ad682d86c2@group.calendar.google.com',
      CALENDAR_ID_F9: 'c_dd6641674c5a738fc1b451b37187872a1934d8bc2b4b8057eafb1d11ed79ba8e@group.calendar.google.com',
      CALENDAR_ID_GK: 'c_13d1d048050efe24c645e9e2f26930019d3094ae29d90ffa61722989e9b8378f@group.calendar.google.com',
      CALENDAR_ID_GKA: 'c_662da96f4a4826fc28a46fcd1c4ba393b8883894530c50e09eca34b97a5d4783@group.calendar.google.com',
      CALENDAR_ID_GKB: 'c_bc6dcb5385a648323a5f3b792cac2d4897c7842b79b8a02255a43e62ec9c0918@group.calendar.google.com',
      CALENDAR_ID_HTA: 'c_b735387dbb7894c08e3f9416e93557bff79513adf1aa0189f037aacc88205b89@group.calendar.google.com',
      CALENDAR_ID_HTB: 'c_9e850106c89c5e3a2f2061971dbc5ba8544c93efe05dfe29c5346e6a4e329ef9@group.calendar.google.com',

      // ─── JANDI ───────────────────────────────────────────────────────────────
      JANDI_WEBHOOK_PROD: 'https://wh.jandi.com/connect-api/webhook/20409630/c7135f60e6da3aae0642970b1e9dd8c4',
      JANDI_WEBHOOK_TEST: 'https://wh.jandi.com/connect-api/webhook/20409630/9085c4a225e9966b3169fa8f44e1fe1e',
      USE_TEST_JANDI_WEBHOOK: 'false',
      LINE_USE_TEST_JANDI_WEBHOOK: 'false',
      SEND_JANDI_IN_DEV: 'true',
      ENABLE_JANDI: 'true',

      // ─── LINE ────────────────────────────────────────────────────────────────
      ENABLE_LINE: 'true',
      LINE_CHANNEL_ACCESS_TOKEN: 'rtqKhHG5+w05SP2SpKfDIeVzSPFa8mmNHD4iIBpLzneXI4OdKP00qWzOz85happzX8NfD5ffXXRJhlaAnQ9PS5KgfVLEqB+y7quiKJTjePBFJmf8owmJkot7szAwH7IJzeOav6LuxU1Fy+jmuxDX8AdB04t89/1O/w1cDnyilFU=',
      LINE_CHANNEL_SECRET: 'c7877bff85bf7dc2201d4595baf8efd4',

      // ─── WhatsApp (Evolution API) ─────────────────────────────────────────────
      ENABLE_WHATSAPP: 'true',
      EVOLUTION_API_URL: 'http://localhost:8081',
      EVOLUTION_INSTANCE: 'cozmo',
      EVOLUTION_API_KEY: 'cozmo_evo_k9x2mP4nQr8vL3wJ',

      // ─── KakaoTalk ───────────────────────────────────────────────────────────
      ENABLE_KAKAO: 'true',
      KAKAO_SEND_URL: 'http://192.168.0.14:3005',

      // ─── WeChat (WechatFerry — Windows only, WeChat PC 3.9.12.51 must be running) ──
      ENABLE_WECHAT: 'true',

      // ─── Supabase ─────────────────────────────────────────────────────────────
      SUPABASE_URL: 'https://fapnuilpvibejsszoopp.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcG51aWxwdmliZWpzc3pvb3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzgxOTksImV4cCI6MjA5NTM1NDE5OX0.4l-DiAfcv397RRLmDb1Cf4D0FhUG9GVZGsSsnxjh4ic',

      // ─── OpenAI ──────────────────────────────────────────────────────────────
      OPENAI_API_KEY: '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',
      ENABLE_JANDI_RECEIPT_SCAN: 'true',
      JANDI_OUTGOING_TOKEN: '6929ec5a9a923b6318664c7d6f84a817',
      JANDI_ASK_TOKEN: '34facde67aba5197fdc20b2e36e28a53',
      ENABLE_JANDI_WATCHER: 'true',
      JANDI_EMAIL: 'cozmo@coze.care',
      JANDI_PASSWORD: 'cosecare2023#*',
      JANDI_TEAM_URL: 'https://cose.jandi.com',
      JANDI_WATCH_ROOM_ID: '35436954',
      JANDI_EXPENSE_WEBHOOK: 'https://wh.jandi.com/connect-api/webhook/20409630/9085c4a225e9966b3169fa8f44e1fe1e',

      // ─── Booking & polling ───────────────────────────────────────────────────
      NOTE_POLL_INTERVAL_MS: '480000',
      BOOKING_FALLBACK_ENABLED: 'true',
      BOOKING_FALLBACK_LOOKBACK_MS: '28800000',

      MESSAGE_HISTORY_FALLBACK_ENABLED: 'true',
      MESSAGE_HISTORY_CONTEXT_SIZE: '10',
      ENABLE_CHECKOUT_REMINDER: 'true',
      ENABLE_CHECKIN_REMINDER: 'true',
      ENABLE_EXPENSE_AUTO_SEND: 'true',

      // ─── Group creation ─────────────────────────────────────────COZMO relay test──────────────
      SEND_INBOX_MESSAGE: 'true',
      SEND_GUEST_INVITE_DM: 'true',
      GROUP_CREATION_ENABLED: 'true',
      KAKAO_TEST_PING: 'false',
      GROUP_CREATION_REQUIRE_ALLOWLIST: 'false',
      FORCE_DEV_GROUP_MEMBERS: 'false',
      GROUP_CREATION_LEAD_ALLOWLIST: '',

      // ─── Serper (Google search fallback for guest questions KB can't answer) ──────
      SERPER_API_KEY: '0ca8d143db09338a83e4d820b55040dbf3c69d21',

      // ─── Internal AI Reply ──────────────────────────────────────────────────
      // Guest-facing replies use the single KB brain behind ENABLE_AUTO_REPLY.
      // Deprecated guest paths stay false: group @mention, WA DM, legacy WA RAG.
      ENABLE_GROUP_AI_REPLY: 'false',
      ENABLE_JANDI_AI_REPLY: 'true',

      // ─── Guest Auto-Reply (single KB brain, gpt-4o) ─────────────────────────
      ENABLE_AUTO_REPLY: 'false',
      ENABLE_WA_DM_AUTO_REPLY: 'true',
      WA_AUTO_REPLY_MIN_CONFIDENCE: '0.75',
    },
    post_update: ['taskkill /F /IM chrome.exe /T'],
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000
  }, {
    name: 'cozmo-admin-ui',
    script: 'server.js',
    cwd: 'C:\\COZE_CORP\\cozmo_bridge\\.deploy\\admin-ui\\current',
    env: {
      NODE_ENV: 'production',
      PORT: '3002',
      HOSTNAME: '0.0.0.0',
    },
    exec_mode: 'cluster',
    instances: 2,
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000
  }]
}
