import { fetchLead, fetchProperty, resolvePropertyNameForLead } from '../../services/hostfully';
import { propertyCodeFromName } from '../whatsapp/groupNaming';
import { linkGroup, getLeadUid, saveGroupLang, getGroupLang } from '../../services/groupLeads';
import { sendAlert } from '../../services/notify';
import { getScheduledMessage, getMessages, getTipsMessage } from '../../services/sheets';
import { sendExpenseSummary } from '../../services/expenses';
import { SupportedLang } from '../../services/llm';
import { replyMessage, pushMessage, pushImage, lineGroupKey } from './lineClient';
import { CONFIG, skipsBreakfast } from '../../config/constants';
import { guestName, formatSeoulDate } from '../../utils/format';
import { LANG_MAP, groupGuestLang, groupTranslationOn } from './translation';
import { sendLineWelcome } from './welcome';


export async function handleLineMembersCommand(sourceId: string, text: string, sourceType: string, replyToken: string): Promise<boolean> {
    if (text !== '/members') return false;
    await replyMessage(replyToken, '⚠️ LINE does not allow bots to list group members (requires verified account). IDs are collected automatically as members send messages.').catch(() => { });
    return true;
}

export async function handleLineLinkCommand(
    sourceId: string,
    text: string,
    sourceType: string,
    replyToken: string
): Promise<boolean> {
    if (!text.startsWith('/link ')) return false;

    const parts = text.split(' ').filter(Boolean);
    const uid = parts[1]?.trim();
    const arg2 = parts[2]?.toLowerCase().trim();
    const sendWelcome = arg2 === 'welcome';
    const langArg = sendWelcome ? undefined : arg2;
    const requestedLang = langArg ? LANG_MAP[langArg] : undefined;

    if (!uid) {
        try { await replyMessage(replyToken, '❌ Usage: /link <lead_uid>'); } catch { }
        return true;
    }

    try {
        const lead = await fetchLead(uid);
        linkGroup(lineGroupKey(sourceId), uid);
        console.log(`🔗 LINE linked: ${lineGroupKey(sourceId)} → ${uid}`);

        if (requestedLang) {
            groupGuestLang.set(sourceId, requestedLang);
            groupTranslationOn.set(sourceId, true);
            saveGroupLang(sourceId, requestedLang);
            console.log(`🌐 LINE translation set [${requestedLang}] | source=${sourceId}`);
        }

        const info = lead.guestInformation;
        const name = guestName(info);
        const checkIn = formatSeoulDate(lead.checkInLocalDateTime);
        const property = await resolvePropertyNameForLead(lead);

        try {
            await replyMessage(replyToken, `✅ Linked!\n👤 ${name}\n📅 Check-in: ${checkIn}${requestedLang ? `\n🌐 Translation: ${requestedLang}` : ''}${sendWelcome ? '\n⏳ Sending welcome messages...' : ''}`);
        } catch (replyErr: any) {
            console.warn(`⚠️ LINE reply confirmation failed: ${replyErr?.response?.status || ''} ${replyErr?.message || replyErr}`);
        }

        if (sendWelcome) {
            (async () => {
                try {
                    const nationality = (lead.guestInformation?.countryCode || 'EN').toUpperCase();
                    const sheetLang = nationality === 'KR' ? 'KR' : 'EN';
                    const msgs = await getMessages(sheetLang);
                    if (msgs['brand_msg']) await pushMessage(sourceId, msgs['brand_msg'].replace(/\\n/g, '\n'));
                    const cardUrl = (msgs['business_card_url'] || CONFIG.LINE_BUSINESS_CARD_IMAGE_URL || '').trim();
                    if (cardUrl) await pushImage(sourceId, cardUrl);
                    if (msgs['intro_msg']) await pushMessage(sourceId, msgs['intro_msg'].replace(/\\n/g, '\n'));
                    console.log(`✅ LINE /link welcome sent → ${sourceId}`);
                } catch (e: any) {
                    console.error('❌ LINE /link welcome error:', e?.message);
                }
            })();
        }

        await sendAlert(
            `🔗 <b>LINE Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `📅 <b>Check-in:</b> ${checkIn}\n` +
            `🔑 <b>UID:</b> <code>${uid}</code>\n` +
            `📱 <b>Source:</b> ${sourceType} (${sourceId.slice(0, 20)}...)\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'LINE', useTestJandi: uid === '70778c3a-d60b-4473-a597-a5d6292628f5', propertyCode: propertyCodeFromName(property) || undefined }
        );
    } catch (e: any) {
        const is404 = (e as any).status === 404;
        const errMsg = e?.message || String(e);
        console.error('❌ /link error:', errMsg);
        try { await replyMessage(replyToken, is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error linking group'); } catch { }
        await sendAlert(
            `⚠️ <b>LINE /link Failed</b>\n─────────────────\n` +
            `🔑 <b>UID attempted:</b> <code>${uid}</code>\n` +
            `📱 <b>Source:</b> ${sourceId.slice(0, 20)}...\n` +
            `❌ <b>Error:</b> ${errMsg}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'LINE' }
        ).catch(() => { });
    }
    return true;
}

export async function handleLineWelcomeCommand(sourceId: string, text: string, replyToken: string): Promise<boolean> {
    if (!text.startsWith('/welcome')) return false;

    const parts = text.split(' ').filter(Boolean);
    const isLangCode = (s?: string) => !!(s && LANG_MAP[s.toLowerCase()]);
    const requestedUid = parts[1] && !isLangCode(parts[1]) ? parts[1].trim() : undefined;
    const langArg = isLangCode(parts[1]) ? parts[1].toLowerCase() : parts[2]?.toLowerCase().trim();
    const requestedLang = langArg ? LANG_MAP[langArg] : undefined;
    const linkedUid = getLeadUid(lineGroupKey(sourceId));
    const leadUid = requestedUid || linkedUid;

    if (!leadUid) {
        try { await replyMessage(replyToken, '❌ Usage: /welcome <lead_uid> (or link group first with /link)'); } catch { }
        return true;
    }

    try {
        const lead = await fetchLead(leadUid);
        const info = lead?.guestInformation || {};
        const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy || '';
        let propertyName = lead?.propertyName || 'COZE Property';
        if (propertyUid) {
            try {
                const property = await fetchProperty(propertyUid);
                if (property?.name) propertyName = property.name;
            } catch { }
        }

        const effectiveLang = requestedLang || groupGuestLang.get(sourceId) ||
            (getGroupLang(sourceId) as SupportedLang | undefined);

        await sendLineWelcome({
            userId: sourceId,
            replyToken,
            guest_name: guestName(info),
            property: propertyName,
            check_in: lead?.checkInLocalDateTime || '',
            check_out: lead?.checkOutLocalDateTime || '',
            nationality: info?.countryCode || 'EN',
            lead_uid: leadUid,
            guestLang: effectiveLang,
        });

        if (requestedLang) {
            groupGuestLang.set(sourceId, requestedLang);
            groupTranslationOn.set(sourceId, true);
            saveGroupLang(sourceId, requestedLang);
            console.log(`🌐 LINE translation set [${requestedLang}] | source=${sourceId}`);
        }

        console.log(`✅ LINE /welcome sent | source=${sourceId} | lead=${leadUid}`);
    } catch (e: any) {
        const errMsg = e?.message || String(e);
        console.error('❌ /welcome error:', errMsg);
        try { await replyMessage(replyToken, `❌ Failed to send welcome: ${errMsg}`); } catch { }
        await sendAlert(
            `⚠️ <b>LINE /welcome Failed</b>\n─────────────────\n` +
            `🔑 <b>Lead UID:</b> <code>${leadUid}</code>\n` +
            `📱 <b>Source:</b> ${sourceId.slice(0, 20)}...\n` +
            `❌ <b>Error:</b> ${errMsg}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'LINE' }
        ).catch(() => { });
    }
    return true;
}

