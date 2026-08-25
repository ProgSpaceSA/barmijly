/**
 * TEMP — delete when asked.
 *
 * Sends the daily digest to one seeded account (Gmail plus-address).
 *
 * Usage (from backend/):
 *   npm run digest:send -- hall
 *   npm run digest:send -- rc1
 *   npm run digest:send -- requester
 *   npm run digest:send -- --list
 *   npm run digest:send -- hall --force
 *
 * Code is the plus-part of  anas.hagras1999+CODE@gmail.com
 */
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import 'dotenv/config';
import { DigestService } from '../src/digest/digest.service';
import { EmailService } from '../src/email/email.service';
import { AccessService } from '../src/access/access.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAccounts, seedEmail } from './seed-matrix';

/** One representative per role so you can walk types without memorising tags. */
const ROLE_DEFAULTS: Record<string, string> = {
  requester: 'rcall',
  owner: 'ocall',
  head: 'hall',
  pm: 'pmall',
  developer: 'dcall',
  qa: 'qaall',
  senior: 'sall',
};

function usage(): never {
  const defaults = Object.entries(ROLE_DEFAULTS)
    .map(([name, code]) => `  ${name.padEnd(12)} ${seedEmail(code)}`)
    .join('\n');
  console.log(`Usage: npm run digest:send -- <code> [--force]
       npm run digest:send -- --list

<code> is the plus-part of anas.hagras1999+CODE@gmail.com
  e.g. hall  rc1  pmall  dc1  qac1  sall

Role shortcuts (org-wide / all-companies account):
${defaults}

--force  send even when the digest is empty
`);
  process.exit(1);
}

function listCodes() {
  console.log('Role shortcuts:');
  for (const [name, code] of Object.entries(ROLE_DEFAULTS)) {
    console.log(`  ${name.padEnd(12)} ${seedEmail(code)}`);
  }
  console.log('\nAll seeded plus-codes:');
  for (const acc of loginAccounts()) {
    const plus = acc.email.slice(acc.email.indexOf('+') + 1, acc.email.indexOf('@'));
    console.log(`  ${plus.padEnd(10)} ${acc.role.padEnd(20)} ${acc.label}  (${acc.note})`);
  }
}

function resolveEmail(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const plus = trimmed.replace(/^\+/, '');
  return seedEmail(ROLE_DEFAULTS[plus.toLowerCase()] ?? plus);
}

function preview(digest: Awaited<ReturnType<DigestService['buildDigest']>>) {
  const actionTotal = digest.actionGroups.reduce((sum, g) => sum + g.total, 0);
  console.log(
    `  ${digest.recipient.firstName} ${digest.recipient.lastName}  ${digest.recipient.role}`,
  );
  console.log(
    `  actions=${actionTotal}  mentions=${digest.mentions.length}  unread=${digest.unreadTotal}  bugs=${digest.bugAlertTotal}  tasks=${digest.openTasks.length}  overdue=${digest.overdue.length}  dueSoon=${digest.dueSoon.length}`,
  );
  for (const group of digest.actionGroups) {
    console.log(`    · ${group.label} (${group.total})`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force') || argv.includes('-f');
  const list = argv.includes('--list') || argv.includes('-l');
  const codes = argv.filter((a) => !a.startsWith('-'));

  if (list) {
    listCodes();
    return;
  }
  if (codes.length === 0) usage();

  const prisma = new PrismaService();
  await prisma.$connect();

  const config = new ConfigService(process.env);
  const emailService = new EmailService(config);
  const digestService = new DigestService(
    prisma,
    new AccessService(prisma),
    emailService,
    config,
    { addCronJob: () => undefined } as unknown as SchedulerRegistry,
  );

  try {
    for (const code of codes) {
      const email = resolveEmail(code);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true },
      });

      if (!user) {
        console.error(`No user for ${email} (code "${code}"). Try --list`);
        process.exitCode = 1;
        continue;
      }
      if (!user.isActive) {
        console.error(`Inactive: ${email}`);
        process.exitCode = 1;
        continue;
      }

      console.log(`Building digest for ${email}`);
      const digest = await digestService.buildDigest(user);
      preview(digest);

      if (digest.isEmpty && !force) {
        console.log('  empty — skipped (pass --force to send anyway)\n');
        continue;
      }

      await emailService.sendDailyDigest(email, digest);
      console.log(`  sent${digest.isEmpty ? ' (empty)' : ''}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
