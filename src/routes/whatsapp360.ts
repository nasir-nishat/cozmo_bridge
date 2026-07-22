// Webhook + manual test surface for the 360dialog Cloud API integration (Groups API).
// SCAFFOLDING (2026-07-21) — see src/platforms/whatsapp360/dialogClient.ts header and
// docs/whatsapp-groups-api-migration.md for context. Registered in src/index.ts only behind
// CONFIG.ENABLE_360DIALOG_GROUPS. This is a NEW, separate WA number — it must never touch the
// existing Evolution routes/state (src/routes/whatsapp.ts, src/services/groupLeads.ts) until a
// deliberate, separately-scoped wiring task decides how the two coexist.
import { Router } from 'express';
import { CONFIG } from '../config/constants';
import { emitGroupLifecycleUpdate, emitGroupParticipantsUpdate, emitInboundMessage, emitMessageStatus } from '../platforms/whatsapp360/lifecycleEvents';
import { createGuestGroup } from '../platforms/whatsapp360/groupCreation';

const router = Router();

router.get('/health', (_req, res) => {
    res.json({ ok: true, configured: Boolean(CONFIG.DIALOG360_API_KEY) });
});

// Meta/Cloud-API-style verification challenge. 360dialog typically manages the app subscription
// itself (webhook URL is set in the 360dialog dashboard, not via Meta's GET verify dance), so this
// may never actually be hit — kept as a defensive no-op in case that changes.
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && CONFIG.DIALOG360_WEBHOOK_VERIFY_TOKEN && token === CONFIG.DIALOG360_WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(challenge);
        return;
    }
    res.status(200).json({ ok: true, route: '/whatsapp360/webhook', method: 'POST' });
});

router.post('/webhook', (req, res) => {
    // Ack immediately — 360dialog/Meta retries on slow or non-200 responses.
    res.sendStatus(200);

    try {
        console.log('📲 [360dialog] webhook:', JSON.stringify(req.body).slice(0, 2000));
        const entries: any[] = req.body?.entry || [];
        for (const entry of entries) {
            const changes: any[] = entry?.changes || [];
            for (const change of changes) {
                const field = change?.field;
                const value = change?.value || {};
                switch (field) {
                    case 'group_lifecycle_update':
                        if (value?.id && value?.status) {
                            emitGroupLifecycleUpdate({
                                id: value.id,
                                status: value.status,
                                invite_link: value.invite_link,
                                created_timestamp: value.created_timestamp,
                            });
                        }
                        break;
                    case 'group_participants_update':
                        emitGroupParticipantsUpdate(value);
                        break;
                    case 'group_settings_update':
                    case 'group_status_update':
                    case 'group_join_requests':
                        // Logged only — no consumer yet. Wire up when the booking flow needs it.
                        console.log(`ℹ️ [360dialog] ${field}:`, JSON.stringify(value).slice(0, 500));
                        break;
                    case 'messages': {
                        // Inbound messages and delivery-status receipts share this one field —
                        // distinguished by which array is populated. See lifecycleEvents.ts header.
                        const displayPhoneNumber = value?.metadata?.display_phone_number;
                        for (const m of value?.messages || []) {
                            const text = m?.text?.body || '';
                            console.log(`💬 [360dialog] inbound from ${m.from}: ${text.slice(0, 200)}`);
                            emitInboundMessage({
                                from: m.from,
                                text,
                                type: m.type,
                                messageId: m.id,
                                timestamp: m.timestamp,
                                displayPhoneNumber,
                            });
                        }
                        for (const s of value?.statuses || []) {
                            console.log(`📶 [360dialog] status ${s.status} for ${s.recipient_id} (msg ${s.id})`);
                            emitMessageStatus({
                                messageId: s.id,
                                status: s.status,
                                recipientId: s.recipient_id,
                                timestamp: s.timestamp,
                            });
                        }
                        break;
                    }
                    default:
                        console.log(`ℹ️ [360dialog] unhandled webhook field "${field}"`);
                }
            }
        }
    } catch (e: any) {
        console.error('❌ [360dialog] webhook handler error:', e?.message);
    }
});

// Manual smoke test — only useful once DIALOG360_API_KEY is set and Groups API is confirmed
// enabled on the account. Not part of any automated flow.
router.post('/test-create-group', async (req, res) => {
    if (!CONFIG.ENABLE_360DIALOG_GROUPS) {
        res.status(403).json({ error: 'ENABLE_360DIALOG_GROUPS is false' });
        return;
    }
    const { subject, description } = req.body || {};
    if (!subject) {
        res.status(400).json({ error: 'Missing subject' });
        return;
    }
    try {
        const result = await createGuestGroup(subject, description);
        res.json({ ok: true, ...result });
    } catch (e: any) {
        console.error('❌ [360dialog] test-create-group failed:', e?.message);
        res.status(500).json({ ok: false, error: e?.message });
    }
});

export default router;
