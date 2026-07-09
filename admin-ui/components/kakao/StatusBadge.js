"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBadge = StatusBadge;
const badge_1 = require("@/components/ui/badge");
function StatusBadge({ status }) {
    if (status === 'CHECKED_IN')
        return <badge_1.Badge variant="success">Checked In</badge_1.Badge>;
    if (status === 'BOOKED' || status === 'PAID_IN_FULL')
        return <badge_1.Badge variant="info">Booked</badge_1.Badge>;
    if (!status)
        return <badge_1.Badge variant="outline">No Booking</badge_1.Badge>;
    return <badge_1.Badge variant="secondary">{status}</badge_1.Badge>;
}
