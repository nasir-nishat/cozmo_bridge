// High-level group creation on 360dialog's Cloud API — the sanctioned replacement path researched
// in docs/whatsapp-groups-api-migration.md. SCAFFOLDING (2026-07-21): not wired into the
// NEW_BOOKING flow yet, and not exercised against a live account. Kept intentionally simple —
// unlike src/platforms/whatsapp/groupCreation.ts (Evolution), there is no pacing/anti-ban jitter
// here because this is the *sanctioned* API: WhatsApp does not enforcement-flag calls made through
// it the way it does unofficial Baileys clients. Re-add pacing only if 360dialog's own rate limits
// require it once live.
//
// Key behavioral differences from the Evolution flow (see migration doc §4):
//   - Groups are invite-only. There is no force-add — createGuestGroup() returns an invite link;
//     the caller is responsible for sending it to the guest (DM template / Hostfully inbox / etc).
//   - Max 8 participants + the business number (hard Meta limit).
//   - The business number itself is the concierge — staff do NOT need individual group seats.
import { CONFIG } from '../../config/constants';
import { createGroup, getInviteLink, isDialog360Configured } from './dialogClient';
import { dialog360Events, GroupLifecyclePayload } from './lifecycleEvents';

export interface GuestGroupResult {
    groupId: string;
    inviteLink: string | null;
    // true if the invite link came from the group_lifecycle_update webhook; false if we had to
    // fall back to polling GET /groups/{id}/invite_link because the webhook never arrived in time.
    inviteLinkFromWebhook: boolean;
}

// Waits for the group_lifecycle_update webhook carrying this group's invite_link. Resolves early
// if it arrives; otherwise falls back to a direct GET after CONFIG.DIALOG360_INVITE_LINK_WAIT_MS.
function waitForInviteLink(groupId: string, timeoutMs: number): Promise<{ link: string | null; fromWebhook: boolean }> {
    return new Promise((resolve) => {
        let settled = false;
        const eventName = `group_lifecycle_update:${groupId}`;

        const onLifecycle = (payload: GroupLifecyclePayload) => {
            if (settled || payload.status !== 'create' || !payload.invite_link) return;
            settled = true;
            clearTimeout(timer);
            dialog360Events.off(eventName, onLifecycle);
            resolve({ link: payload.invite_link, fromWebhook: true });
        };

        const timer = setTimeout(async () => {
            if (settled) return;
            settled = true;
            dialog360Events.off(eventName, onLifecycle);
            console.warn(`⚠️ [360dialog] group_lifecycle_update webhook didn't arrive within ${timeoutMs}ms for ${groupId} — polling invite_link directly`);
            const link = await getInviteLink(groupId).catch(() => null);
            resolve({ link, fromWebhook: false });
        }, timeoutMs);

        dialog360Events.on(eventName, onLifecycle);
    });
}

// Creates a new guest concierge group. Does NOT add participants (invite-only model — see header)
// and does NOT touch groupLeads.json / send any messages — that's deliberately left to the caller
// so this stays a pure building block until the full booking-flow wiring is scoped and built.
export async function createGuestGroup(subject: string, description?: string): Promise<GuestGroupResult> {
    if (!isDialog360Configured()) {
        throw new Error('createGuestGroup: DIALOG360_API_KEY not set — 360dialog is not configured yet');
    }
    console.log(`👥 [360dialog] Creating group: ${subject}`);
    const { id: groupId } = await createGroup(subject, description);
    console.log(`✅ [360dialog] Group created: ${groupId} — waiting for invite link...`);

    const { link, fromWebhook } = await waitForInviteLink(groupId, CONFIG.DIALOG360_INVITE_LINK_WAIT_MS);
    if (!link) {
        console.warn(`⚠️ [360dialog] Could not obtain invite link for ${groupId} — caller must fetch it later`);
    } else {
        console.log(`🔗 [360dialog] Invite link ready (${fromWebhook ? 'webhook' : 'polled'}): ${groupId}`);
    }

    return { groupId, inviteLink: link, inviteLinkFromWebhook: fromWebhook };
}
