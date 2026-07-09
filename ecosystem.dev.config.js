// ecosystem.dev.config.js — DEV ONLY, never touch ecosystem.config.js for testing
module.exports = {
  apps: [{
    name: 'cozmo-bridge',
    script: 'node',
    args: '-r ts-node/register src/index.ts',
    cwd: 'C:\\Users\\cozmo\\.openclaw\\workspace',
    env: {
      NODE_ENV: 'production',
      APP_MODE: 'prod',
      USE_TEST_JANDI_WEBHOOK: 'true',   // ← only difference
      SEND_JANDI_IN_DEV: 'true',
      LINE_USE_TEST_JANDI_WEBHOOK: 'false',
      ENABLE_WHATSAPP: 'true',
      ENABLE_LINE: 'true',
      ENABLE_WECHAT: 'true',
      WECHAT_USE_TEST_JANDI_WEBHOOK: 'true',
      MESSAGE_HISTORY_FALLBACK_ENABLED: 'true',
      MESSAGE_HISTORY_CONTEXT_SIZE: '10',
      NOTE_POLL_INTERVAL_MS: '480000',
      BOOKING_FALLBACK_ENABLED: 'true',
      BOOKING_FALLBACK_LOOKBACK_MS: '28800000',
      GROUP_CREATION_REQUIRE_ALLOWLIST: 'false',
      FORCE_DEV_GROUP_MEMBERS: 'false',
      GROUP_CREATION_LEAD_ALLOWLIST: '',
      EVOLUTION_API_URL: 'http://localhost:8080',
      EVOLUTION_INSTANCE: 'cozmo',
      EVOLUTION_API_KEY: 'cozmo_evo_k9x2mP4nQr8vL3wJ',
      LINE_CHANNEL_SECRET: 'c7877bff85bf7dc2201d4595baf8efd4'
    },
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000
  }]
}