/** Best-effort US equities market-hours check (regular session, ET). */
export function marketStatus(now = new Date()): { open: boolean; label: string } {
  // Convert to America/New_York wall clock.
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0 Sun .. 6 Sat
  const minutes = et.getHours() * 60 + et.getMinutes();
  const open = 9 * 60 + 30;
  const close = 16 * 60;

  if (day === 0 || day === 6) return { open: false, label: 'Weekend' };
  if (minutes < open) return { open: false, label: 'Pre-market' };
  if (minutes >= close) return { open: false, label: 'After-hours' };
  return { open: true, label: 'Open' };
}
