import { describe, expect, it } from 'vitest';
import { packageQuantity } from './packages';
import { PRESETS } from '../model/types';
describe('package quantities from real source boards', () => {
  it('rounds physical boards and reserve up to complete packs', () => {
    expect(packageQuantity(21, { ...PRESETS[0], reservePercent: 5 })).toMatchObject({ packages: 3, neededBoards: 21, reserveBoards: 2, purchasedBoards: 30 });
  });
  it('does not invent a pack size for the comparison material', () => { expect(packageQuantity(100, PRESETS[1])).toBeNull(); });
  it('does not add an extra pack at an exact boundary', () => { expect(packageQuantity(20, { ...PRESETS[0], reservePercent: 0 })?.packages).toBe(2); });
  it('returns no packages for rooms without laminate', () => { expect(packageQuantity(0, PRESETS[0])?.packages).toBe(0); });
});
