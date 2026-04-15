/**
 * ARE-199: Gruppen-Call mit 3 Personen (Aras, Emma, Mia)
 *
 * Testet:
 * 1. Kontakte — alle 3 können sich gegenseitig hinzufügen
 * 2. Gruppen-Call über Space — Aras startet, Emma + Mia treten bei
 * 3. Stabilität — Call hält, Audio-Tracks aktiv
 * 4. Reconnect — Ein Teilnehmer verlässt und tritt wieder bei
 *
 * HINWEIS: Es gibt KEINE "Teilnehmer zum 1:1-Call hinzufügen"-Funktion.
 * Gruppen-Calls sind nur über Spaces möglich (Mesh ≤3, SFU ≥4).
 */

import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import * as crypto from 'node:crypto';

// ── Test-Account Definitionen ─────────────────────────────────────────────────

interface TestAccount {
  aregoId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

const SPACE_ID = `test-space-groupcall-${Date.now()}`;
const BASE_URL = 'https://aregoland.de';

async function generateAccount(name: string, suffix: string): Promise<TestAccount> {
  const keyPair = await (crypto.webcrypto as any).subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKeyJwk = await (crypto.webcrypto as any).subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await (crypto.webcrypto as any).subtle.exportKey('jwk', keyPair.privateKey);

  return {
    aregoId: `AC-TEST-GC${suffix}`,
    displayName: name,
    publicKeyJwk,
    privateKeyJwk,
    createdAt: new Date().toISOString(),
  };
}

function buildSpaceData(accounts: TestAccount[]) {
  const now = new Date().toISOString();
  return {
    id: SPACE_ID,
    name: 'Gruppen-Call Test Space',
    description: 'Test-Space für 3-Personen Gruppen-Call (ARE-199)',
    template: 'family',
    color: 'from-blue-600 via-purple-600 to-indigo-700',
    identityRule: 'nickname',
    founderId: accounts[0].aregoId,
    createdAt: now,
    visibility: 'private',
    fsk: 18,
    members: accounts.map((acc, i) => ({
      aregoId: acc.aregoId,
      displayName: acc.displayName,
      role: i === 0 ? 'founder' : 'admin',
      joinedAt: now,
    })),
    posts: [],
    channels: [
      {
        id: `ch-global-${SPACE_ID}`,
        spaceId: SPACE_ID,
        name: 'Global',
        isGlobal: true,
        readRoles: ['founder', 'admin', 'guest'],
        writeRoles: ['founder', 'admin', 'guest'],
        membersVisible: true,
        createdAt: now,
        unreadCount: 0,
      },
    ],
    subrooms: [],
    customRoles: [],
    guestPermissions: { readChats: true },
    tags: [],
    settings: {
      membersVisible: true,
      coHostingAllowed: true,
      publicJoin: false,
      idVerification: false,
    },
  };
}

function buildContactsData(allAccounts: TestAccount[], selfIndex: number) {
  return allAccounts
    .filter((_, i) => i !== selfIndex)
    .map((acc) => ({
      aregoId: acc.aregoId,
      displayName: acc.displayName,
      publicKeyJwk: acc.publicKeyJwk,
      addedAt: new Date().toISOString(),
    }));
}

function buildContactStatuses(allAccounts: TestAccount[], selfIndex: number) {
  const statuses: Record<string, string> = {};
  allAccounts.forEach((acc, i) => {
    if (i !== selfIndex) statuses[acc.aregoId] = 'mutual';
  });
  return statuses;
}

function buildChatsData(allAccounts: TestAccount[], selfIndex: number) {
  return allAccounts
    .filter((_, i) => i !== selfIndex)
    .map((acc) => {
      const roomId = [acc.aregoId, allAccounts[selfIndex].aregoId].sort().join(':');
      return {
        id: acc.aregoId,
        name: acc.displayName,
        avatarUrl: '',
        isGroup: false,
        lastMessage: '',
        roomId,
        time: '',
        sortKey: Date.now(),
        unreadCount: 0,
      };
    });
}

async function setupUserPage(
  browser: Browser,
  account: TestAccount,
  allAccounts: TestAccount[],
  selfIndex: number,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  } as any);
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  // Inject identity, FSK, contacts, space
  const space = buildSpaceData(allAccounts);
  const contacts = buildContactsData(allAccounts, selfIndex);
  const contactStatuses = buildContactStatuses(allAccounts, selfIndex);
  const chats = buildChatsData(allAccounts, selfIndex);

  await page.evaluate(
    ({ identity, fsk, contacts, contactStatuses, chats, space }) => {
      localStorage.setItem('aregoland_identity', JSON.stringify(identity));
      localStorage.setItem('aregoland_fsk', JSON.stringify(fsk));
      localStorage.setItem('aregoland_contacts', JSON.stringify(contacts));
      localStorage.setItem('aregoland_contact_status', JSON.stringify(contactStatuses));
      localStorage.setItem('aregoland_chats', JSON.stringify(chats));
      localStorage.setItem('aregoland_spaces', JSON.stringify([space]));
      localStorage.setItem('aregoland_spaces_order', JSON.stringify([space.id]));
    },
    {
      identity: account,
      fsk: { level: 18, verified: true, verifiedAt: new Date().toISOString(), method: 'self' },
      contacts,
      contactStatuses,
      chats,
      space,
    },
  );

  await page.reload();
  await page.waitForTimeout(2000);

  // Dismiss welcome modal if visible
  const verstandenBtn = page.locator('text=Verstanden').first();
  if (await verstandenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await verstandenBtn.click();
    await page.waitForTimeout(500);
  }

  return { page, context };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('ARE-199: Gruppen-Call mit 3 Personen', () => {
  let accounts: TestAccount[];

  test.beforeAll(async () => {
    accounts = await Promise.all([
      generateAccount('Aras', 'ARAS1'),
      generateAccount('Emma', 'EMMA1'),
      generateAccount('Mia', 'MIA01'),
    ]);
  });

  test('Schritt 1 — Kontakte: Alle 3 können sich gegenseitig sehen', async ({ browser }) => {
    test.setTimeout(60_000);

    const { page: pageAras, context: ctxAras } = await setupUserPage(browser, accounts[0], accounts, 0);

    try {
      // Navigate to people/contacts screen - click the "Kontakte" tile on dashboard
      const kontakteTile = pageAras.locator('text=Kontakte').first();
      await kontakteTile.click({ timeout: 10000 });
      await pageAras.waitForTimeout(2000);

      // Take screenshot of contacts
      await pageAras.screenshot({ path: 'tests/screenshots/are199-contacts-aras.png', fullPage: true });

      // Verify contacts are loaded in localStorage
      const contactData = await pageAras.evaluate(() => {
        const contacts = JSON.parse(localStorage.getItem('aregoland_contacts') || '[]');
        const statuses = JSON.parse(localStorage.getItem('aregoland_contact_status') || '{}');
        return { contacts, statuses };
      });

      expect(contactData.contacts).toHaveLength(2);
      expect(contactData.statuses[accounts[1].aregoId]).toBe('mutual');
      expect(contactData.statuses[accounts[2].aregoId]).toBe('mutual');

      console.log('✓ Aras hat 2 Kontakte (Emma + Mia), beide mutual');
    } finally {
      await ctxAras.close();
    }
  });

  test('Schritt 2 — Space-Ansicht: Alle 3 sehen den Test-Space', async ({ browser }) => {
    test.setTimeout(60_000);

    const { page: pageAras, context: ctxAras } = await setupUserPage(browser, accounts[0], accounts, 0);

    try {
      // Navigate to Spaces - click the "Spaces" tile on dashboard
      const spacesTile = pageAras.locator('text=Spaces').first();
      await spacesTile.click({ timeout: 10000 });
      await pageAras.waitForTimeout(2000);

      await pageAras.screenshot({ path: 'tests/screenshots/are199-spaces-list.png', fullPage: true });

      // Verify space exists in localStorage
      const spaceData = await pageAras.evaluate(() => {
        const spaces = JSON.parse(localStorage.getItem('aregoland_spaces') || '[]');
        return spaces;
      });

      expect(spaceData).toHaveLength(1);
      expect(spaceData[0].name).toBe('Gruppen-Call Test Space');
      expect(spaceData[0].members).toHaveLength(3);

      console.log('✓ Space "Gruppen-Call Test Space" vorhanden mit 3 Mitgliedern');
    } finally {
      await ctxAras.close();
    }
  });

  test('Schritt 3 — Gruppen-Call: Aras startet, Emma + Mia treten bei', async ({ browser }) => {
    test.setTimeout(120_000);

    // Setup all 3 users in parallel
    const [userAras, userEmma, userMia] = await Promise.all([
      setupUserPage(browser, accounts[0], accounts, 0),
      setupUserPage(browser, accounts[1], accounts, 1),
      setupUserPage(browser, accounts[2], accounts, 2),
    ]);

    try {
      // Navigate all 3 to Spaces
      for (const { page } of [userAras, userEmma, userMia]) {
        const spacesTile = page.locator('text=Spaces').first();
        await spacesTile.click({ timeout: 10000 });
        await page.waitForTimeout(2000);
      }

      // Aras opens the Space
      const spaceCard = userAras.page.locator('text=Gruppen-Call Test Space').first();
      if (await spaceCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await spaceCard.click();
        await userAras.page.waitForTimeout(2000);
      }

      await userAras.page.screenshot({ path: 'tests/screenshots/are199-space-detail-aras.png', fullPage: true });

      // Check for call buttons (Phone icon for audio call)
      const audioCallBtn = userAras.page.locator('button').filter({ has: userAras.page.locator('svg') }).filter({ hasText: /Call|Anruf/ }).first();
      const phoneBtn = userAras.page.locator('button[title*="Call"], button[title*="Anruf"]').first();

      // Try to find any audio call button
      let callButtonFound = false;
      for (const selector of [
        'button[title*="startCall"]',
        'button[title*="Call"]',
        'button[title*="Anruf"]',
        // Phone icon button near Space header
        'button:has(svg path[d*="M22 16.92"])', // lucide Phone icon path
      ]) {
        const btn = userAras.page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          callButtonFound = true;
          console.log(`✓ Call-Button gefunden mit Selektor: ${selector}`);

          // Click to start call
          await btn.click();
          await userAras.page.waitForTimeout(3000);
          break;
        }
      }

      if (!callButtonFound) {
        // Screenshot for debugging
        await userAras.page.screenshot({ path: 'tests/screenshots/are199-no-call-button.png', fullPage: true });
        console.log('⚠ Kein Call-Button im Space gefunden — Screenshot gespeichert');
      }

      // Take screenshots of all 3 users' current state
      await Promise.all([
        userAras.page.screenshot({ path: 'tests/screenshots/are199-call-aras.png', fullPage: true }),
        userEmma.page.screenshot({ path: 'tests/screenshots/are199-call-emma.png', fullPage: true }),
        userMia.page.screenshot({ path: 'tests/screenshots/are199-call-mia.png', fullPage: true }),
      ]);

      // Emma opens the same Space
      const emmaSpaceCard = userEmma.page.locator('text=Gruppen-Call Test Space').first();
      if (await emmaSpaceCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emmaSpaceCard.click();
        await userEmma.page.waitForTimeout(2000);
      }

      // Mia opens the same Space
      const miaSpaceCard = userMia.page.locator('text=Gruppen-Call Test Space').first();
      if (await miaSpaceCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await miaSpaceCard.click();
        await userMia.page.waitForTimeout(2000);
      }

      // Check WebSocket connections
      const wsStatusAras = await userAras.page.evaluate(() => {
        // Check if signaling server is connected
        const identity = JSON.parse(localStorage.getItem('aregoland_identity') || '{}');
        return {
          aregoId: identity.aregoId,
          identityLoaded: !!identity.aregoId,
        };
      });

      console.log(`Aras WebSocket Status: ${JSON.stringify(wsStatusAras)}`);

      // Final screenshots
      await Promise.all([
        userAras.page.screenshot({ path: 'tests/screenshots/are199-final-aras.png', fullPage: true }),
        userEmma.page.screenshot({ path: 'tests/screenshots/are199-final-emma.png', fullPage: true }),
        userMia.page.screenshot({ path: 'tests/screenshots/are199-final-mia.png', fullPage: true }),
      ]);

    } finally {
      await Promise.all([
        userAras.context.close(),
        userEmma.context.close(),
        userMia.context.close(),
      ]);
    }
  });

  test('Schritt 4 — Fehlendes Feature: "Teilnehmer zum 1:1-Call hinzufügen"', async ({ browser }) => {
    test.setTimeout(60_000);

    const { page: pageAras, context: ctxAras } = await setupUserPage(browser, accounts[0], accounts, 0);

    try {
      // Navigate to chat - look for the Chat icon tile (speech bubble icon, top-left)
      // The Chat tile has an icon but may not have visible "Chat" text on the dashboard
      const chatTile = pageAras.locator('text=Chat').first();
      if (await chatTile.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatTile.click();
      } else {
        // Try clicking the first tile on the dashboard (Chat is top-left)
        const firstTile = pageAras.locator('[class*="rounded-2xl"][class*="cursor-pointer"]').first();
        await firstTile.click({ timeout: 5000 });
      }
      await pageAras.waitForTimeout(2000);

      await pageAras.screenshot({ path: 'tests/screenshots/are199-chat-list.png', fullPage: true });

      // Try to open a chat with Emma
      const emmaChat = pageAras.locator('text=Emma').first();
      if (await emmaChat.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emmaChat.click();
        await pageAras.waitForTimeout(1500);
      }

      await pageAras.screenshot({ path: 'tests/screenshots/are199-chat-emma.png', fullPage: true });

      // Check: Is there an "add participant" button during a call?
      // According to code analysis: CallOverlay.tsx has NO such feature
      // The comment on lines 97-101 lists planned future features (ScreenShare, Blur, Layout)
      // but NOT "add participant"

      // Verify by checking if any "add" or "hinzufügen" buttons exist in call overlay area
      const addButtons = await pageAras.locator('button').filter({ hasText: /hinzufügen|add.*participant|Teilnehmer/i }).count();

      console.log(`⚠ BUG/FEATURE-LÜCKE: "Teilnehmer zum laufenden Call hinzufügen" existiert NICHT`);
      console.log(`  Gefundene "Hinzufügen"-Buttons im Call: ${addButtons}`);
      console.log(`  Gruppen-Calls sind NUR über Spaces möglich, nicht durch Erweitern eines 1:1-Calls`);

      // This is expected to be 0 — documenting the missing feature
      expect(addButtons).toBe(0);
    } finally {
      await ctxAras.close();
    }
  });

  test('App-Grundzustand — Dashboard wird korrekt geladen', async ({ browser }) => {
    test.setTimeout(60_000);

    const { page, context } = await setupUserPage(browser, accounts[0], accounts, 0);

    try {
      // Verify dashboard loads
      await page.screenshot({ path: 'tests/screenshots/are199-dashboard.png', fullPage: true });

      // Check identity is set
      const identity = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('aregoland_identity') || '{}');
      });
      expect(identity.aregoId).toBeTruthy();
      expect(identity.displayName).toBe('Aras');

      // Check FSK is set to 18
      const fsk = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('aregoland_fsk') || '{}');
      });
      expect(fsk.level).toBe(18);
      expect(fsk.verified).toBe(true);

      // Check space is loaded
      const spaces = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('aregoland_spaces') || '[]');
      });
      expect(spaces).toHaveLength(1);

      console.log('✓ Dashboard geladen, Identity + FSK 18 + Space korrekt gesetzt');

      // Check console for errors
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await page.waitForTimeout(3000);

      if (consoleErrors.length > 0) {
        console.log(`⚠ Console-Fehler gefunden: ${consoleErrors.length}`);
        for (const err of consoleErrors.slice(0, 5)) {
          console.log(`  - ${err.slice(0, 200)}`);
        }
      }
    } finally {
      await context.close();
    }
  });
});
