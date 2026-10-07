import type { Flooring } from '../model/types';
export function packageQuantity(boardCount: number, f: Flooring) {
  if (!f.boardsPerPack) return null;
  const withReserve = Math.max(0, Math.ceil(boardCount * (1 + (f.reservePercent ?? 5) / 100) - 1e-9));
  const packages = Math.ceil(withReserve / f.boardsPerPack);
  return { packages, neededBoards: boardCount, reserveBoards: withReserve - boardCount,
    purchasedBoards: packages * f.boardsPerPack, area: packages * f.boardsPerPack * f.length * f.width / 1e6 };
}
