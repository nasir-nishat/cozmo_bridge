"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AlertsPage;
const react_1 = require("react");
const card_1 = require("@/components/ui/card");
const badge_1 = require("@/components/ui/badge");
const BRIDGE = '/api/bridge';
const PLATFORM_COLORS = {
    WHATSAPP: 'bg-[#dcf8c6]',
    LINE: 'bg-[#d4f1d4]',
    KAKAO: 'bg-[#fffde7]',
    WECHAT: 'bg-[#e8f5e9]',
    HOSTFULLY: 'bg-[#e3f2fd]',
    GENERAL: 'bg-secondary',
};
function AlertCard({ alert }) {
    const lines = alert.plainText.split('\n').filter(l => l.trim() && l !== '─────────────────');
    const title = lines[0] ?? '';
    const body = lines.slice(1).filter(l => !l.startsWith('via COZMO'));
    const platform = alert.platform ?? 'GENERAL';
    const bg = PLATFORM_COLORS[platform] ?? 'bg-secondary';
    const time = new Date(alert.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = new Date(alert.ts).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    return (<card_1.Card className={`overflow-hidden transition-all ${bg} border-transparent`}>
      <card_1.CardContent className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm text-foreground">{title}</span>
              {alert.platform && (<badge_1.Badge variant="secondary" className="text-[10px] py-0">{platform}</badge_1.Badge>)}
            </div>
            {body.map((line, i) => (<p key={i} className="text-xs text-muted-foreground leading-relaxed">{line}</p>))}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs tabular-nums text-muted-foreground">{time}</div>
            <div className="text-[10px] text-muted-foreground/60">{date}</div>
          </div>
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
function AlertsPage() {
    const [alerts, setAlerts] = (0, react_1.useState)([]);
    const [connected, setConnected] = (0, react_1.useState)(false);
    const [liveCount, setLiveCount] = (0, react_1.useState)(0);
    const seenIds = (0, react_1.useRef)(new Set());
    const esRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const es = new EventSource(`${BRIDGE}/admin/alerts/stream`);
        esRef.current = es;
        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);
        es.onmessage = (e) => {
            try {
                const alert = JSON.parse(e.data);
                if (seenIds.current.has(alert.id))
                    return;
                seenIds.current.add(alert.id);
                setAlerts(prev => [alert, ...prev].slice(0, 100));
                setLiveCount(c => c + 1);
            }
            catch { /* ignore parse errors */ }
        };
        return () => { es.close(); esRef.current = null; };
    }, []);
    return (<>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Alerts Feed</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live stream of all COZMO alerts · last 100
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${connected ? 'bg-[#e8f5e9] border-[#a5d6a7] text-[#1b5e20]' : 'bg-secondary border-border text-muted-foreground'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#34c759]' : 'bg-[#aeaeb2]'}`}/>
            {connected ? 'Live' : 'Disconnected'}
          </div>
          {liveCount > 0 && (<badge_1.Badge variant="warning">{liveCount} new</badge_1.Badge>)}
        </div>
      </div>

      {alerts.length === 0 ? (<card_1.Card>
          <card_1.CardContent className="py-16 text-center text-sm text-muted-foreground">
            {connected ? 'Waiting for alerts…' : 'Connecting to bridge…'}
          </card_1.CardContent>
        </card_1.Card>) : (<div className="space-y-2">
          {alerts.map(a => <AlertCard key={a.id} alert={a}/>)}
        </div>)}
    </>);
}
