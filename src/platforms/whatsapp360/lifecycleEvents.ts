// Bridges the async 360dialog webhook (group_lifecycle_update etc.) back to whatever request is
// waiting on it — createGuestGroup() needs the invite_link, which the create-group API call does
// NOT return synchronously; it only arrives later via webhook. routes/whatsapp360.ts emits here on
// every inbound webhook; groupCreation.ts subscribes for the one group id it's waiting on.
import { EventEmitter } from 'events';

export const dialog360Events = new EventEmitter();
dialog360Events.setMaxListeners(50);

export interface GroupLifecyclePayload {
    id: string;
    status: 'create' | 'delete' | string;
    invite_link?: string;
    created_timestamp?: string;
}

export function emitGroupLifecycleUpdate(payload: GroupLifecyclePayload): void {
    dialog360Events.emit('group_lifecycle_update', payload);
    dialog360Events.emit(`group_lifecycle_update:${payload.id}`, payload);
}

export function emitGroupParticipantsUpdate(payload: any): void {
    dialog360Events.emit('group_participants_update', payload);
    if (payload?.id) dialog360Events.emit(`group_participants_update:${payload.id}`, payload);
}

// Inbound text/media messages and delivery-status receipts — both arrive under the same
// webhook "field": "messages", distinguished by whether value.messages or value.statuses is
// present (confirmed 2026-07-21 against the live sandbox number's DM traffic). No group message
// has ever been observed yet — Groups API access is still pending on this account — so this only
// covers DM shape for now. Re-verify once a real group-message webhook can be captured.
export interface InboundMessagePayload {
    from: string;          // sender's wa_id
    text: string;
    type: string;          // 'text', 'image', etc. — only 'text' has a populated `text` field today
    messageId: string;
    timestamp: string;
    displayPhoneNumber?: string; // which of our numbers received it
}

export interface MessageStatusPayload {
    messageId: string;
    status: string;        // sent | delivered | read | failed
    recipientId: string;
    timestamp: string;
}

export function emitInboundMessage(payload: InboundMessagePayload): void {
    dialog360Events.emit('message', payload);
}

export function emitMessageStatus(payload: MessageStatusPayload): void {
    dialog360Events.emit('message_status', payload);
}
