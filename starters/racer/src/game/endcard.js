// WHAT THE END CARD SAYS. A run never ends with just "Game over": the card says what happened
// and gives ONE tip picked from how this run actually went (few boosts? many rail hits?).
// Change the words here; change who wins with "Win if you finish in the top" (tuning: race).

import { ordinal, formatTime } from './race.js';

/** Returns { won, heading, reason, stats } for ctx.end(). */
export function endCard({ position, dnf, total, winner, run, progress, bestLap, winPosition }) {
  const trial = total === 1; // no rivals: a time trial
  const won = !dnf && (trial || position <= winPosition);
  const gap = winner?.progress?.finished ? Math.abs(run.time - winner.progress.finishTime) : 0;

  let tip = 'Brake in a straight line before the tight corners, then get back on the power early.';
  if (run.boosts < 3) tip = 'Hold Space as you turn into a corner to drift, and let go on the way out: the longer the slide, the bigger the boost.';
  else if (run.wallHits > 5) tip = `You met the rails ${run.wallHits} times. Lift off for a moment before the corner and they stay out of your way.`;
  else if (run.resets > 1) tip = 'A reset costs about two seconds. If you are sliding wide, steer the other way to catch it.';

  let reason;
  if (dnf) reason = `${winner?.name ?? 'The winner'} took the flag and time ran out before you reached the line. ${tip}`;
  else if (trial) reason = `Best lap ${formatTime(bestLap)}. Turn on "Show best-lap ghost" and race yourself.`;
  else if (position === 1) reason = `You crossed the line first${gap > 0.05 ? `, ${gap.toFixed(1)} s ahead of ${winner.name}` : ''}, with ${run.boosts} drift ${run.boosts === 1 ? 'boost' : 'boosts'}.${Number.isFinite(progress.best) ? ` Best lap ${formatTime(progress.best)}.` : ''} For a harder race, raise the rivals' Pace.`;
  else if (won) reason = `${ordinal(position)} place: on the podium. ${tip}`;
  else reason = `You finished ${ordinal(position)}${gap > 0.05 ? `, ${gap.toFixed(1)} s behind ${winner.name}` : ''}. ${tip}`;

  return {
    won,
    heading: dnf ? 'Out of time' : trial ? 'Time trial done' : position === 1 ? 'You won the race' : `${ordinal(position)} place`,
    reason,
    stats: [
      ['Position', dnf ? 'Did not finish' : `${ordinal(position)} of ${total}`],
      ['Race time', formatTime(run.time)],
      ['Best lap', formatTime(progress.best)],
      ['Drift boosts', `${run.boosts}`],
    ],
  };
}
