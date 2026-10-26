/** Minutes of play as "12h 5m" — the format the library already shows. */
export function formatPlayTime(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes || 0))
  return `${Math.floor(safe / 60)}h ${safe % 60}m`
}
