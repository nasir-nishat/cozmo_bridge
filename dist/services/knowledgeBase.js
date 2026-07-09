"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKB = searchKB;
exports.buildSystemKB = buildSystemKB;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let kb = null;
function loadKB() {
    if (kb)
        return kb;
    try {
        const filePath = path.join(__dirname, '../../src/knowledge/knowledge-base.json');
        kb = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch (e) {
        console.error('⚠️ KB load failed:', e?.message);
        kb = { entries: [] };
    }
    return kb;
}
function searchKB(question, propertyCode) {
    const { entries } = loadKB();
    const lowerQ = question.toLowerCase();
    const matched = entries.filter(e => {
        if (e.sensitive)
            return false;
        if (propertyCode && e.propertyCode !== 'ALL' && e.propertyCode !== propertyCode)
            return false;
        return e.triggers.some(t => lowerQ.includes(t.toLowerCase()));
    });
    if (matched.length === 0)
        return '';
    const seen = new Set();
    const facts = [];
    const links = [];
    for (const e of matched) {
        for (const f of e.facts) {
            if (!seen.has(f)) {
                seen.add(f);
                facts.push(f);
            }
        }
        for (const l of e.links) {
            if (!seen.has(l)) {
                seen.add(l);
                links.push(l);
            }
        }
        if (facts.length >= 10)
            break;
    }
    let context = `\nRelevant facts:\n${facts.map(f => `- ${f}`).join('\n')}`;
    if (links.length)
        context += `\nUseful links:\n${links.map(l => `- ${l}`).join('\n')}`;
    return context;
}
// Returns all non-sensitive KB facts for the given property context — used to
// build a comprehensive system prompt so COZMO answers from real data, not hardcoded guesses.
function buildSystemKB(propertyCode) {
    const { entries } = loadKB();
    const relevant = entries.filter(e => {
        if (e.sensitive)
            return false;
        if (!e.facts.length)
            return false;
        return e.propertyCode === 'ALL' || !propertyCode || e.propertyCode === propertyCode;
    });
    if (!relevant.length)
        return '';
    const lines = [];
    let factCount = 0;
    for (const entry of relevant) {
        if (factCount >= 250)
            break;
        lines.push(`[${entry.title}]`);
        for (const f of entry.facts) {
            lines.push(`• ${f}`);
            factCount++;
        }
        if (entry.links.length)
            lines.push(`→ ${entry.links[0]}`);
    }
    return lines.join('\n');
}
