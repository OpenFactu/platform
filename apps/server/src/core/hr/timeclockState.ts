import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { timeclockEntries } from '../../db/schema';
import type { PunchKind, WorkState } from './timeclockTypes';

const actions: Record<WorkState, PunchKind[]> = {
  closed: ['in'],
  working: ['out', 'break_start'],
  on_break: ['break_end'],
};
export const allowedActions = (state: WorkState): PunchKind[] => [...actions[state]];
export function reduceWorkState(kinds: string[]): WorkState {
  let state: WorkState = 'closed';
  for (const kind of kinds) {
    if (!actions[state].includes(kind as PunchKind)) continue;
    state = kind === 'out' ? 'closed' : kind === 'break_start' ? 'on_break' : 'working';
  }
  return state;
}
export async function getWorkState(
  client: any,
  employeeId: string,
  now = new Date(),
): Promise<WorkState> {
  const rows = await client
    .select({ kind: timeclockEntries.kind })
    .from(timeclockEntries)
    .where(
      and(
        eq(timeclockEntries.employeeId, employeeId),
        gte(timeclockEntries.at, new Date(now.getTime() - 86400000)),
        lte(timeclockEntries.at, now),
      ),
    )
    .orderBy(asc(timeclockEntries.at), asc(timeclockEntries.id));
  return reduceWorkState(rows.map((r: any) => r.kind));
}
