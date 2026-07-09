"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsBar = StatsBar;
const card_1 = require("@/components/ui/card");
const utils_1 = require("@/lib/utils");
function StatsBar({ groups }) {
    const active = groups.filter(g => g.booking?.status === 'CHECKED_IN' || g.booking?.status === 'BOOKED' || g.booking?.status === 'PAID_IN_FULL');
    const totalUnsettled = groups.reduce((s, g) => s + g.sheetExpenses.filter(e => !e.settled).reduce((a, e) => a + e.amount, 0), 0);
    const withWarning = groups.filter(g => g.bufferedExpCount > g.sheetExpenses.filter(e => !e.settled).length && g.bufferedExpCount > 0);
    const stats = [
        { label: 'Active Groups', value: active.length, sub: `of ${groups.length} linked`, warn: false },
        { label: 'Unsettled Total', value: `₩${(0, utils_1.fmt)(totalUnsettled)}`, sub: 'across all groups', warn: false },
        { label: 'Buffer Warnings', value: withWarning.length, sub: 'possible missed /exp', warn: withWarning.length > 0 },
    ];
    return (<div className="grid grid-cols-3 gap-3 mb-6">
      {stats.map(s => (<card_1.Card key={s.label}>
          <card_1.CardHeader className="pb-1">
            <card_1.CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </card_1.CardTitle>
          </card_1.CardHeader>
          <card_1.CardContent className="pt-0">
            <div className={`text-xl font-bold tabular-nums ${s.warn ? 'text-[#e65100]' : 'text-foreground'}`}>
              {s.value}
            </div>
            <card_1.CardDescription className="mt-0.5">{s.sub}</card_1.CardDescription>
          </card_1.CardContent>
        </card_1.Card>))}
    </div>);
}