export async function handleLineCkinCommand(sourceId: string, replyToken: string): Promise<boolean> {
    const leadUid = getLeadUid(lineGroupKey(sourceId));
    if (!leadUid) {
        await replyMessage(replyToken, '❌ Group not linked. Use /link <lead_uid> first').catch(() => {});
        return true;
    }
    try {
        const lead = await fetchLead(leadUid);
        const nationality = (lead?.guestInformation?.countryCode || 'US').toUpperCase();
        const lang = nationality === 'KR' ? 'KR' : nationality === 'JP' ? 'JA' : (nationality === 'CN' || nationality === 'TW') ? 'ZH' : 'EN';
        const propertyName = lead?.propertyName || lead?.unit?.name || '';
        const tipKeys = skipsBreakfast(propertyName) ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
        await replyMessage(replyToken, '⏳ Sending check-in messages...').catch(() => {});
        for (const key of tipKeys) {
            const msg = await getTipsMessage(key, lang);
            if (msg) await pushMessage(sourceId, msg);
        }
        const rules = await getTipsMessage('guest_rules', lang);
        if (rules) await pushMessage(sourceId, rules);
        console.log(`✅ LINE /ckin sent → ${sourceId}`);
    } catch (e: any) {
        console.error('❌ LINE /ckin error:', e?.message);
        await replyMessage(replyToken, '❌ Failed to send check-in messages').catch(() => {});
    }
    return true;
}

