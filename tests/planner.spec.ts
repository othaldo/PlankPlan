import { expect, test } from '@playwright/test';
test('changes real material, optimizes the offset, persists and round-trips a project', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page).toHaveTitle(/PlankPlan/);
  await expect(page.getByRole('heading', { name: 'Wohnzimmer' })).toBeVisible();
  await page.getByLabel('Laminatvorlage').selectOption('1');
  await expect(page.getByLabel('Dielenbreite')).toHaveValue('246');
  await expect(page.getByText('Automatisch geplant', { exact: true })).toBeVisible();
  await page.getByText('Manuell anpassen (Experten)', { exact: true }).click();
  await page.getByLabel('Manuelle Rasterplanung aktivieren').check();
  await page.getByRole('button', { name: 'Quer-Offset optimieren' }).click();
  await expect(page.getByRole('status')).toContainText('Quer-Offset optimiert', { timeout: 20000 });
  const offset = await page.getByLabel('Quer-Offset').inputValue();
  await page.getByRole('button', { name: 'Etage hinzufügen' }).click();
  await page.getByLabel('Etagenname').fill('Dachgeschoss');
  await page.getByRole('button', { name: 'Räume aus JSON einfügen' }).click();
  await page.getByLabel('Raumdefinitionen als JSON').fill('{"rooms":[{"name":"Büro","polygon":[[0,0],[4000,0],[4000,3000],[0,3000]]}]}');
  await page.getByRole('button', { name: 'Räume hinzufügen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Büro', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'JSON speichern' }).click();
  const download = await downloadPromise; const path = await download.path(); expect(path).toBeTruthy();
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(path!);
  await expect(page.getByRole('status')).toContainText('Projekt einschließlich');
  await expect(page.getByLabel('Quer-Offset')).toHaveValue(offset);
  await page.waitForTimeout(500); await page.reload();
  await expect(page.getByLabel('Dielenbreite')).toHaveValue('246');
  await expect(page.getByRole('button', { name: 'Dachgeschoss' })).toBeVisible();
  await page.screenshot({ path: 'test-results/plankplan-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('automatically corrects short end pieces, shows packs and excludes disabled rooms', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Automatisch geplant', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Quer-Offset')).not.toBeVisible();
  const titles = await page.locator('svg path > title').allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) {
    const length = title.match(/(?:Zuschnitt|Ganze Diele): ([\d.]+)/)?.[1]; expect(Number(length)).toBeGreaterThanOrEqual(299.99);
  }
  const expectedPacks = Math.ceil(Math.ceil(titles.length * 1.05 - 1e-9) / 10);
  await expect(page.locator('.package-result strong')).toHaveText(`${expectedPacks} Pakete für diesen Raum`);
  await page.getByLabel('Laminat in diesem Raum verlegen').uncheck();
  await expect(page.locator('svg path > title')).toHaveCount(0);
  await expect(page.locator('.package-result')).toHaveCount(0);
  await expect(page.getByText('In diesem Raum ist Laminat ausgeschaltet.', { exact: false })).toBeVisible();
  await page.waitForTimeout(500); await page.reload();
  await expect(page.getByLabel('Laminat in diesem Raum verlegen')).not.toBeChecked();
  await page.getByLabel('Laminat in diesem Raum verlegen').check();
  await expect(page.getByText('Automatisch geplant', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/plankplan-automatic.png', fullPage: true });
});
test('snaps an entire room flush against an adjacent room wall without changing its size', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Etage hinzufügen' }).click();
  await page.getByRole('button', { name: 'Räume aus JSON einfügen' }).click();
  await page.getByLabel('Raumdefinitionen als JSON').fill('{"rooms":[{"name":"Links","flooringEnabled":false,"polygon":[[0,0],[3000,0],[3000,3000],[0,3000]]},{"name":"Rechts","flooringEnabled":false,"polygon":[[3500,0],[5500,0],[5500,3000],[3500,3000]]}]}');
  await page.getByRole('button', { name: 'Räume hinzufügen', exact: true }).click();
  await page.getByRole('button', { name: 'Plan einpassen' }).click();
  await page.getByRole('button', { name: 'Raum verschieben', exact: true }).click();
  const svg = page.getByRole('img', { name: 'Interaktiver Verlegeplan' });
  const screenPoint = async (x: number, y: number) => svg.evaluate((node, p) => { const q = new DOMPoint(p.x, p.y).matrixTransform((node as SVGSVGElement).getScreenCTM()!); return { x: q.x, y: q.y }; }, { x, y });
  const start = await screenPoint(4500, 1500), end = await screenPoint(4020, 1500);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(500);
  const polygon = await page.evaluate(() => JSON.parse(localStorage.getItem('plankplan.project.v1')!).floors[1].rooms[1].polygon);
  expect(polygon[0].x).toBeCloseTo(3000); expect(polygon[1].x - polygon[0].x).toBeCloseTo(2000);
  expect(polygon[2].y - polygon[1].y).toBeCloseTo(3000);
  await page.screenshot({ path: 'test-results/plankplan-adjacent-rooms.png', fullPage: true });
});
test('loads an image, calibrates two points and traces a polygon in world coordinates', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Etage hinzufügen' }).click();
  // Browser canvas generates a known 800 x 600 plan without an external asset.
  const base64 = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 800, 600); ctx.strokeStyle = '#333'; ctx.strokeRect(60, 60, 650, 450);
    return canvas.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'grundriss.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  const svg = page.getByRole('img', { name: 'Interaktiver Verlegeplan' });
  const screenPoint = async (x: number, y: number) => svg.evaluate((node, p) => { const m = (node as SVGSVGElement).getScreenCTM()!; const q = new DOMPoint(p.x, p.y).matrixTransform(m); return { x: q.x, y: q.y }; }, { x, y });
  await expect(page.getByRole('button', { name: 'Maßstab übernehmen' })).toBeVisible();
  let p = await screenPoint(500, 500); await page.mouse.click(p.x, p.y);
  p = await screenPoint(3500, 500); await page.mouse.click(p.x, p.y);
  await page.getByLabel('Reale Strecke').fill('6000'); await page.getByLabel('Reale Strecke').press('Tab');
  await page.getByRole('button', { name: 'Maßstab übernehmen' }).click();
  await expect(page.getByText('10,000 mm / Bildpixel')).toBeVisible();
  await page.getByRole('button', { name: 'Raum zeichnen', exact: true }).first().click();
  for (const [x, y] of [[600, 600], [7000, 600], [7000, 5000], [600, 5000]]) {
    p = await screenPoint(x, y); await page.mouse.click(p.x, p.y);
  }
  await page.getByRole('button', { name: 'Raum schließen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Raum 1', exact: true })).toBeVisible();
  await page.getByLabel('Projektname').fill('Kalibrierter Test');
  await page.waitForTimeout(500);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('plankplan.project.v1')!));
  const floor = stored.floors[1]; expect(floor.calibration.mmPerPixel).toBeCloseTo(10); expect(floor.rooms[0].polygon[1]).toEqual({ x: 7000, y: 600 });
});
test('shows the editor on narrow screens and rejects malformed imports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
  await expect(page.getByRole('status')).toContainText('gültiges JSON');
  await expect(page.getByRole('heading', { name: 'Wohnzimmer' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/plankplan-mobile.png', fullPage: true });
});
