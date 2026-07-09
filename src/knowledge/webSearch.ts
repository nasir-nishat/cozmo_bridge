import axios from 'axios';
import { CONFIG } from '../config/constants';

export interface WebSearchResult {
    found:   boolean;
    text:    string;
    source?: string;
}

interface SerperAnswerBox {
    answer?:  string;
    snippet?: string;
    title?:   string;
}
interface SerperOrganic {
    title:    string;
    link:     string;
    snippet:  string;
}
interface SerperResponse {
    answerBox?: SerperAnswerBox;
    organic?:   SerperOrganic[];
}

interface DDGInstant {
    Answer?:        string;
    AbstractText?:  string;
    AbstractURL?:   string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
}

// Uses Serper (Google) when SERPER_API_KEY is set; falls back to DDG Instant Answers.
export async function webSearch(query: string): Promise<WebSearchResult> {
    if (CONFIG.SERPER_API_KEY) {
        return serperSearch(query);
    }
    console.warn('⚠️ SERPER_API_KEY not set — falling back to DDG instant answers (limited coverage)');
    return ddgInstantAnswers(query);
}

async function serperSearch(query: string): Promise<WebSearchResult> {
    try {
        const res = await axios.post<SerperResponse>(
            'https://google.serper.dev/search',
            { q: query, num: 5, gl: 'kr', hl: 'en' },
            {
                headers: {
                    'X-API-KEY':    CONFIG.SERPER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 8000,
            },
        );

        const d = res.data;

        // answerBox is a direct Google answer — highest confidence
        const boxText = d.answerBox?.answer || d.answerBox?.snippet;
        if (boxText) {
            return { found: true, text: boxText.trim(), source: d.answerBox?.title };
        }

        // Fall through to organic snippets
        const snippets = (d.organic ?? [])
            .slice(0, 3)
            .map(r => r.snippet?.trim())
            .filter(Boolean) as string[];

        if (snippets.length === 0) return { found: false, text: '' };

        return {
            found:  true,
            text:   snippets.join(' | '),
            source: d.organic![0].link,
        };
    } catch (e: any) {
        console.error('🌐 Serper search error:', e?.message);
        return { found: false, text: '' };
    }
}

async function ddgInstantAnswers(query: string): Promise<WebSearchResult> {
    try {
        const res = await axios.get<DDGInstant>('https://api.duckduckgo.com/', {
            params: { q: query, format: 'json', no_redirect: '1', no_html: '1', skip_disambig: '1' },
            timeout: 6000,
        });
        const d = res.data;

        if (d.Answer) return { found: true, text: d.Answer };
        if (d.AbstractText && d.AbstractText.length > 40)
            return { found: true, text: d.AbstractText.slice(0, 600), source: d.AbstractURL };

        const topic = d.RelatedTopics?.find(t => t.Text && t.Text.length > 30);
        if (topic) return { found: true, text: topic.Text!.slice(0, 400), source: topic.FirstURL };

        return { found: false, text: '' };
    } catch (e: any) {
        console.error('🌐 DDG instant error:', e?.message);
        return { found: false, text: '' };
    }
}

// Kept for import compatibility
export function formatWebResultAsFacts(result: WebSearchResult, _query: string): string {
    return result.text;
}
