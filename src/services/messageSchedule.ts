import { getBookingsCheckingIn, getBookingsCheckingOut, BookingEntry } from './bookingStore';
import { getAllGroupsByLeadUid, getKakaoChatName, getStoredGroupName } from './groupLeads';
import { isSent, MessageType } from './sentMessages';
import { isKakaoQueued } from '../routes/kakao';
import { hasAnyExpenses } from './expenses';

type Platform = 'wa' | 'line' | 'wechat' | 'kakao';
type EventStatus = 'scheduled' | 'queued' | 'sent' | 'missed' | 'skipped';

export interface ScheduleEvent {
    time: string;
    type: MessageType;
    label: string;
    guestName: string;
    property: string;
    platform: Platform;
    groupKey: string;
    groupName: string | null;
    status: EventStatus;
    note?: string;
}

export interface DaySchedule {
    date: string;
    events: ScheduleEvent[];
}

const LABELS: Record<string, string> = {
    checkin_tips: 'Stay Tips',
    checkin_rules: 'House Rules (noise/precautions)',
    checkout_reminder: 'Checkout Pack (night before)',
    checkout_instructions_am: 'AM Checkout Instructions',
    final_bill: 'Final Bill',
    farewell: 'Farewell',
};

function kstDateStr(offsetDays = 0): string {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86_400_000);
    return kst.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function kstNowMinutes(): number {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function detectPlatform(groupKey: string): Platform | null {
    if (groupKey.endsWith('@g.us')) return 'wa';
    if (groupKey.startsWith('line:')) return 'line';
    if (groupKey.startsWith('wechat:')) return 'wechat';
    if (groupKey.startsWith('kakao:')) return 'kakao';
    return null;
}

function groupDisplayName(groupKey: string, platform: Platform): string | null {
    if (platform === 'kakao') return getKakaoChatName(groupKey.replace('kakao:', ''));
    return getStoredGroupName(groupKey);
}

function statusFor(dateStr: string, time: string, groupKey: string, type: MessageType, todayStr: string): EventStatus {
    const isFuture = dateStr > todayStr || (dateStr === todayStr && timeToMinutes(time) > kstNowMinutes());
    if (isFuture) return 'scheduled';
    if (isSent(groupKey, type)) return 'sent';
    if (detectPlatform(groupKey) === 'kakao' && isKakaoQueued(groupKey, type)) return 'queued';
    return 'missed';
}

async function pushEvents(
    events: ScheduleEvent[],
    leads: BookingEntry[],
    time: string,
    type: MessageType,
    dateStr: string,
    todayStr: string,
    opts?: { kakaoOnly?: boolean; skipIfNoExpenses?: boolean }
): Promise<void> {
    for (const lead of leads) {
        let groups = getAllGroupsByLeadUid(lead.leadUid);
        if (opts?.kakaoOnly) groups = groups.filter(g => detectPlatform(g) === 'kakao');
        if (groups.length === 0) continue;

        let skipNote: string | undefined;
        if (opts?.skipIfNoExpenses) {
            // Fail open on error — an unknown expense state should never be mislabeled "skipped".
            const hasExpenses = await hasAnyExpenses(lead.leadUid).catch(() => true);
            if (!hasExpenses) skipNote = 'no expenses logged';
        }

        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) continue;
            events.push({
                time, type, label: LABELS[type],
                guestName: lead.guestName,
                property: lead.property,
                platform,
                groupKey,
                groupName: groupDisplayName(groupKey, platform),
                status: skipNote ? 'skipped' : statusFor(dateStr, time, groupKey, type, todayStr),
                note: skipNote,
            });
        }
    }
}

async function buildDay(dateStr: string, todayStr: string): Promise<ScheduleEvent[]> {
    const events: ScheduleEvent[] = [];
    const checkins = getBookingsCheckingIn(dateStr);
    const checkouts = getBookingsCheckingOut(dateStr);
    const tomorrowCheckouts = getBookingsCheckingOut(addDays(dateStr, 1));

    await pushEvents(events, checkins, '15:00', 'checkin_tips', dateStr, todayStr);
    await pushEvents(events, checkins, '19:00', 'checkin_rules', dateStr, todayStr);
    await pushEvents(events, checkouts, '07:00', 'final_bill', dateStr, todayStr, { skipIfNoExpenses: true });
    await pushEvents(events, checkouts, '09:00', 'checkout_instructions_am', dateStr, todayStr, { kakaoOnly: true });
    await pushEvents(events, checkouts, '15:00', 'farewell', dateStr, todayStr);
    await pushEvents(events, tomorrowCheckouts, '21:00', 'checkout_reminder', dateStr, todayStr);

    events.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    return events;
}

export async function getMessageScheduleReport(): Promise<{
    yesterday: DaySchedule;
    today: DaySchedule;
    tomorrow: DaySchedule;
}> {
    const todayStr = kstDateStr(0);
    const yesterdayStr = addDays(todayStr, -1);
    const tomorrowStr = addDays(todayStr, 1);

    const [yesterdayEvents, todayEvents, tomorrowEvents] = await Promise.all([
        buildDay(yesterdayStr, todayStr),
        buildDay(todayStr, todayStr),
        buildDay(tomorrowStr, todayStr),
    ]);

    return {
        yesterday: { date: yesterdayStr, events: yesterdayEvents },
        today: { date: todayStr, events: todayEvents },
        tomorrow: { date: tomorrowStr, events: tomorrowEvents },
    };
}
