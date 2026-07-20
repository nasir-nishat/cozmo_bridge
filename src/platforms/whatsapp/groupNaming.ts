const toNum = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const dayOrdinal = (day: number): string => {
    if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
    if (day % 10 === 1) return `${day}st`;
    if (day % 10 === 2) return `${day}nd`;
    if (day % 10 === 3) return `${day}rd`;
    return `${day}th`;
};

export const formatGroupCheckIn = (raw: string): string => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const day = dayOrdinal(Number(d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Seoul' })));
    const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Seoul' });
    return `${day}${month}`;
};

// Exact Hostfully property name → short display code (used for group name + image lookup)
// Strip " (USD)" / " (MASTER)" suffixes before matching
export const PROPERTY_CODE_MAP: Record<string, string> = {
    'BS_JOYHASLA': 'BS',
    'SG_JOYHASLA': 'SG',
    'SJ_JOYHASLA': 'SJ',
    'SA_ACHAE': 'SA',
    'JT_TEVA': 'JT',
    'JTS_TEVA': 'JTS',
    'HT_TEVA RETREAT': 'HT',
    'HTA_TEVA WELLNESS': 'HTA',
    'HTB_TEVA AERIS GARDEN': 'HTB',
    'YT_LOTUS_09': 'L9',
    'YT_FISH_09': 'F9',
    'YT_BIRD_09': 'B9',
    'YT_FISH_BIRD': 'FB',
    'YT_LOTUS_FISH_BIRD': 'YT',
    'GK_KELLY LUXURY': 'GK',
    'GKA_KELLY ANANDA': 'GKA',
    'GKB_KELLY PRANA': 'GKB',
};

function normalisePropertyName(raw: string): string {
    return raw.replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim().toUpperCase();
}

export function propertyCodeFromName(name: string): string {
    const normalised = normalisePropertyName(name);
    return PROPERTY_CODE_MAP[normalised] ?? normalised.split(/[\s_]+/)[0] ?? normalised;
}

const extractPropertyCode = (lead: any, property: any): string => {
    const name = (property?.name || lead?.propertyName || '').toString().trim();
    if (name) return propertyCodeFromName(name);

    const direct = [lead?.propertyCode, property?.code]
        .map((v) => (v || '').toString().trim())
        .find(Boolean);
    return (direct || '').toUpperCase();
};

export const extractOccupancyCode = (lead: any): string => {
    const gi = lead?.guestInformation || {};
    const adults = toNum(
        lead?.adultCount || lead?.adult || lead?.numberOfAdults || lead?.adults || lead?.numAdults ||
        gi?.adultCount || gi?.adult || gi?.numberOfAdults || gi?.adults
    );
    const kids = toNum(
        lead?.childrenCount || lead?.child || lead?.numberOfChildren || lead?.children || lead?.childCount || lead?.numChildren ||
        gi?.childrenCount || gi?.child || gi?.numberOfChildren || gi?.children || gi?.childCount || gi?.kids
    );
    const infants = toNum(
        lead?.infantCount || lead?.infant || lead?.numberOfInfants || lead?.infants || lead?.babies ||
        gi?.infantCount || gi?.infant || gi?.numberOfInfants || gi?.infants || gi?.babies
    );
    const pets = toNum(
        lead?.petCount || lead?.pet || lead?.numberOfPets || lead?.pets ||
        gi?.petCount || gi?.pet || gi?.numberOfPets || gi?.pets
    );

    const parts: string[] = [];
    if (adults > 0) parts.push(`${adults}A`);
    if (kids > 0) parts.push(`${kids}K`);
    if (infants > 0) parts.push(`${infants}I`);
    if (pets > 0) parts.push(`${pets}P`);

    if (!parts.length) {
        const total = toNum(lead?.numberOfGuests || lead?.guestCount || gi?.numberOfGuests || gi?.guestCount);
        if (total > 0) parts.push(`${total}A`);
    }
    return parts.join('');
};

export function buildBookingGroupName(lead: any, property: any, guest_name: string): string {
    const code = extractPropertyCode(lead, property);
    const checkInToken = formatGroupCheckIn(lead?.checkInLocalDateTime);
    const occupancy = extractOccupancyCode(lead);
    const tokens = ['COZE', code, checkInToken, guest_name, occupancy].filter(Boolean);
    return tokens.join(' ');
}
