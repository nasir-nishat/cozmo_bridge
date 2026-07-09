# Services

All files are under `src/services/` unless noted.

## Core

| File | Key Exports | Purpose |
|---|---|---|
| `hostfully.ts` | `fetchLead`, `fetchProperty`, `saveGuestNote`, `pollLeadNotes` | Hostfully API |
| `sheets.ts` | `getActiveTeamMembers`, `getDevTeamMembers`, `getTeamNumbers`, `getTeamNames`, `getAllTeamMembers`, `getMessages`, `getBookingMsg`, `getBookingMsgKr`, `getBookingConfirmationMessage`, `getPrePaymentMsg`, `getGuestLeads`, `saveGuestLead`, `getTipsMessage`, `getScheduledMessage`, `getAllCheckInMsgs`, `getAllCheckOutMsgs`, `getAllBookingMsgs` | Google Sheets |
| `notify.ts` | `sendAlert` | Telegram + Jandi alerts |
| `llm.ts` | `translateMessage`, `detectGuestRequest`, `detectLanguage`, `detectGuestLanguage`, `wasAlreadySent` | LM Studio (Gemma 4) calls |
| `requestDetection.ts` | `detectGuestIntentWithContext` | AI guest intent detection (all platforms) |
| `groupLeads.ts` | `linkGroup`, `unlinkGroup`, `getLeadUid`, `getGroupIdByLeadUid`, `getWaGroupIdByLeadUid`, `getAllGroupsByLeadUid`, `saveGroupLang`, `getGroupLang`, `saveKakaoChatName`, `getKakaoChatName`, `saveGroupName`, `getStoredGroupName` | group → lead map (group-leads.json) |
| `staffCache.ts` | `loadStaffNames`, `getStaffWhatsAppLids` | Staff name + WA LID lookup |

## Scheduling & Reminders

| File | Key Exports | Purpose |
|---|---|---|
| `checkinReminder.ts` | `initCheckinReminder`, `catchUpCheckin` | Check-in crons: 15:00 tips, 19:00 rules |
| `checkoutReminder.ts` | `initCheckoutReminder`, `catchUpCheckout` | Checkout crons: 21:00 reminder, 07:00 bill, 15:00 farewell |
| `groupReminders.ts` | `checkAndFireReminders` | Polled every 2min — fires per-group scheduled messages |
| `expenses.ts` | `handleExpCommand`, `sendExpenseSummary`, `getStaffName`, `deleteOldExpenses` | Expense logging |

## State & Buffers

| File | Key Exports | Purpose |
|---|---|---|
| `bookingStore.ts` | `getBookingsCheckingIn`, `isLeadExpired`, `backfillBookingStore` | In-memory booking cache |
| `messageBuffer.ts` | `addToBuffer`, `getRecentMessages`, `pruneBuffer` | Per-group message history for LLM context |
| `sentMessages.ts` | — | Deduplication of sent messages across restarts |
| `alertStore.ts` | — | In-memory recent alert feed for admin UI SSE |
| `pendingGroupCreation.ts` | `flushPendingGroupCreations`, `checkForStuckGroupCreations` | Queue for delayed WA group creation |
| `pendingHfMessages.ts` | `flushPendingHfMessages`, `checkForStuckHfMessages` | Queue for HF inbox messages before group creation |
| `welcomedGroups.ts` | — | Tracks groups that have already received a welcome |

## Integrations

| File | Key Exports | Purpose |
|---|---|---|
| `jandi.ts` | `sendJandiAlert` | Jandi webhook sender |
| `jandiWatcher.ts` | `initJandiWatcher` | Polls Jandi for slash commands |
| `kakaoWatchdog.ts` | `checkKakaoHeartbeat` | Monitors KakaoTalk heartbeat via MessengerBot R |
| `kakaoExpenseScan.ts` | — | OCR expense scanning from Kakao receipts |
| `calendar.ts` | — | Google Calendar CRUD for booking events |
| `calendarEvents.ts` | — | Calendar event formatting helpers |
| `telegram-client.ts` | `checkTelegramPhone` | MTProto phone lookup |
| `supabase.ts` | — | Supabase client (migrations pending) |
| `google-auth.ts` | — | Google OAuth2 client for Sheets + Calendar |
| `contacts.ts` | — | Contact lookup helpers |

## Knowledge / AI Reply

| File | Purpose |
|---|---|
| `src/knowledge/autoReplyPipeline.ts` | Main KB-backed guest reply pipeline (`ENABLE_AUTO_REPLY`) |
| `src/knowledge/replyAgent.ts` | GPT-4o reply generation |
| `src/knowledge/escalationAgent.ts` | Decides whether to escalate to staff |
| `src/knowledge/kb.ts` | Knowledge base query |
| `src/knowledge/knowledgeLoader.ts` | Loads knowledge-base.json |
| `src/knowledge/router.ts` | Routes guest query to right handler |
| `src/knowledge/webSearch.ts` | Web search fallback (Serper + DuckDuckGo) |
| `src/knowledge/livePricing.ts` | Live pricing lookup via Hostfully |
| `knowledgeBase.ts` | (services/) KB data access layer |
| `aiReply.ts` | (services/) Legacy AI reply shim |
| `ragReply.ts` | (services/) Legacy RAG reply shim |
| `replyWatchdog.ts` | (services/) Watchdog for stuck reply jobs |
