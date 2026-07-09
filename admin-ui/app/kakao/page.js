"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = KakaoPage;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const sonner_1 = require("sonner");
const button_1 = require("@/components/ui/button");
const GroupCard_1 = require("@/components/kakao/GroupCard");
const StatsBar_1 = require("@/components/kakao/StatsBar");
const BRIDGE = '/api/bridge';
function KakaoPage() {
    const [groups, setGroups] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [dryRun, setDryRun] = (0, react_1.useState)(false);
    const [scanningAll, setScanningAll] = (0, react_1.useState)(false);
    const [scanningGroup, setScanningGroup] = (0, react_1.useState)(null);
    const [scanResults, setScanResults] = (0, react_1.useState)({});
    const loadGroups = (0, react_1.useCallback)(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${BRIDGE}/admin/kakao/groups`);
            const data = await res.json();
            if (!data.ok)
                throw new Error(data.error);
            const order = { CHECKED_IN: 0, BOOKED: 1, PAID_IN_FULL: 1 };
            data.groups.sort((a, b) => (order[a.booking?.status ?? ''] ?? 9) - (order[b.booking?.status ?? ''] ?? 9));
            setGroups(data.groups);
        }
        catch (e) {
            sonner_1.toast.error(`Failed to load: ${e.message}`);
        }
        finally {
            setLoading(false);
        }
    }, []);
    (0, react_1.useEffect)(() => { loadGroups(); }, [loadGroups]);
    const scanGroup = async (groupKey) => {
        setScanningGroup(groupKey);
        try {
            const res = await fetch(`${BRIDGE}/admin/kakao/scan-expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupKey, dryRun }),
            });
            const data = await res.json();
            if (!data.ok)
                throw new Error(data.error);
            const map = {};
            for (const r of data.results)
                map[r.groupKey] = r;
            setScanResults(prev => ({ ...prev, ...map }));
            await loadGroups();
            const r = data.results.find((r) => r.groupKey === groupKey);
            if (r?.newCount)
                sonner_1.toast.success(`Recovered ${r.newCount} expense(s)${dryRun ? ' · dry run' : ''}`);
            else
                sonner_1.toast.info('No missed /exp commands found');
        }
        catch (e) {
            sonner_1.toast.error(`Scan error: ${e.message}`);
        }
        finally {
            setScanningGroup(null);
        }
    };
    const scanAll = async () => {
        setScanningAll(true);
        try {
            const res = await fetch(`${BRIDGE}/admin/kakao/scan-expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun }),
            });
            const data = await res.json();
            if (!data.ok)
                throw new Error(data.error);
            const map = {};
            for (const r of data.results)
                map[r.groupKey] = r;
            setScanResults(map);
            await loadGroups();
            if (data.totalNew > 0)
                sonner_1.toast.success(`Recovered ${data.totalNew} expense(s) · ${data.totalSkipped} already in Sheets${dryRun ? ' · dry run' : ''}`);
            else
                sonner_1.toast.info(`All caught up — ${data.totalSkipped} already in Sheets`);
        }
        catch (e) {
            sonner_1.toast.error(`Scan error: ${e.message}`);
        }
        finally {
            setScanningAll(false);
        }
    };
    return (<>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">KakaoTalk Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan message buffer for missed /exp commands and sync to Google Sheets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="rounded"/>
            Dry run
          </label>
          <button_1.Button variant="secondary" size="sm" onClick={loadGroups}>
            <lucide_react_1.RotateCcw className="w-3.5 h-3.5"/>
            Refresh
          </button_1.Button>
          <button_1.Button size="sm" disabled={scanningAll} onClick={scanAll}>
            <lucide_react_1.Zap className="w-3.5 h-3.5"/>
            {scanningAll ? 'Scanning…' : 'Scan All'}
          </button_1.Button>
        </div>
      </div>

      {loading ? (<p className="text-center text-sm text-muted-foreground py-16">Loading groups…</p>) : groups.length === 0 ? (<p className="text-center text-sm text-muted-foreground py-16">No linked KakaoTalk groups found.</p>) : (<>
          <StatsBar_1.StatsBar groups={groups}/>
          <div className="space-y-2">
            {groups.map(g => (<GroupCard_1.GroupCard key={g.groupKey} group={g} scanResult={scanResults[g.groupKey]} onScan={scanGroup} scanning={scanningGroup === g.groupKey}/>))}
          </div>
        </>)}
    </>);
}
