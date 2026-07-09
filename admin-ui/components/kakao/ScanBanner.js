"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanBanner = ScanBanner;
const utils_1 = require("@/lib/utils");
function ScanBanner({ result }) {
    if (result.newCount > 0)
        return (<div className={(0, utils_1.cn)('flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-3', 'bg-[#e8f5e9] border border-[#a5d6a7] text-[#1b5e20]')}>
        <span>✅</span>
        <span>Recovered <strong>{result.newCount}</strong> missing expense(s) — written to Sheets</span>
      </div>);
    if (result.skippedCount > 0)
        return (<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-xs text-muted-foreground mt-3">
        <span>✓</span>
        <span>{result.skippedCount} expense(s) in buffer — all already in Sheets</span>
      </div>);
    return (<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-xs text-muted-foreground mt-3">
      <span>—</span>
      <span>No /exp commands found in buffer for this group</span>
    </div>);
}
