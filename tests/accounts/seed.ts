/**
 * Seed script — pre-creates the standard set of test accounts.
 *
 * Usage:  npx tsx tests/accounts/seed.ts
 */
import { createAccount } from './factory';
import { listLabels } from './registry';

const STANDARD_ACCOUNTS = [
  { label: 'Normaler User', displayName: 'Test Normaler User' },
  { label: 'FSK 18 verifiziert', displayName: 'Test FSK18 User' },
  { label: 'FSK 6 ohne Verwalter', displayName: 'Test Kind ohne Verwalter' },
  { label: 'Kind von Verwalter XY', displayName: 'Test Kind (Verwalter XY)' },
];

async function seed() {
  console.log('Seeding test accounts...');

  for (const { label, displayName } of STANDARD_ACCOUNTS) {
    const entry = await createAccount(label, { displayName });
    console.log(`  ✓ ${label} → ${entry.identity.aregoId}`);
  }

  console.log(`\nRegistry now contains ${listLabels().length} account(s):`);
  for (const l of listLabels()) {
    console.log(`  - ${l}`);
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
