import { test, expect } from '@playwright/test';

test('Console-Fehler auf Startseite prüfen', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });

  page.on('pageerror', (err) => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  await page.goto('/');
  await page.waitForTimeout(3000);

  console.log('=== ERRORS ===');
  for (const e of errors) console.log(e);
  console.log('=== WARNINGS ===');
  for (const w of warnings) console.log(w);
  console.log(`Total: ${errors.length} errors, ${warnings.length} warnings`);
});

test('Console-Fehler nach Registrierung prüfen', async ({ page }) => {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  page.on('pageerror', (err) => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  // Identity injizieren
  await page.goto('/');
  await page.evaluate(() => {
    const mockIdentity = {
      aregoId: 'AC-TEST-12345678',
      displayName: 'Test Ümläut 😎',
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key',
      publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test' },
      privateKeyJwk: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test', d: 'test' },
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('aregoland_identity', JSON.stringify(mockIdentity));
  });
  await page.reload();
  await page.waitForTimeout(3000);

  console.log('=== ERRORS AFTER LOGIN ===');
  for (const e of errors) console.log(e);
  console.log(`Total: ${errors.length} errors`);

  // Screenshot
  await page.screenshot({ path: 'tests/after-login-screenshot.png', fullPage: true });
});

test('btoa/atob Unicode-Kompatibilität', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(() => {
    try {
      // Test: Unicode string → base64 → zurück
      const testStr = JSON.stringify({ name: 'Müller 😎', id: 'AC-TEST' });

      // Neue Methode (Unicode-safe)
      const encoded = btoa(
        new TextEncoder().encode(testStr).reduce((s: string, b: number) => s + String.fromCharCode(b), '')
      );
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(decoded);

      return { success: true, original: testStr, decoded, match: testStr === decoded, name: parsed.name };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  console.log('Unicode base64 test:', JSON.stringify(result));
  expect(result.success).toBe(true);
  expect(result.match).toBe(true);
});
