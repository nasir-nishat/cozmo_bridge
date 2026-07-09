"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BookingsPage;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const sonner_1 = require("sonner");
const button_1 = require("@/components/ui/button");
const badge_1 = require("@/components/ui/badge");
const table_1 = require("@/components/ui/table");
const card_1 = require("@/components/ui/card");
const BRIDGE = '/api/bridge';
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const SOURCE_LABELS = {
    AIRBNB: 'Airbnb', BOOKING_COM: 'Booking', DIRECT: 'Direct',
    HOMEAWAY: 'VRBO', VRBO: 'VRBO', EXPEDIA: 'Expedia', TRIPADVISOR: 'TripAdvisor',
};
function StatusBadge({ status }) {
    if (status === 'CHECKED_IN')
        return <badge_1.Badge variant="success">Checked In</badge_1.Badge>;
    if (status === 'BOOKED' || status === 'PAID_IN_FULL')
        return <badge_1.Badge variant="info">Booked</badge_1.Badge>;
    return <badge_1.Badge variant="outline">{status}</badge_1.Badge>;
}
function OccupancyTag({ b }) {
    const parts = [];
    if (b.adults)
        parts.push(`${b.adults}A`);
    if (b.children)
        parts.push(`${b.children}K`);
    if (b.infants)
        parts.push(`${b.infants}B`);
    return <span className="text-xs text-muted-foreground">{parts.join(' ') || '—'}</span>;
}
function BookingsPage() {
    const [bookings, setBookings] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [sort, setSort] = (0, react_1.useState)('checkIn');
    const [filter, setFilter] = (0, react_1.useState)('active');
    const load = async () => {
        try {
            const res = await fetch(`${BRIDGE}/admin/bookings`);
            const data = await res.json();
            if (!data.ok)
                throw new Error(data.error);
            setBookings(data.bookings);
        }
        catch (e) {
            sonner_1.toast.error(`Failed to load bookings: ${e.message}`);
        }
        finally {
            setLoading(false);
        }
    };
    (0, react_1.useEffect)(() => { load(); }, []);
    const filtered = bookings
        .filter(b => {
        if (filter === 'active')
            return b.status === 'CHECKED_IN';
        if (filter === 'upcoming')
            return (b.status === 'BOOKED' || b.status === 'PAID_IN_FULL') && b.checkIn >= TODAY;
        return true;
    })
        .sort((a, b) => {
        if (sort === 'checkIn')
            return a.checkIn.localeCompare(b.checkIn);
        if (sort === 'property')
            return a.property.localeCompare(b.property);
        return a.status.localeCompare(b.status);
    });
    const checkedIn = bookings.filter(b => b.status === 'CHECKED_IN').length;
    const upcoming = bookings.filter(b => (b.status === 'BOOKED' || b.status === 'PAID_IN_FULL') && b.checkIn >= TODAY).length;
    return (<>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Bookings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {checkedIn} checked in · {upcoming} upcoming
          </p>
        </div>
        <button_1.Button variant="secondary" size="sm" onClick={load}>
          <lucide_react_1.RefreshCw className="w-3.5 h-3.5"/>
          Refresh
        </button_1.Button>
      </div>

      {/* Filter + sort bar */}
      <div className="flex items-center gap-2 mb-4">
        {['active', 'upcoming', 'all'].map(f => (<button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
            {f === 'active' ? `Checked In (${checkedIn})` : f === 'upcoming' ? `Upcoming (${upcoming})` : `All (${bookings.length})`}
          </button>))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {['checkIn', 'property', 'status'].map(s => (<button key={s} onClick={() => setSort(s)} className={`px-2.5 py-1 rounded-md text-xs transition-colors ${sort === s ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'checkIn' ? 'Check-in' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>))}
        </div>
      </div>

      {loading ? (<p className="text-center text-sm text-muted-foreground py-16">Loading bookings…</p>) : filtered.length === 0 ? (<card_1.Card><card_1.CardContent className="py-12 text-center text-sm text-muted-foreground">No bookings found.</card_1.CardContent></card_1.Card>) : (<table_1.Table>
          <table_1.TableHeader>
            <table_1.TableRow>
              <table_1.TableHead>Guest</table_1.TableHead>
              <table_1.TableHead>Property</table_1.TableHead>
              <table_1.TableHead>Check-in</table_1.TableHead>
              <table_1.TableHead>Check-out</table_1.TableHead>
              <table_1.TableHead>Guests</table_1.TableHead>
              <table_1.TableHead>Source</table_1.TableHead>
              <table_1.TableHead>Status</table_1.TableHead>
            </table_1.TableRow>
          </table_1.TableHeader>
          <table_1.TableBody>
            {filtered.map(b => (<table_1.TableRow key={b.leadUid}>
                <table_1.TableCell className="font-medium text-foreground">
                  {b.guestName}
                  {b.nationality && <span className="ml-1.5 text-xs text-muted-foreground">{b.nationality}</span>}
                </table_1.TableCell>
                <table_1.TableCell className="text-muted-foreground text-xs">{b.property.replace(/^[A-Z0-9_]+_/, '')}</table_1.TableCell>
                <table_1.TableCell className="tabular-nums text-sm font-medium">{b.checkIn}</table_1.TableCell>
                <table_1.TableCell className="tabular-nums text-sm text-muted-foreground">{b.checkOut}</table_1.TableCell>
                <table_1.TableCell><OccupancyTag b={b}/></table_1.TableCell>
                <table_1.TableCell><badge_1.Badge variant="secondary">{SOURCE_LABELS[b.source] ?? b.source}</badge_1.Badge></table_1.TableCell>
                <table_1.TableCell><StatusBadge status={b.status}/></table_1.TableCell>
              </table_1.TableRow>))}
          </table_1.TableBody>
        </table_1.Table>)}
    </>);
}
