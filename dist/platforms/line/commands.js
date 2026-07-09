"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLineMembersCommand = handleLineMembersCommand;
exports.handleLineLinkCommand = handleLineLinkCommand;
exports.handleLineWelcomeCommand = handleLineWelcomeCommand;
exports.handleLineCkinCommand = handleLineCkinCommand;
exports.handleLineCkoutCommand = handleLineCkoutCommand;
exports.handleLineTransCommand = handleLineTransCommand;
const hostfully_1 = require("../../services/hostfully");
const groupNaming_1 = require("../whatsapp/groupNaming");
const groupLeads_1 = require("../../services/groupLeads");
const notify_1 = require("../../services/notify");
const sheets_1 = require("../../services/sheets");
const expenses_1 = require("../../services/expenses");
const lineClient_1 = require("./lineClient");
const constants_1 = require("../../config/constants");
const format_1 = require("../../utils/format");
const translation_1 = require("./translation");
const welcome_1 = require("./welcome");
async function handleLineMembersCommand(sourceId, text, sourceType, replyToken) {
    if (text !== '/members')
        return false;
    await (0, lineClient_1.replyMessage)(replyToken, '⚠️ LINE does not allow bots to list group members (requires verified account). IDs are collected automatically as members send messages.').catch(() => { });
    return true;
}
async function handleLineLinkCommand(sourceId, text, sourceType, replyToken) {
    if (!text.startsWith('/link '))
        return false;
    const parts = text.split(' ').filter(Boolean);
    const uid = parts[1]?.trim();
    const arg2 = parts[2]?.toLowerCase().trim();
    const sendWelcome = arg2 === 'welcome';
    const langArg = sendWelcome ? undefined : arg2;
    const requestedLang = langArg ? translation_1.LANG_MAP[langArg] : undefined;
    if (!uid) {
        try {
            await (0, lineClient_1.replyMessage)(replyToken, '❌ Usage: /link <lead_uid>');
        }
        catch { }
        return true;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(uid);
        (0, groupLeads_1.linkGroup)((0, lineClient_1.lineGroupKey)(sourceId), uid);
        console.log(`🔗 LINE linked: ${(0, lineClient_1.lineGroupKey)(sourceId)} → ${uid}`);
        if (requestedLang) {
            translation_1.groupGuestLang.set(sourceId, requestedLang);
            translation_1.groupTranslationOn.set(sourceId, true);
            (0, groupLeads_1.saveGroupLang)(sourceId, requestedLang);
            console.log(`🌐 LINE translation set [${requestedLang}] | source=${sourceId}`);
        }
        const info = lead.guestInformation;
        const name = (0, format_1.guestName)(info);
        const checkIn = (0, format_1.formatSeoulDate)(lead.checkInLocalDateTime);
        const property = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
        try {
            await (0, lineClient_1.replyMessage)(replyToken, `✅ Linked!\n👤 ${name}\n📅 Check-in: ${checkIn}${requestedLang ? `\n🌐 Translation: ${requestedLang}` : ''}${sendWelcome ? '\n⏳ Sending welcome messages...' : ''}`);
        }
        catch (replyErr) {
            console.warn(`⚠️ LINE reply confirmation failed: ${replyErr?.response?.status || ''} ${replyErr?.message || replyErr}`);
        }
        if (sendWelcome) {
            (async () => {
                try {
                    const nationality = (lead.guestInformation?.countryCode || 'EN').toUpperCase();
                    const sheetLang = nationality === 'KR' ? 'KR' : 'EN';
                    const msgs = await (0, sheets_1.getMessages)(sheetLang);
                    if (msgs['brand_msg'])
                        await (0, lineClient_1.pushMessage)(sourceId, msgs['brand_msg'].replace(/\\n/g, '\n'));
                    const cardUrl = (msgs['business_card_url'] || constants_1.CONFIG.LINE_BUSINESS_CARD_IMAGE_URL || '').trim();
                    if (cardUrl)
                        await (0, lineClient_1.pushImage)(sourceId, cardUrl);
                    if (msgs['intro_msg'])
                        await (0, lineClient_1.pushMessage)(sourceId, msgs['intro_msg'].replace(/\\n/g, '\n'));
                    console.log(`✅ LINE /link welcome sent → ${sourceId}`);
                }
                catch (e) {
                    console.error('❌ LINE /link welcome error:', e?.message);
                }
            })();
        }
        await (0, notify_1.sendAlert)(`🔗 <b>LINE Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `📅 <b>Check-in:</b> ${checkIn}\n` +
            `🔑 <b>UID:</b> <code>${uid}</code>\n` +
            `📱 <b>Source:</b> ${sourceType} (${sourceId.slice(0, 20)}...)\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'LINE', useTestJandi: uid === '70778c3a-d60b-4473-a597-a5d6292628f5', propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined });
    }
    catch (e) {
        const is404 = e.status === 404;
        const errMsg = e?.message || String(e);
        console.error('❌ /link error:', errMsg);
        try {
            await (0, lineClient_1.replyMessage)(replyToken, is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error linking group');
        }
        catch { }
        await (0, notify_1.sendAlert)(`⚠️ <b>LINE /link Failed</b>\n─────────────────\n` +
            `🔑 <b>UID attempted:</b> <code>${uid}</code>\n` +
            `📱 <b>Source:</b> ${sourceId.slice(0, 20)}...\n` +
            `❌ <b>Error:</b> ${errMsg}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'LINE' }).catch(() => { });
    }
    return true;
}
async function handleLineWelcomeCommand(sourceId, text, replyToken) {
    if (!text.startsWith('/welcome'))
        return false;
    const parts = text.split(' ').filter(Boolean);
    const isLangCode = (s) => !!(s && translation_1.LANG_MAP[s.toLowerCase()]);
    const requestedUid = parts[1] && !isLangCode(parts[1]) ? parts[1].trim() : undefined;
    const langArg = isLangCode(parts[1]) ? parts[1].toLowerCase() : parts[2]?.toLowerCase().trim();
    const requestedLang = langArg ? translation_1.LANG_MAP[langArg] : undefined;
    const linkedUid = (0, groupLeads_1.getLeadUid)((0, lineClient_1.lineGroupKey)(sourceId));
    const leadUid = requestedUid || linkedUid;
    if (!leadUid) {
        try {
            await (0, lineClient_1.replyMessage)(replyToken, '❌ Usage: /welcome <lead_uid> (or link group first with /link)');
        }
        catch { }
        return true;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(leadUid);
        const info = lead?.guestInformation || {};
        const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy || '';
        let propertyName = lead?.propertyName || 'COZE Property';
        if (propertyUid) {
            try {
                const property = await (0, hostfully_1.fetchProperty)(propertyUid);
                if (property?.name)
                    propertyName = property.name;
            }
            catch { }
        }
        const effectiveLang = requestedLang || translation_1.groupGuestLang.get(sourceId) ||
            (0, groupLeads_1.getGroupLang)(sourceId);
        await (0, welcome_1.sendLineWelcome)({
            userId: sourceId,
            replyToken,
            guest_name: (0, format_1.guestName)(info),
            property: propertyName,
            check_in: lead?.checkInLocalDateTime || '',
            check_out: lead?.checkOutLocalDateTime || '',
            nationality: info?.countryCode || 'EN',
            lead_uid: leadUid,
            guestLang: effectiveLang,
        });
        if (requestedLang) {
            translation_1.groupGuestLang.set(sourceId, requestedLang);
            translation_1.groupTranslationOn.set(sourceId, true);
            (0, groupLeads_1.saveGroupLang)(sourceId, requestedLang);
            console.log(`🌐 LINE translation set [${requestedLang}] | source=${sourceId}`);
        }
        console.log(`✅ LINE /welcome sent | source=${sourceId} | lead=${leadUid}`);
    }
    catch (e) {
        const errMsg = e?.message || String(e);
        console.error('❌ /welcome error:', errMsg);
        try {
            await (0, lineClient_1.replyMessage)(replyToken, `❌ Failed to send welcome: ${errMsg}`);
        }
        catch { }
        await (0, notify_1.sendAlert)(`⚠️ <b>LINE /welcome Failed</b>\n─────────────────\n` +
            `🔑 <b>Lead UID:</b> <code>${leadUid}</code>\n` +
            `📱 <b>Source:</b> ${sourceId.slice(0, 20)}...\n` +
            `❌ <b>Error:</b> ${errMsg}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'LINE' }).catch(() => { });
    }
    return true;
}
async function handleLineCkinCommand(sourceId, replyToken) {
    const leadUid = (0, groupLeads_1.getLeadUid)((0, lineClient_1.lineGroupKey)(sourceId));
    if (!leadUid) {
        await (0, lineClient_1.replyMessage)(replyToken, '❌ Group not linked. Use /link <lead_uid> first').catch(() => { });
        return true;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(leadUid);
        const nationality = (lead?.guestInformation?.countryCode || 'US').toUpperCase();
        const lang = nationality === 'KR' ? 'KR' : nationality === 'JP' ? 'JA' : (nationality === 'CN' || nationality === 'TW') ? 'ZH' : 'EN';
        const propertyName = lead?.propertyName || lead?.unit?.name || '';
        const tipKeys = propertyName.includes('JTS') ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
        await (0, lineClient_1.replyMessage)(replyToken, '⏳ Sending check-in messages...').catch(() => { });
        for (const key of tipKeys) {
            const msg = await (0, sheets_1.getTipsMessage)(key, lang);
            if (msg)
                await (0, lineClient_1.pushMessage)(sourceId, msg);
        }
        const rules = await (0, sheets_1.getTipsMessage)('guest_rules', lang);
        if (rules)
            await (0, lineClient_1.pushMessage)(sourceId, rules);
        console.log(`✅ LINE /ckin sent → ${sourceId}`);
    }
    catch (e) {
        console.error('❌ LINE /ckin error:', e?.message);
        await (0, lineClient_1.replyMessage)(replyToken, '❌ Failed to send check-in messages').catch(() => { });
    }
    return true;
}
async function handleLineCkoutCommand(sourceId, text, replyToken) {
    if (!text.startsWith('/ckout'))
        return false;
    const leadUid = (0, groupLeads_1.getLeadUid)((0, lineClient_1.lineGroupKey)(sourceId));
    if (!leadUid) {
        await (0, lineClient_1.replyMessage)(replyToken, '❌ Group not linked. Use /link <lead_uid> first').catch(() => { });
        return true;
    }
    try {
        if (text.trim() === '/ckout exp') {
            const had = await (0, expenses_1.sendExpenseSummary)(leadUid, async (msg) => (0, lineClient_1.pushMessage)(sourceId, msg), `line:${sourceId}`);
            if (!had)
                return true;
            const payMsg = await (0, sheets_1.getScheduledMessage)('payment_reminder', 'EN');
            if (payMsg)
                await (0, lineClient_1.pushMessage)(sourceId, payMsg);
            console.log(`✅ LINE /ckout exp sent → ${sourceId}`);
            return true;
        }
        const message = await (0, sheets_1.getScheduledMessage)('checkout_reminder', 'EN');
        if (!message) {
            await (0, lineClient_1.replyMessage)(replyToken, '❌ Checkout message not found in Sheets').catch(() => { });
            return true;
        }
        await (0, lineClient_1.pushMessage)(sourceId, message);
        console.log(`✅ LINE /ckout sent → ${sourceId}`);
    }
    catch (e) {
        console.error('❌ LINE /ckout error:', e?.message);
        await (0, lineClient_1.replyMessage)(replyToken, '❌ Failed to send checkout message').catch(() => { });
    }
    return true;
}
async function handleLineTransCommand(sourceId, text, replyToken) {
    if (!text.startsWith('/trans'))
        return false;
    const arg = text.split(' ')[1]?.toLowerCase().trim();
    if (!arg) {
        const current = translation_1.groupGuestLang.get(sourceId);
        const isOn = translation_1.groupTranslationOn.get(sourceId) !== false;
        await (0, lineClient_1.replyMessage)(replyToken, `🌐 Translation: ${current ? `${current} (${isOn ? 'ON' : 'OFF'})` : 'not set'}`);
        return true;
    }
    if (arg === 'off') {
        translation_1.groupTranslationOn.set(sourceId, false);
        await (0, lineClient_1.replyMessage)(replyToken, '🌐 Translation paused. Use /trans on to resume.');
        return true;
    }
    if (arg === 'on') {
        translation_1.groupTranslationOn.set(sourceId, true);
        const lang = translation_1.groupGuestLang.get(sourceId);
        await (0, lineClient_1.replyMessage)(replyToken, lang ? `🌐 Translation resumed: ${lang}` : '🌐 No language set. Use /trans jp or /trans cn first.');
        return true;
    }
    const newLang = translation_1.LANG_MAP[arg];
    if (newLang) {
        translation_1.groupGuestLang.set(sourceId, newLang);
        translation_1.groupTranslationOn.set(sourceId, true);
        (0, groupLeads_1.saveGroupLang)(sourceId, newLang);
        await (0, lineClient_1.replyMessage)(replyToken, `🌐 Translation set: ${newLang}`);
        console.log(`🌐 LINE /trans [${newLang}] | source=${sourceId}`);
    }
    else {
        await (0, lineClient_1.replyMessage)(replyToken, '❌ Unknown language. Use: jp, cn, tw, th, en');
    }
    return true;
}
