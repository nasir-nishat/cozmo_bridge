"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HealthPage;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const card_1 = require("@/components/ui/card");
const button_1 = require("@/components/ui/button");
const badge_1 = require("@/components/ui/badge");
const utils_1 = require("@/lib/utils");
const BRIDGE = '/api/bridge';
const PLATFORM_META = {
    whatsapp: { label: 'WhatsApp', icon: '📱', note: 'Evolution API' },
    line: { label: 'LINE', icon: '💚', note: 'Webhook' },
    kakao: { label: 'KakaoTalk', icon: '💬', note: 'MessengerBot R · LDPlayer' },
    wechat: { label: 'WeChat', icon: '🟢', note: 'WechatferryAgent' },
};
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
function KakaoAge({ ageMs }) {
    if (ageMs === null)
        return <span className="text-xs text-muted-foreground">No heartbeat yet</span>;
    const sec = Math.floor(ageMs / 1000);
    const color = ageMs < 60000 ? 'text-[#34c759]' : ageMs < 5 * 60000 ? 'text-[#ff9500]' : 'text-destructive';
    return <span className={(0, utils_1.cn)('text-xs tabular-nums', color)}>Last heartbeat {sec}s ago</span>;
}
function HealthPage() {
    const [data, setData] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [lastUpdated, setLastUpdated] = (0, react_1.useState)(null);
    const load = async () => {
        try {
            const res = await fetch(`${BRIDGE}/admin/health`);
            const json = await res.json();
            setData(json);
            setLastUpdated(new Date());
        }
        catch {
            // bridge may be offline
        }
        finally {
            setLoading(false);
        }
    };
    (0, react_1.useEffect)(() => {
        load();
        const iv = setInterval(load, 10000);
        return () => clearInterval(iv);
    }, []);
    if (loading)
        return <p className="text-center text-sm text-muted-foreground py-16">Checking bridge…</p>;
    return (<>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Platform Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live status of all messaging platforms · refreshes every 10s
          </p>
        </div>
        <button_1.Button variant="secondary" size="sm" onClick={load}>
          <lucide_react_1.RefreshCw className="w-3.5 h-3.5"/>
          Refresh
        </button_1.Button>
      </div>

      {!data ? (<card_1.Card className="p-8 text-center">
          <p className="text-destructive font-medium">Bridge offline — cannot reach :3001</p>
          <p className="text-xs text-muted-foreground mt-1">Run: pm2 restart cozmo-bridge</p>
        </card_1.Card>) : (<>
          {/* Bridge stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
                { label: 'Uptime', value: formatUptime(data.bridge.uptimeSeconds) },
                { label: 'Mode', value: data.bridge.mode.toUpperCase() },
                { label: 'PID', value: String(data.bridge.pid) },
            ].map(s => (<card_1.Card key={s.label}>
                <card_1.CardHeader className="pb-1">
                  <card_1.CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</card_1.CardTitle>
                </card_1.CardHeader>
                <card_1.CardContent className="pt-0">
                  <div className="text-xl font-bold tabular-nums text-foreground">{s.value}</div>
                </card_1.CardContent>
              </card_1.Card>))}
          </div>

          {/* Platform cards */}
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(data.platforms).map(([key, p]) => {
                const meta = PLATFORM_META[key];
                const statusVariant = !p.enabled ? 'outline' : p.connected ? 'success' : 'destructive';
                const statusLabel = !p.enabled ? 'Disabled' : p.connected ? 'Connected' : 'Disconnected';
                return (<card_1.Card key={key} className={(0, utils_1.cn)(!p.enabled && 'opacity-50')}>
                  <card_1.CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{meta.icon}</span>
                        <card_1.CardTitle>{meta.label}</card_1.CardTitle>
                      </div>
                      <badge_1.Badge variant={statusVariant}>{statusLabel}</badge_1.Badge>
                    </div>
                    <card_1.CardDescription>{meta.note}</card_1.CardDescription>
                  </card_1.CardHeader>
                  {key === 'kakao' && p.enabled && (<card_1.CardContent className="pt-0">
                      <KakaoAge ageMs={p.ageMs}/>
                    </card_1.CardContent>)}
                </card_1.Card>);
            })}
          </div>

          {lastUpdated && (<p className="text-xs text-muted-foreground mt-4 text-right">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>)}
        </>)}
    </>);
}
