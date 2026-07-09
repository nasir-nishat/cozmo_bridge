export function guestName(info: any, fallback = 'Guest'): string {
    return `${info?.firstName || ''} ${info?.lastName || ''}`.trim() || fallback;
}

export function formatSeoulDate(raw: string | null | undefined): string {
    if (!raw) return 'TBD';
    return new Date(raw).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Seoul',
    });
}
