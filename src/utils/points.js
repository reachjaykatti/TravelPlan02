
// Compute points distribution
// winnersPred: array of user_id who predicted the winner
// losersPred: array of user_id who predicted the loser
// missedCount: number of members who missed prediction (counted as losers)
// entryPoints: points per loser to add to pot
export function computeDistribution(winnersPred, losersPred, missedCount, entryPoints) {
  const losersTotal = losersPred.length + missedCount;
  const winnersCount = winnersPred.length;
  if (winnersCount === 0) {
    return { perWinner: 0, totalPot: losersTotal * entryPoints };
  }
  const totalPot = losersTotal * entryPoints;
  const perWinner = winnersCount > 0 ? totalPot / winnersCount : 0;
  return { perWinner, totalPot };
}
