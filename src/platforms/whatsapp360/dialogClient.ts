// 360dialog Cloud API client — official WhatsApp Groups API.
//
// SCAFFOLDING (added 2026-07-21): no live 360dialog account/API key exists yet. Endpoint paths,
// headers and payload shapes below are transcribed from 360dialog's public docs
// (docs.360dialog.com/docs/messaging/groups/*) and Meta's Groups API reference
// (developers.facebook.com/documentation/business-messaging/whatsapp/groups), researched
// 2026-07-21 — NOT yet exercised against a real account. Re-verify status codes and field names
// once DIALOG360_API_KEY is set and Groups API is confirmed enabled on the number.
//
// Why this exists: the legacy Evolution/Baileys WA number keeps hitting WhatsApp enforcement
// (see docs/whatsapp-anti-ban.md). 360dialog is a Cloud API BSP that exposes Meta's sanctioned
// Groups API — no unofficial-client fingerprint, no suspension risk. See
// docs/whatsapp-groups-api-migration.md for the full migration plan (this file is Phase 2/3).
//
// Hard requirements before this can go live (not code problems — account/business steps):
//   - An Official Business Account (OBA / green tick) on the 360dialog number
//   - Confirmed Groups API access from 360dialog (not all BSPs expose it — ask explicitly)
//   - Approved "utility" templates for the invite-link message (Groups are invite-only — no
//     force-add exists on this API, unlike the Evolution flow)
import axios from 'axios';
import { CONFIG } from '../../config/constants';

export const dialogApi = axios.create({
    baseURL: CONFIG.DIALOG360_BASE_URL,
    headers: CONFIG.DIALOG360_API_KEY ? { 'D360-API-KEY': CONFIG.DIALOG360_API_KEY } : {},
    timeout: 20_000,
});

export function isDialog360Configured(): boolean {
    return Boolean(CONFIG.DIALOG360_API_KEY);
}

export interface Dialog360Group {
    id: string;
    subject: string;
    description?: string;
    invite_link?: string;
    join_approval_mode?: string;
    suspended?: boolean;
    creation_timestamp?: string;
    total_participant_count?: number;
    participants?: { wa_id: string }[];
}

// POST /groups — invite_link is NOT returned synchronously; it arrives via the
// group_lifecycle_update webhook (see lifecycleEvents.ts + routes/whatsapp360.ts).
export async function createGroup(subject: string, description?: string): Promise<{ id: string }> {
    const res = await dialogApi.post('/groups', {
        messaging_product: 'whatsapp',
        subject,
        ...(description ? { description } : {}),
        join_approval_mode: CONFIG.DIALOG360_GROUP_JOIN_APPROVAL_MODE,
    });
    const id = res.data?.id || res.data?.group_id;
    if (!id) throw new Error('createGroup: no group id in response — ' + JSON.stringify(res.data));
    return { id };
}

export async function deleteGroup(groupId: string): Promise<void> {
    await dialogApi.delete(`/groups/${groupId}`);
}

export async function getGroupInfo(groupId: string, fields?: string[]): Promise<Dialog360Group> {
    const res = await dialogApi.get(`/groups/${groupId}`, {
        params: fields?.length ? { fields: fields.join(',') } : undefined,
    });
    return res.data;
}

export async function updateGroupSettings(
    groupId: string,
    updates: { subject?: string; description?: string; profile_picture_file?: string }
): Promise<void> {
    await dialogApi.post(`/groups/${groupId}`, { messaging_product: 'whatsapp', ...updates });
}

export async function getInviteLink(groupId: string): Promise<string | null> {
    try {
        const res = await dialogApi.get(`/groups/${groupId}/invite_link`);
        return res.data?.invite_link || null;
    } catch {
        return null;
    }
}

export async function resetInviteLink(groupId: string): Promise<string | null> {
    const res = await dialogApi.post(`/groups/${groupId}/invite_link`, { messaging_product: 'whatsapp' });
    return res.data?.invite_link || null;
}

export async function getJoinRequests(groupId: string): Promise<{ join_request_id: string; wa_id: string }[]> {
    const res = await dialogApi.get(`/groups/${groupId}/join_requests`);
    return res.data?.data || [];
}

export async function approveJoinRequests(groupId: string, joinRequestIds: string[]): Promise<void> {
    await dialogApi.post(`/groups/${groupId}/join_requests`, {
        messaging_product: 'whatsapp',
        join_requests: joinRequestIds,
    });
}

export async function rejectJoinRequests(groupId: string, joinRequestIds: string[]): Promise<void> {
    await dialogApi.delete(`/groups/${groupId}/join_requests`, {
        data: { messaging_product: 'whatsapp', join_requests: joinRequestIds },
    });
}

// Documented on Meta's generic Cloud API Groups Participants reference; not shown in 360dialog's
// own group-management page (only "remove" was). Groups are invite-only per 360dialog's docs, so
// this may 400/404 on a real account — verify before relying on it. Prefer the invite-link flow.
export async function addParticipants(groupId: string, waIds: string[]): Promise<void> {
    await dialogApi.post(`/groups/${groupId}/participants`, {
        messaging_product: 'whatsapp',
        participants: waIds.map(user => ({ user })),
    });
}

export async function removeParticipants(groupId: string, waIds: string[]): Promise<void> {
    await dialogApi.delete(`/groups/${groupId}/participants`, {
        data: { messaging_product: 'whatsapp', participants: waIds.map(user => ({ user })) },
    });
}

export async function listGroups(opts?: { limit?: number; after?: string; before?: string }): Promise<Dialog360Group[]> {
    const res = await dialogApi.get('/groups', { params: opts });
    return res.data?.data?.groups || res.data?.data || [];
}
