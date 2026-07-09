import { google } from 'googleapis';
import oAuth2Client from './google-auth';

const people = google.people({ version: 'v1', auth: oAuth2Client });
const GROUP_NAME = '에어비앤비 게스트';

let cachedGroupResourceName: string | null = null;

async function getOrCreateContactGroup(): Promise<string> {
    if (cachedGroupResourceName) return cachedGroupResourceName;

    const res = await people.contactGroups.list({ pageSize: 200 });
    const existing = (res.data.contactGroups || []).find(g => g.name === GROUP_NAME);
    if (existing?.resourceName) {
        cachedGroupResourceName = existing.resourceName;
        return existing.resourceName;
    }

    const created = await people.contactGroups.create({
        requestBody: { contactGroup: { name: GROUP_NAME } },
    });
    cachedGroupResourceName = created.data.resourceName!;
    return cachedGroupResourceName;
}

export async function saveGuestContact(
    guestFullName: string,
    phone: string,
    propertyCode: string,
): Promise<void> {
    const displayName = `${propertyCode}_${guestFullName}`;
    const groupResourceName = await getOrCreateContactGroup();

    await people.people.createContact({
        requestBody: {
            names: [{ givenName: displayName }],
            phoneNumbers: phone ? [{ value: `+${phone}`, type: 'mobile' }] : [],
            memberships: [{
                contactGroupMembership: { contactGroupResourceName: groupResourceName },
            }],
        },
    });

    console.log(`✅ Contact saved: ${displayName}`);
}
