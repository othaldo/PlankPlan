import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('touch pans and pinches without editing rooms, and supports tap drawing and vertex dragging', async ({ page, context }) => {
  await page.goto('/');
  const svg = page.getByRole('img', { name: 'Interaktiver Verlegeplan' });
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const session = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { x: number; y: number; id: number }[]) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const view = async () => (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
  const rooms = () => page.evaluate(() => JSON.parse(localStorage.getItem('plankplan.project.v1') ?? 'null')?.floors);
  await expect.poll(rooms).toBeTruthy();
  const original = await rooms(), before = await view(), scroll = await page.evaluate(() => scrollY);
  await touch('touchStart', [{ ...c, id: 1 }]);
  await touch('touchMove', [{ x: c.x + 35, y: c.y + 40, id: 1 }]);
  await touch('touchEnd', []);
  expect((await view())[0]).toBeLessThan(before[0]); expect((await view())[1]).toBeLessThan(before[1]);
  expect((await view()).slice(2)).toEqual(before.slice(2));
  const pan = await view();
  const anchor = await svg.evaluate((node, p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform((node as SVGSVGElement).getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  }, c);
  await touch('touchStart', [{ x: c.x - 40, y: c.y, id: 1 }, { x: c.x + 40, y: c.y, id: 2 }]);
  await touch('touchMove', [{ x: c.x - 65, y: c.y + 20, id: 1 }, { x: c.x + 95, y: c.y + 20, id: 2 }]);
  await expect.poll(async () => (await view())[2]).toBeCloseTo(pan[2] / 2, 2);
  const pinch = await view();
  const anchored = await svg.evaluate((node, p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform((node as SVGSVGElement).getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  }, { x: c.x + 15, y: c.y + 20 });
  expect(anchored.x).toBeCloseTo(anchor.x, 1); expect(anchored.y).toBeCloseTo(anchor.y, 1);
  await touch('touchEnd', [{ x: c.x - 65, y: c.y + 20, id: 1 }]);
  await touch('touchMove', [{ x: c.x - 30, y: c.y + 50, id: 1 }]);
  expect(await view()).toEqual(pinch); await touch('touchEnd', []);
  expect(await rooms()).toEqual(original); expect(await page.evaluate(() => scrollY)).toBe(scroll);

  // A second finger cancels a vertex preview rather than committing it.
  await page.getByRole('button', { name: 'Plan einpassen' }).click();
  const vertex = page.getByRole('button', { name: 'Eckpunkt 1', exact: true });
  const vb = (await vertex.boundingBox())!, p = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
  await touch('touchStart', [{ ...p, id: 1 }]);
  await touch('touchMove', [{ x: p.x + 25, y: p.y + 25, id: 1 }]);
  await touch('touchStart', [{ x: p.x + 25, y: p.y + 25, id: 1 }, { ...c, id: 2 }]);
  await touch('touchCancel', []); expect(await rooms()).toEqual(original);
  await touch('touchStart', [{ ...p, id: 1 }]);
  await touch('touchMove', [{ x: p.x + 15, y: p.y + 15, id: 1 }]);
  await touch('touchEnd', []);
  await expect.poll(rooms).not.toEqual(original);

  await page.getByRole('button', { name: 'Raum zeichnen', exact: true }).last().click();
  await svg.scrollIntoViewIfNeeded();
  const db = (await svg.boundingBox())!, d = { x: db.x + db.width / 2, y: db.y + db.height / 2 };
  await touch('touchStart', [{ x: d.x - 30, y: d.y, id: 1 }, { x: d.x + 30, y: d.y, id: 2 }]);
  await touch('touchMove', [{ x: d.x - 50, y: d.y, id: 1 }, { x: d.x + 50, y: d.y, id: 2 }]);
  await touch('touchEnd', []); await expect(svg.locator('polyline')).toHaveCount(0);
  await touch('touchStart', [{ ...d, id: 1 }]); await touch('touchEnd', []);
  await expect(svg.locator('polyline')).toHaveCount(1);
});

test('touch calibration accepts taps but never adds measurement points while pinching', async ({ page, context }) => {
  await page.goto('/');
  const rooms = () => page.evaluate(() => JSON.parse(localStorage.getItem('plankplan.project.v1') ?? 'null')?.floors[0].rooms);
  await expect.poll(rooms).toBeTruthy(); const before = await rooms();
  const base64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'touch.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  await expect(page.getByRole('status')).toContainText('Grundriss geladen');
  const svg = page.getByRole('img', { name: 'Interaktiver Verlegeplan' }); await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!, c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const session = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x: c.x - 40, y: c.y, id: 1 }]);
  await touch('touchStart', [{ x: c.x - 40, y: c.y, id: 1 }, { x: c.x + 40, y: c.y, id: 2 }]);
  await touch('touchMove', [{ x: c.x - 60, y: c.y, id: 1 }, { x: c.x + 60, y: c.y, id: 2 }]);
  await touch('touchEnd', []); await expect(svg.locator('circle[fill="#bd613b"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Plan einpassen' }).click();
  for (const p of [{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }]) {
    const q = await svg.evaluate((node, point) => { const q = new DOMPoint(point.x, point.y).matrixTransform((node as SVGSVGElement).getScreenCTM()!); return { x: q.x, y: q.y }; }, p);
    await touch('touchStart', [{ ...q, id: 1 }]); await touch('touchEnd', []);
  }
  await expect(svg.locator('circle[fill="#bd613b"]')).toHaveCount(2);
  await page.getByLabel('Reale Strecke').fill('4000'); await page.getByLabel('Reale Strecke').press('Enter');
  await page.getByRole('button', { name: 'Maßstab übernehmen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('plankplan.project.v1') ?? 'null')?.floors[0].calibration?.mmPerPixel)).toBeCloseTo(10, 3);
  expect(await rooms()).toEqual(before);
});
