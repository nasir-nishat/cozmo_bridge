import { google } from 'googleapis';
import oAuth2Client from '../src/services/google-auth';
import { CONFIG } from '../src/config/constants';

const LANG_SUFFIX = ['_EN', '_KR', '_ZH', '_JA'];

async function run() {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const spreadsheetId = CONFIG.SHEET_ID;

    // 1. Read existing data
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'scheduled_messages!A:B',
    });
    const existing = res.data.values || [];

    // 2. Group by base key → { key: { EN, KR, ZH, JA } }
    const grouped: Record<string, Record<string, string>> = {};
    for (const [rawKey, message] of existing) {
        let baseKey = rawKey;
        let lang = 'EN';
        for (const suffix of LANG_SUFFIX) {
            if (rawKey.endsWith(suffix)) {
                baseKey = rawKey.slice(0, -suffix.length);
                lang = suffix.slice(1); // strip leading _
                break;
            }
        }
        if (!grouped[baseKey]) grouped[baseKey] = {};
        grouped[baseKey][lang] = message || '';
    }

    // 3. Build new rows — header + data
    const header = ['Key', 'EN', 'KR', 'ZH', 'JA'];
    const rows = [header];
    for (const [key, langs] of Object.entries(grouped)) {
        rows.push([
            key,
            langs['EN'] || '',
            langs['KR'] || '',
            langs['ZH'] || '',
            langs['JA'] || '',
        ]);
    }

    // 4. Clear sheet and write new structure
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'scheduled_messages' });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'scheduled_messages!A1',
        valueInputOption: 'RAW',
        requestBody: { values: rows },
    });

    // 5. Get sheet ID for formatting
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = meta.data.sheets?.find(s => s.properties?.title === 'scheduled_messages')?.properties?.sheetId ?? 0;

    // 6. Apply formatting: bold header, freeze row 1, wrap text, widen columns
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                // Bold header row
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                        cell: { userEnteredFormat: { textFormat: { bold: true } } },
                        fields: 'userEnteredFormat.textFormat.bold',
                    },
                },
                // Freeze first row
                {
                    updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: 'gridProperties.frozenRowCount',
                    },
                },
                // Wrap text on all cells
                {
                    repeatCell: {
                        range: { sheetId },
                        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
                        fields: 'userEnteredFormat.wrapStrategy',
                    },
                },
                // Set column A width (key) to 220px
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                        properties: { pixelSize: 220 },
                        fields: 'pixelSize',
                    },
                },
                // Set columns B-E (messages) to 400px each
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 5 },
                        properties: { pixelSize: 400 },
                        fields: 'pixelSize',
                    },
                },
            ],
        },
    });

    console.log(`✅ Migrated ${rows.length - 1} message keys to new format`);
    console.log('Keys:', Object.keys(grouped).join(', '));
}

run().catch(e => {
    console.error('❌ Failed:', e?.message);
    process.exit(1);
});
