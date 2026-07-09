"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectGuestIntentWithContext = detectGuestIntentWithContext;
const constants_1 = require("../config/constants");
const llm_1 = require("./llm");
const messageHistoryBySource = new Map();
const scopedKey = (platform, sourceId) => `${platform}:${sourceId}`;
const normalizedHistorySize = (contextSize) => Math.max(3, contextSize || constants_1.CONFIG.MESSAGE_HISTORY_CONTEXT_SIZE);
function appendMessage(platform, sourceId, text, contextSize) {
    const key = scopedKey(platform, sourceId);
    const current = messageHistoryBySource.get(key) || [];
    const next = [...current, text].slice(-normalizedHistorySize(contextSize));
    messageHistoryBySource.set(key, next);
    return next;
}
async function detectGuestIntentWithContext(input) {
    const { platform, sourceId, text, senderName, isCancellationHint, historyFallbackEnabled = constants_1.CONFIG.MESSAGE_HISTORY_FALLBACK_ENABLED, historyContextSize = constants_1.CONFIG.MESSAGE_HISTORY_CONTEXT_SIZE, } = input;
    const history = appendMessage(platform, sourceId, text, historyContextSize);
    let result = await (0, llm_1.detectGuestRequest)(text, senderName);
    let usedHistoryFallback = false;
    if (!result && !isCancellationHint && historyFallbackEnabled) {
        result = await (0, llm_1.detectGuestRequestWithHistory)(history, text);
        usedHistoryFallback = Boolean(result);
    }
    // Parse SAVE flag
    let saveToHostfully = false;
    if (result && !result.startsWith('CANCELLED:')) {
        saveToHostfully = !result.includes('| SAVE:NO');
        result = result.replace(/\|\s*SAVE:(YES|NO)/i, '').trim();
    }
    return { result, usedHistoryFallback, saveToHostfully };
}
