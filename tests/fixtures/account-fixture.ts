import * as fs from 'node:fs';
import { test as base, type Page, type BrowserContext } from '@playwright/test';
import { findByLabel, addAccount, storageStatePath, type AccountEntry } from '../accounts/registry';
import { createAccount } from '../accounts/factory';

export type AccountFixtures = {
  /**
   * Look up (or create) an account by label, inject its identity into
   * localStorage, and return the ready-to-use page.
   *
   * If a saved storageState exists for that label, a fresh context is
   * created from it so the page starts fully logged-in.
   */
  useAccount: (label: string) => Promise<Page>;
};

export const test = base.extend<AccountFixtures>({
  useAccount: async ({ browser, page, baseURL }, use) => {
    const createdPages: Page[] = [];

    const fn = async (label: string): Promise<Page> => {
      let entry = findByLabel(label);
      if (!entry) {
        entry = await createAccount(label);
      }

      // If a persisted storageState file exists, use it for a fresh context
      if (entry.storageState && fs.existsSync(entry.storageState)) {
        const ctx = await browser.newContext({
          storageState: entry.storageState,
          ignoreHTTPSErrors: true,
          permissions: ['camera', 'microphone'],
          launchOptions: {
            args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
          },
        } as any);
        const newPage = await ctx.newPage();
        createdPages.push(newPage);
        if (baseURL) await newPage.goto(baseURL);
        return newPage;
      }

      // No storageState yet — inject identity via localStorage
      await page.goto(baseURL ?? 'https://localhost:444');
      await page.evaluate((identity) => {
        localStorage.setItem('aregoland_identity', JSON.stringify(identity));
      }, entry.identity);
      await page.reload();
      await page.waitForTimeout(1000);

      // Capture storageState for future reuse
      const ssPath = storageStatePath(label);
      await page.context().storageState({ path: ssPath });
      entry.storageState = ssPath;
      addAccount(entry);

      return page;
    };

    await use(fn);

    // Cleanup extra pages/contexts
    for (const p of createdPages) {
      await p.context().close();
    }
  },
});

export { expect } from '@playwright/test';
