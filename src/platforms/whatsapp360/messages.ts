// 360dialog Cloud API — sending messages into a group. Same /messages endpoint as normal sends,
// with recipient_type: 'group' and `to` set to the group id. Scaffolding — see dialogClient.ts
// header for sourcing/verification status.
import { dialogApi } from './dialogClient';

export async function sendGroupText(groupId: string, body: string, previewUrl = false): Promise<void> {
    await dialogApi.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'group',
        to: groupId,
        type: 'text',
        text: { body, preview_url: previewUrl },
    });
}

// Approved "utility" template send (e.g. the group-invite-link template). Marketing templates are
// discouraged for this flow — see docs/whatsapp-groups-api-migration.md §5 (rate-limited faster).
export async function sendGroupTemplate(
    groupId: string,
    templateName: string,
    languageCode: string,
    components?: any[]
): Promise<void> {
    await dialogApi.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'group',
        to: groupId,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            ...(components ? { components } : {}),
        },
    });
}
