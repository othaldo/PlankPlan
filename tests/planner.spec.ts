import { expect, test } from '@playwright/test';
test('changes real material, optimizes the offset, persists and round-trips a project', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page).toHaveTitle(/PlankPlan/);
  await expect(page.getByRole('heading', { name: 'Wohnzimmer' })).toBeVisible();
  await page.getByLabel('Laminatvorlage').selectOption('1');
  await expect(page.getByLabel('Dielenbreite')).toHaveValue('246');
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
