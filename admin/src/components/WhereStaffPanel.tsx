// Scheduling > Who's where (2026-10-11): for the chosen store, each day of a week, each person scheduled there or checked in there: where
// the schedule had them, where they checked in (the staff app checks them in when they open it during a shift), and the status. "At #7
// instead" is the one to act on. The schedule shown is the weekly one in use now. Data: GET /staff/attendance.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { staffAttendanceApi } from '../services/api';
import { C, FONT } from '../lib/theme';
import { Badge, Button, Card, Notice, type Tone } from './kit';
import CardSkeleton from './CardSkeleton';
import ErrorState from './ErrorState';
import { storeToday, addDays, storeDayLong, startOfStoreDay, storeTime } from '../lib/storeDates';

type Status = 'ON_SITE' | 'ELSEWHERE' | 'NO_CHECK_IN' | 'UNSCHEDULED' | 'OFF' | 'UPCOMING';
interface Entry {
  userId: string; name: string | null; role: string; status: Status;
  scheduled: { storeId: string; storeName: string; startTime: string; endTime: string } | null;
  checkIns: { storeId: string; storeName: string; at: string; method: string }[];
}
const TONE: Record<Status, Tone> = { ON_SITE: 'success', ELSEWHERE: 'danger', NO_CHECK_IN: 'warning', UNSCHEDULED: 'info', OFF: 'neutral', UPCOMING: 'neutral' };

const weekday = (day: string) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${day}T12:00:00Z`).getUTCDay()];

/** Monday of the week the store day falls in */
function mondayOf(day: string): string {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

export default function WhereStaffPanel({ storeId }: { storeId: string }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(storeToday()));
  const to = addDays(weekStart, 6);
  const q = useQuery({
    queryKey: ['staff-attendance', storeId, weekStart],
    queryFn: () => staffAttendanceApi.attendance({ from: weekStart, to, storeId }),
    refetchInterval: 60_000,
  });
  const data = q.data?.data?.data as { today: string; days: { day: string; entries: Entry[] }[] } | undefined;

  const word = (e: Entry) => {
    const last = e.checkIns[e.checkIns.length - 1];
    return e.status === 'ON_SITE' ? 'On site' : e.status === 'ELSEWHERE' ? `At ${last?.storeName ?? 'another store'} instead`
      : e.status === 'NO_CHECK_IN' ? 'Not checked in' : e.status === 'UNSCHEDULED' ? 'Not scheduled, checked in' : e.status === 'OFF' ? 'Time off' : 'Scheduled';
  };
  const todays = data?.days.find((d) => d.day === data.today)?.entries ?? [];
  const away = todays.filter((e) => e.status === 'ELSEWHERE').length;
  const missing = todays.filter((e) => e.status === 'NO_CHECK_IN').length;

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Button size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>Previous week</Button>
        <Button size="sm" onClick={() => setWeekStart(mondayOf(storeToday()))} disabled={weekStart === mondayOf(storeToday())}>This week</Button>
        <Button size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= mondayOf(storeToday())}>Next week</Button>
        <span style={{ fontSize: FONT.small, color: C.muted }}>{storeDayLong(startOfStoreDay(weekStart))} to {storeDayLong(startOfStoreDay(to))}</span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: FONT.small, color: C.muted, lineHeight: 1.5 }}>
        Where each person was scheduled and where they checked in. The staff app checks people in when they open it during a shift, from which
        of their stores the phone is at (no location is kept, only the store). The schedule shown is the weekly one in use now.
      </p>
      {q.isLoading ? <CardSkeleton count={3} /> : q.isError || !data ? <ErrorState message="Could not load who is where." onRetry={() => q.refetch()} /> : (
        <>
          {(away > 0 || missing > 0) && (
            <Notice tone="danger" style={{ marginBottom: 14 }}>
              Today: {[away ? `${away} ${away === 1 ? 'person is' : 'people are'} at another store` : null, missing ? `${missing} not checked in yet` : null].filter(Boolean).join(', ')}.
            </Notice>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.days.map(({ day, entries }) => (
              <Card key={day} padding={0} style={day === data.today ? { borderColor: C.primary } : undefined}>
                <div style={{ padding: '10px 14px', borderBottom: entries.length ? `1px solid ${C.border}` : 'none', fontWeight: 700, color: C.text, fontSize: FONT.body, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span>{weekday(day)}, {storeDayLong(startOfStoreDay(day))}{day === data.today ? ' · Today' : ''}</span>
                  {entries.length === 0 && <span style={{ fontWeight: 400, color: C.muted, fontSize: FONT.small }}>Nobody scheduled or checked in.</span>}
                </div>
                {entries.length === 0 ? null
                  : entries.map((e, i) => {
                    return (
                      <div key={e.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${C.border}` : 'none', flexWrap: 'wrap', background: e.status === 'ELSEWHERE' ? C.dangerTint : undefined }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ fontWeight: 600, color: C.text }}>{e.name ?? ''}{e.role === 'STORE_MANAGER' ? <span style={{ color: C.muted, fontWeight: 400 }}> · Manager</span> : null}</div>
                          {e.scheduled && <div style={{ fontSize: FONT.small, color: C.text2 }}>Scheduled at {e.scheduled.storeName}, {e.scheduled.startTime} to {e.scheduled.endTime}</div>}
                          {e.checkIns.length > 0 && (
                            <div style={{ fontSize: FONT.small, color: C.text2 }}>
                              Checked in: {e.checkIns.map((c) => `${c.storeName} ${storeTime(c.at)}${c.method === 'CHOSEN' ? ' (chose the store)' : ''}`).join(', then ')}
                            </div>
                          )}
                        </div>
                        <Badge tone={TONE[e.status]}>{word(e)}</Badge>
                      </div>
                    );
                  })}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
