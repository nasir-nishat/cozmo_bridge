"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guestName = guestName;
exports.formatSeoulDate = formatSeoulDate;
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
