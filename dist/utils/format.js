"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guestName = guestName;
exports.formatSeoulDate = formatSeoulDate;
exports.formatSeoulDateTime = formatSeoulDateTime;
function guestName(info, fallback = 'Guest') {
    return `${info?.firstName || ''} ${info?.lastName || ''}`.trim() || fallback;
}
function formatSeoulDate(raw) {
    if (!raw)
        return 'TBD';
    return new Date(raw).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Seoul',
    });
}
// e.g. "Tue 15 Jul, 14:30 KST" — for telling the team when something is scheduled
function formatSeoulDateTime(d) {
    const date = typeof d === 'number' ? new Date(d) : d;
    const s = date.toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
    });
    return `${s} KST`;
}
