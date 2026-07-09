"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGuestContact = saveGuestContact;
const googleapis_1 = require("googleapis");
const google_auth_1 = __importDefault(require("./google-auth"));
const people = googleapis_1.google.people({ version: 'v1', auth: google_auth_1.default });
const GROUP_NAME = '에어비앤비 게스트';
let cachedGroupResourceName = null;
async function getOrCreateContactGroup() {
    if (cachedGroupResourceName)
        return cachedGroupResourceName;
    const res = await people.contactGroups.list({ pageSize: 200 });
    const existing = (res.data.contactGroups || []).find(g => g.name === GROUP_NAME);
    if (existing?.resourceName) {
        cachedGroupResourceName = existing.resourceName;
        return existing.resourceName;
    }
    const created = await people.contactGroups.create({
        requestBody: { contactGroup: { name: GROUP_NAME } },
    });
    cachedGroupResourceName = created.data.resourceName;
    return cachedGroupResourceName;
}
async function saveGuestContact(guestFullName, phone, propertyCode) {
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
