import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config/constants';
import { getAllEntries, reloadKB, KBEntry } from '../knowledge/kb';

const KB_PATH = path.resolve(process.cwd(), 'src/knowledge/knowledge-base.json');

// Domains with no scrapable COZE-specific content
const SKIP_DOMAINS = [
    'naver.me', 'naver.com',
    'klook.com', 'trazy.com', 'pelago.com',
    'wise.com', 'play.google.com', 'apps.apple.com',
    'docs.google.com',
];

function shouldSkip(url: string): boolean {
    try {
        const host = new URL(url).hostname;
        return SKIP_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    } catch { return true; }
}

function extractText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 7000);
}

async function fetchText(url: string): Promise<string | null> {
    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; COZMO-KB/1.0)' },
            maxRedirects: 5,
        });
        return extractText(String(res.data));
    } catch { return null; }
}

async function extractFacts(title: string, pageText: string): Promise<string[]> {
    const prompt = `You are extracting concise facts for a hospitality knowledge base.

Entry title: "${title}"
Webpage content:
${pageText}

Extract 5-15 key facts a guest or staff member would need. Focus on: pricing, what is included, how to book, contact details, scheduling, and important notes.
Output ONLY a valid JSON array of strings. No explanation, no markdown.
Example: ["Fact one.", "Fact two."]`;

    try {
        const res = await axios.post(CONFIG.LM_STUDIO_URL, {
            model: CONFIG.LM_MODEL,
            messages: [
                { role: 'system', content: 'Extract hospitality facts from webpages. Output only a valid JSON array of strings.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 1200,
            temperature: 0.2,
        }, { timeout: 60000 });
        const raw = (res.data.choices[0].message.content || '').trim();
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) return [];
        return JSON.parse(match[0]) as string[];
    } catch (e: any) {
        console.error(`❌ KB sync LLM failed for "${title}":`, e?.message);
        return [];
    }
}

export interface SyncResult {
    id: string;
    title: string;
    url: string;
    status: 'updated' | 'skipped' | 'failed';
    factsCount?: number;
}

export async function syncKBLinks(): Promise<SyncResult[]> {
    const entries = getAllEntries();
    const results: SyncResult[] = [];

    const kbRaw = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'));

    for (const entry of entries) {
        const fetchable = entry.links.filter(l => !shouldSkip(l));
        if (!fetchable.length) continue;

        const url = fetchable[0];
        const text = await fetchText(url);

        if (!text || text.length < 100) {
            results.push({ id: entry.id, title: entry.title, url, status: 'failed' });
            continue;
        }

        const facts = await extractFacts(entry.title, text);
        if (!facts.length) {
            results.push({ id: entry.id, title: entry.title, url, status: 'failed' });
            continue;
        }

        const idx = kbRaw.entries.findIndex((e: KBEntry) => e.id === entry.id);
        if (idx !== -1) kbRaw.entries[idx].facts = facts;

        results.push({ id: entry.id, title: entry.title, url, status: 'updated', factsCount: facts.length });
    }

    kbRaw.generatedAt = new Date().toISOString();
    fs.writeFileSync(KB_PATH, JSON.stringify(kbRaw, null, 2), 'utf-8');
    reloadKB();

    return results;
}
