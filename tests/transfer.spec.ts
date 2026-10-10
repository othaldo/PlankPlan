import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloads the current whole project and restores all floors, calibration and display preferences in another browser', async ({ page, browser }) => {
  await page.goto('/');
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
  const room = { id: 'r', name: 'Wohnzimmer', polygon: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }],
    layout: { direction: 0, offsetX: 40, offsetY: 50, mode: 'manual', pattern: 'custom', fixedStagger: 400, firstRowWidth: 'full' },
    rules: { expansionGap: 12, minRowWidth: 60, minEndPieceLength: 100, minJointOffset: 100, jointOffset: 400 } };
  const project = { version: 1, name: 'Transfer', shareOffcuts: false,
    flooring: { name: 'Laminat', length: 1285, width: 194, thickness: 8, expansionGap: 10, minRowWidth: 60, minEndPieceLength: 100, jointOffset: 400, minJointOffset: 100, boardsPerPack: 10, reservePercent: 5, sawKerf: 3 },
    floors: ['Erdgeschoss', 'Obergeschoss'].map((name, i) => ({ id: `floor-${i}`, name,
      background: { name: `${name}.png`, dataUrl: image, widthPx: 800, heightPx: 600, opacity: .45, origin: { x: 20, y: 30 } },
      calibration: { pointsPx: [{ x: 0, y: 0 }, { x: 500, y: 0 }], distanceMm: 4000, mmPerPixel: 8 },
      rooms: [{ ...room, id: `room-${i}`, name: i ? 'Schlafzimmer' : 'Wohnzimmer' }, { ...room, id: `disabled-${i}`, name: 'Bad', flooringEnabled: false }] })) };
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({ name: 'transfer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.getByRole('button', { name: 'Obergeschoss 2', exact: true }).click();
  await page.getByLabel('Zuschnitte farbig markieren').uncheck();
  await page.getByLabel('Abstandskeile anzeigen', { exact: true }).check();
  await page.getByLabel('Zeichenraster').selectOption('50');
  await page.getByLabel('An anderen Raumkanten einrasten beim Zeichnen, Eckpunkte ziehen und Raum verschieben').uncheck();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON speichern', exact: true }).click();
  const download = await downloadEvent, contents = await readFile((await download.path())!, 'utf8');
  const exported = JSON.parse(contents);
  expect(exported.floors).toEqual(project.floors); expect(exported.flooring).toEqual(project.flooring);
  expect(exported.ui).toEqual({ selectedFloorId: 'floor-1', selectedRoomId: 'room-1', snap: 50, snapRooms: false, showBoards: true, showCutColors: false, showSpacers: true });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const other = await mobile.newPage(); await other.goto('/');
    await other.locator('input[type=file][accept=".json,application/json"]').setInputFiles({ name: 'transfer.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
    await expect(other.getByLabel('Etagenname', { exact: true })).toHaveValue('Obergeschoss');
    await expect(other.getByLabel('Raumname', { exact: true })).toHaveValue('Schlafzimmer');
    await expect(other.getByLabel('Abstandskeile anzeigen', { exact: true })).toBeChecked();
    await expect(other.getByLabel('Zuschnitte farbig markieren')).not.toBeChecked();
    await expect.poll(() => other.evaluate(() => JSON.parse(localStorage.getItem('plankplan.project.v1') ?? 'null')?.floors)).toEqual(project.floors);
    await other.reload(); await expect(other.getByLabel('Etagenname', { exact: true })).toHaveValue('Obergeschoss');
    await expect(other.getByLabel('Raumname', { exact: true })).toHaveValue('Schlafzimmer');
    await expect(other.getByLabel('Zeichenraster')).toHaveValue('50');
    await other.getByRole('button', { name: 'Erdgeschoss 2', exact: true }).click();
    await expect(other.getByLabel('Raumname', { exact: true })).toHaveValue('Wohnzimmer');
  } finally { await mobile.close(); }
  // The safety menu clearly separates the older snapshot from the current export.
  await page.getByText('Älterer Sicherungsstand', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aktuelle Planung als JSON speichern', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Älteren Sicherungsstand als JSON speichern', exact: true })).toBeVisible();
});
