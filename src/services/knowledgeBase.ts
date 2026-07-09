import * as fs from 'fs';
import * as path from 'path';

interface KBEntry {
    id: string;
    propertyCode: string;
    category: string;
    title: string;
    triggers: string[];
    facts: string[];
    links: string[];
    sensitive: boolean;
}

interface KnowledgeBase {
    entries: KBEntry[];
}

let kb: KnowledgeBase | null = null;

function loadKB(): KnowledgeBase {
    if (kb) return kb;
    try {
        const filePath = path.join(__dirname, '../../src/knowledge/knowledge-base.json');
        kb = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as KnowledgeBase;
    } catch (e: any) {
        console.error('⚠️ KB load failed:', e?.message);
        kb = { entries: [] };
    }
    return kb;
}

export function searchKB(question: string, propertyCode?: string): string {
    const { entries } = loadKB();
    const lowerQ = question.toLowerCase();

    const matched = entries.filter(e => {
        if (e.sensitive) return false;
        if (propertyCode && e.propertyCode !== 'ALL' && e.propertyCode !== propertyCode) return false;
        return e.triggers.some(t => lowerQ.includes(t.toLowerCase()));
    });

    if (matched.length === 0) return '';

    const seen = new Set<string>();
    const facts: string[] = [];
    const links: string[] = [];
    for (const e of matched) {
        for (const f of e.facts) { if (!seen.has(f)) { seen.add(f); facts.push(f); } }
        for (const l of e.links) { if (!seen.has(l)) { seen.add(l); links.push(l); } }
        if (facts.length >= 10) break;
    }

    let context = `\nRelevant facts:\n${facts.map(f => `- ${f}`).join('\n')}`;
    if (links.length) context += `\nUseful links:\n${links.map(l => `- ${l}`).join('\n')}`;
    return context;
}

// Returns all non-sensitive KB facts for the given property context — used to
// build a comprehensive system prompt so COZMO answers from real data, not hardcoded guesses.
export function buildSystemKB(propertyCode?: string): string {
    const { entries } = loadKB();
    const relevant = entries.filter(e => {
        if (e.sensitive) return false;
        if (!e.facts.length) return false;
        return e.propertyCode === 'ALL' || !propertyCode || e.propertyCode === propertyCode;
    });
    if (!relevant.length) return '';

    const lines: string[] = [];
    let factCount = 0;
    for (const entry of relevant) {
        if (factCount >= 250) break;
        lines.push(`[${entry.title}]`);
        for (const f of entry.facts) { lines.push(`• ${f}`); factCount++; }
        if (entry.links.length) lines.push(`→ ${entry.links[0]}`);
    }
    return lines.join('\n');
}
