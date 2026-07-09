"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupCard = GroupCard;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const card_1 = require("@/components/ui/card");
const badge_1 = require("@/components/ui/badge");
const button_1 = require("@/components/ui/button");
const separator_1 = require("@/components/ui/separator");
const table_1 = require("@/components/ui/table");
const utils_1 = require("@/lib/utils");
const StatusBadge_1 = require("./StatusBadge");
const ScanBanner_1 = require("./ScanBanner");
function GroupCard({ group, scanResult, onScan, scanning, }) {
    const [open, setOpen] = (0, react_1.useState)(false);
    const b = group.booking;
    const title = group.chatName || (b ? b.property : group.groupKey.replace('kakao:', ''));
    const unsettled = group.sheetExpenses.filter(e => !e.settled);
    const hasBufferWarning = group.bufferedExpCount > 0 && group.bufferedExpCount > unsettled.length;
    (0, react_1.useEffect)(() => { if (scanResult)
        setOpen(true); }, [scanResult]);
    return (<card_1.Card className="overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-secondary/50 transition-colors select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm truncate">{title}</span>
            <StatusBadge_1.StatusBadge status={b?.status}/>
            {hasBufferWarning && (<badge_1.Badge variant="warning">⚠ {group.bufferedExpCount} in buffer</badge_1.Badge>)}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {b?.guestName && <span>{b.guestName}</span>}
            {b && <span>{b.checkIn} → {b.checkOut}</span>}
            <span>{group.bufferedMsgCount} buffered</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {unsettled.length > 0 && (<span className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold tabular-nums">
              ₩{(0, utils_1.fmt)(group.total)}
            </span>)}
          <button_1.Button variant="secondary" size="sm" disabled={scanning} onClick={e => { e.stopPropagation(); onScan(group.groupKey); }}>
            {scanning ? '…' : 'Scan'}
          </button_1.Button>
          <lucide_react_1.ChevronDown className={(0, utils_1.cn)('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')}/>
        </div>
      </div>

      {/* Expanded body */}
      {open && (<div className="border-t border-border px-4 pb-4">
          {scanResult && <ScanBanner_1.ScanBanner result={scanResult}/>}

          {group.sheetExpenses.length > 0 ? (<>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mt-4 mb-2">
                Expenses — {unsettled.length} unsettled / {group.sheetExpenses.length} total
              </p>

              <table_1.Table>
                <table_1.TableHeader>
                  <table_1.TableRow>
                    <table_1.TableHead>Item</table_1.TableHead>
                    <table_1.TableHead>Card</table_1.TableHead>
                    <table_1.TableHead className="text-right">Amount</table_1.TableHead>
                    <table_1.TableHead>By</table_1.TableHead>
                    <table_1.TableHead>Date</table_1.TableHead>
                  </table_1.TableRow>
                </table_1.TableHeader>
                <table_1.TableBody>
                  {group.sheetExpenses.map(e => (<table_1.TableRow key={e.id} className={e.settled ? 'opacity-40' : ''}>
                      <table_1.TableCell className={(0, utils_1.cn)('text-foreground', e.settled && 'line-through')}>
                        {e.item}
                      </table_1.TableCell>
                      <table_1.TableCell>
                        <badge_1.Badge variant="secondary">{e.cardName || e.card}</badge_1.Badge>
                      </table_1.TableCell>
                      <table_1.TableCell className="text-right font-semibold tabular-nums text-foreground">
                        ₩{(0, utils_1.fmt)(e.amount)}
                      </table_1.TableCell>
                      <table_1.TableCell className="text-muted-foreground">{e.loggedBy}</table_1.TableCell>
                      <table_1.TableCell className="text-muted-foreground tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString('ko-KR', {
                        month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                    })}
                      </table_1.TableCell>
                    </table_1.TableRow>))}
                </table_1.TableBody>
              </table_1.Table>

              {/* Totals */}
              <div className="mt-3 rounded-lg bg-secondary border border-border px-4 py-3 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Subtotal (unsettled)</span>
                  <span className="text-base font-bold text-foreground tabular-nums">₩{(0, utils_1.fmt)(group.total)}</span>
                </div>
                <separator_1.Separator />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">+10% VAT — Bank / WISE</span>
                  <span className="text-sm font-medium text-foreground tabular-nums">₩{(0, utils_1.fmt)(group.totalVat10)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">+14.5% VAT — Card</span>
                  <span className="text-sm font-medium text-foreground tabular-nums">₩{(0, utils_1.fmt)(group.totalVat145)}</span>
                </div>
              </div>
            </>) : (<p className="mt-4 text-center text-sm text-muted-foreground py-6">
              No expenses logged for this group yet.
            </p>)}
        </div>)}
    </card_1.Card>);
}
