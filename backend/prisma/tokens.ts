/**
 * Logs in every seeded matrix account against the running API and writes fresh
 * JWTs + a role/account reference to `data/`.
 *
 * Usage:  npm run db:tokens        (backend must be running)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
import { loginAccounts, SEED_PASSWORD, seedEmail } from './seed-matrix';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 3002}/api`;
const PASSWORD = process.env.SEED_PASSWORD || SEED_PASSWORD;
const DATA_DIR = join(__dirname, '..', '..', 'data');

const ACCOUNTS = [
  ...loginAccounts(),
  {
    key: 'DEVELOPER_INACTIVE',
    email: seedEmail('dinactive'),
    role: 'DEVELOPER',
    roleAr: 'مطور',
    label: 'DeveloperInactive',
    note: 'Project1, isActive=false — login should fail',
    skipLogin: true,
  },
];

async function login(email: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`${email}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; user: { id: string; firstName: string; lastName: string } }>;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const tokens: Record<string, any> = {};
  for (const acc of ACCOUNTS) {
    if ('skipLogin' in acc && acc.skipLogin) {
      tokens[acc.key] = {
        email: acc.email,
        name: acc.label,
        role: acc.role,
        roleAr: acc.roleAr,
        note: acc.note,
      };
      console.log(`  skip ${acc.role.padEnd(20)} ${acc.email}  (${acc.note})`);
      continue;
    }
    const { access_token, user } = await login(acc.email);
    tokens[acc.key] = {
      email: acc.email,
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: acc.role,
      roleAr: acc.roleAr,
      note: acc.note,
      access_token,
    };
    console.log(`  ${acc.role.padEnd(20)} ${acc.email}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    api: API,
    frontend: process.env.FRONTEND_URL || 'http://localhost:3000',
    password: PASSWORD,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    accounts: tokens,
  };

  writeFileSync(join(DATA_DIR, 'tokens.json'), JSON.stringify(payload, null, 2), 'utf8');

  const env = Object.entries(tokens)
    .filter(([, v]) => v.access_token)
    .map(([k, v]: [string, any]) => `export TOKEN_${k}="${v.access_token}"`)
    .join('\n');
  writeFileSync(join(DATA_DIR, 'tokens.env'), `# source data/tokens.env\nexport API_URL="${API}"\n${env}\n`, 'utf8');

  const logins = ACCOUNTS.filter((a) => !('skipLogin' in a && a.skipLogin)).length;
  console.log(`\nWrote data/tokens.json and data/tokens.env (${logins} accounts)`);
}

main().catch((e) => {
  console.error('Failed — is the backend running?\n', e.message);
  process.exit(1);
});