export async function handleLineCkoutCommand(sourceId: string, text: string, replyToken: string): Promise<boolean> {
    if (!text.startsWith('/ckout')) return false;
    const leadUid = getLeadUid(lineGroupKey(sourceId));
    if (!leadUid) {
        await replyMessage(replyToken, '❌ Group not linked. Use /link <lead_uid> first').catch(() => {});
        return true;
    }
    try {
        if (text.trim() === '/ckout exp') {
            const had = await sendExpenseSummary(leadUid, async (msg) => pushMessage(sourceId, msg), `line:${sourceId}`);
            if (!had) return true;
            const payMsg = await getScheduledMessage('payment_reminder', 'EN');
            if (payMsg) await pushMessage(sourceId, payMsg);
            console.log(`✅ LINE /ckout exp sent → ${sourceId}`);
            return true;
        }
        const message = await getScheduledMessage('checkout_reminder', 'EN');
        if (!message) {
            await replyMessage(replyToken, '❌ Checkout message not found in Sheets').catch(() => {});
            return true;
        }
        await pushMessage(sourceId, message);
        console.log(`✅ LINE /ckout sent → ${sourceId}`);
    } catch (e: any) {
        console.error('❌ LINE /ckout error:', e?.message);
        await replyMessage(replyToken, '❌ Failed to send checkout message').catch(() => {});
    }
    return true;
}

export async function handleLineTransCommand(sourceId: string, text: string, replyToken: string): Promise<boolean> {
    if (!text.startsWith('/trans')) return false;

    const arg = text.split(' ')[1]?.toLowerCase().trim();

    if (!arg) {
        const current = groupGuestLang.get(sourceId);
        const isOn = groupTranslationOn.get(sourceId) !== false;
        await replyMessage(replyToken, `🌐 Translation: ${current ? `${current} (${isOn ? 'ON' : 'OFF'})` : 'not set'}`);
        return true;
    }
    if (arg === 'off') {
        groupTranslationOn.set(sourceId, false);
        await replyMessage(replyToken, '🌐 Translation paused. Use /trans on to resume.');
        return true;
    }
    if (arg === 'on') {
        groupTranslationOn.set(sourceId, true);
        const lang = groupGuestLang.get(sourceId);
        await replyMessage(replyToken, lang ? `🌐 Translation resumed: ${lang}` : '🌐 No language set. Use /trans jp or /trans cn first.');
        return true;
    }
    const newLang = LANG_MAP[arg];
    if (newLang) {
        groupGuestLang.set(sourceId, newLang);
        groupTranslationOn.set(sourceId, true);
        saveGroupLang(sourceId, newLang);
        await replyMessage(replyToken, `🌐 Translation set: ${newLang}`);
        console.log(`🌐 LINE /trans [${newLang}] | source=${sourceId}`);
    } else {
        await replyMessage(replyToken, '❌ Unknown language. Use: jp, cn, tw, th, en');
    }
    return true;
}
