import type { Flooring } from '../model/types';

export interface Requirement { id: string; length: number; width: number; area: number; rectangular: boolean; role: 'start' | 'end' | 'other' }
export interface Offcut { id: string; length: number; width: number; edge: 'left' | 'right'; sourceBoardId: string; sourcePlacementId: string }
export interface Allocation { placementId: string; sourceBoardId: string; reusedFrom?: string; reusedFromPlacementId?: string; stockLength: number; cutLoss: number }
export interface MaterialState { offcuts: Offcut[]; newBoards: number }
export interface MaterialResult extends MaterialState { allocations: Allocation[] }
export const initialMaterial = (): MaterialState => ({ offcuts: [], newBoards: 0 });
/** Factory left end is needed for row ends, factory right end for starters.
 * Offcuts never get rotated/flipped; both long click edges stay intact.
 * Only full-width rectangular crosscuts are eligible for reuse. */
export function allocateMaterial(requirements: Requirement[], f: Flooring, previous: MaterialState = initialMaterial()): MaterialResult {
  const offcuts = previous.offcuts.map(s => ({ ...s })), allocations: Allocation[] = [];
  let newBoards = previous.newBoards;
  const kerf = f.sawKerf ?? 3;
  for (const item of requirements) {
    const eligible = item.rectangular && Math.abs(item.width - f.width) < .01 && item.role !== 'other' && item.length < f.length - .01;
    const edge = item.role === 'start' ? 'right' : 'left';
    const suitable = eligible ? offcuts.filter(s => s.edge === edge && Math.abs(s.width - item.width) < .01 &&
      (Math.abs(s.length - item.length) < .01 || s.length >= item.length + kerf - .01)).sort((a, b) => a.length - b.length) : [];
    const stock = suitable[0];
    let sourceBoardId: string, stockLength: number, reusedFrom: string | undefined;
    if (stock) {
      offcuts.splice(offcuts.findIndex(s => s.id === stock.id), 1);
      sourceBoardId = stock.sourceBoardId; stockLength = stock.length; reusedFrom = stock.id;
    } else { newBoards++; sourceBoardId = `D${newBoards}`; stockLength = f.length; }
    const cutLoss = eligible && stockLength - item.length > .01 ? Math.min(kerf, stockLength - item.length) : 0;
    allocations.push({ placementId: item.id, sourceBoardId, stockLength, reusedFrom, reusedFromPlacementId: stock?.sourcePlacementId, cutLoss });
    // A new board retains the opposite factory end on its remainder. A reused
    // one-ended stock loses its only factory end to the installed piece; its
    // second remainder has two sawn short ends and cannot be reused again.
    const leftover = stockLength - item.length - cutLoss;
    if (eligible && !stock && leftover >= f.minEndPieceLength - .01) offcuts.push({
      id: `R-${item.id}`, length: leftover, width: f.width, edge: edge === 'left' ? 'right' : 'left',
      sourceBoardId, sourcePlacementId: item.id,
    });
  }
  return { offcuts, allocations, newBoards };
}
