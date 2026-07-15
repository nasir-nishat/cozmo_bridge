// Defeats WhatsApp's cross-recipient content matching (the "identical template to many
// recipients" spam signal) by making every group's welcome text unique. Meaning-preserving:
// resolves spintax the copy author writes, fills in guest/property, and rotates an opener.

export interface VariationCtx {
    name?: string;
    property?: string;
}

// Resolve nested spintax: "{Hi|Hello|Hey}" → one random option. Author-controlled variety.
export function spin(text: string): string {
    let out = text;
    // Innermost braces first so nesting works; bounded loop guards against malformed input
    for (let i = 0; i < 20 && /\{[^{}]*\|[^{}]*\}/.test(out); i++) {
        out = out.replace(/\{([^{}]*)\}/g, (whole, body: string) => {
            if (!body.includes('|')) return whole;
            const opts = body.split('|');
            return opts[Math.floor(Math.random() * opts.length)];
        });
    }
    return out;
}

function fill(text: string, ctx: VariationCtx): string {
    return text
        .replace(/\{\{\s*name\s*\}\}/gi, ctx.name?.trim() || 'there')
        .replace(/\{\{\s*property\s*\}\}/gi, ctx.property?.trim() || 'your COZE home');
}

// A short, warm, varied opener prepended to the first welcome message. Because it embeds the
// guest's name and is randomly chosen, no two lead messages hash alike — and a named, personal
// greeting is far likelier to earn a reply (reply-ratio is itself a heavily weighted spam signal).
const OPENERS = [
    'Hi {{name}}! 😊',
    'Hello {{name}} 👋',
    'Hey {{name}}! 🙌',
    'Welcome, {{name}}! 🌿',
    '{{name}}, so glad you\'re here! 😊',
    'Hi there {{name}} ✨',
];

export function renderMessage(raw: string, ctx: VariationCtx, opts: { withOpener?: boolean } = {}): string {
    let body = fill(spin(raw), ctx);
    if (opts.withOpener && ctx.name) {
        const opener = fill(spin(OPENERS[Math.floor(Math.random() * OPENERS.length)]), ctx);
        body = `${opener}\n\n${body}`;
    }
    return body;
}
