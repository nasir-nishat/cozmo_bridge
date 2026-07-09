import { CONFIG } from '../config/constants';
import { detectGuestRequest, detectGuestRequestWithHistory } from './llm';

const messageHistoryBySource = new Map<string, string[]>();

const scopedKey = (platform: string, sourceId: string) => `${platform}:${sourceId}`;
const normalizedHistorySize = (contextSize?: number) =>
    Math.max(3, contextSize || CONFIG.MESSAGE_HISTORY_CONTEXT_SIZE);

function appendMessage(platform: string, sourceId: string, text: string, contextSize?: number): string[] {
    const key = scopedKey(platform, sourceId);
    const current = messageHistoryBySource.get(key) || [];
    const next = [...current, text].slice(-normalizedHistorySize(contextSize));
    messageHistoryBySource.set(key, next);
    return next;
}

type DetectIntentInput = {
    platform: string;
    sourceId: string;
    text: string;
    senderName?: string;
    isCancellationHint: boolean;
    historyFallbackEnabled?: boolean;
    historyContextSize?: number;
};

type DetectIntentOutput = {
    result: string | null;
    usedHistoryFallback: boolean;
    saveToHostfully: boolean;
};

export async function detectGuestIntentWithContext(input: DetectIntentInput): Promise<DetectIntentOutput> {
    const {
        platform,
        sourceId,
        text,
        senderName,
        isCancellationHint,
        historyFallbackEnabled = CONFIG.MESSAGE_HISTORY_FALLBACK_ENABLED,
        historyContextSize = CONFIG.MESSAGE_HISTORY_CONTEXT_SIZE,
    } = input;

    const history = appendMessage(platform, sourceId, text, historyContextSize);

    let result = await detectGuestRequest(text, senderName);
    let usedHistoryFallback = false;

    if (!result && !isCancellationHint && historyFallbackEnabled) {
        result = await detectGuestRequestWithHistory(history, text);
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