/**
 * Shared login matrix for `seed.ts` and `tokens.ts`.
 *
 * Two independent scopes — a user is assigned to companies, or to projects
 * (systems), never both, so the two filters can be tested in isolation:
 *
 *   DeveloperC1   → every project inside Company1 (Project1 + Project2)
 *   DeveloperP1   → Project1 only (must not see Project2, even in Company1)
 *   DeveloperP13  → Project1 + Project3 (cross-company)
 *   ProjectManagerC12 → Company1 + Company2
 *   ProgrammingHeadAll → no grants, org-wide
 */
export const SEED_PASSWORD = 'asdfasdf0!';

export const COMPANY_COUNT = 6;
export const PROJECTS_PER_COMPANY = 2;
export const PROJECT_COUNT = COMPANY_COUNT * PROJECTS_PER_COMPANY;

export function seedEmail(plus: string) {
  return `anas.hagras1999+${plus}@gmail.com`;
}

export function companyOfProject(projectN: number) {
  return Math.ceil(projectN / PROJECTS_PER_COMPANY);
}

export function projectsOfCompany(companyN: number): number[] {
  const start = (companyN - 1) * PROJECTS_PER_COMPANY + 1;
  return Array.from({ length: PROJECTS_PER_COMPANY }, (_, i) => start + i);
}

export type Scope =
  | { kind: 'all' }
  | { kind: 'companies'; ids: readonly number[] }
  | { kind: 'projects'; ids: readonly number[] };

export const SCOPE_TAGS: Record<string, Scope> = {
  all: { kind: 'all' },
  call: { kind: 'companies', ids: [1, 2, 3, 4, 5, 6] },
  c1: { kind: 'companies', ids: [1] },
  c2: { kind: 'companies', ids: [2] },
  c3: { kind: 'companies', ids: [3] },
  c4: { kind: 'companies', ids: [4] },
  c5: { kind: 'companies', ids: [5] },
  c6: { kind: 'companies', ids: [6] },
  c12: { kind: 'companies', ids: [1, 2] },
  c123: { kind: 'companies', ids: [1, 2, 3] },
  c456: { kind: 'companies', ids: [4, 5, 6] },
  p1: { kind: 'projects', ids: [1] },
  p2: { kind: 'projects', ids: [2] },
  p13: { kind: 'projects', ids: [1, 3] },
};

const COMPANY_TAGS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c12', 'c123', 'c456'] as const;
const PROJECT_TAGS = ['p1', 'p2', 'p13'] as const;
const SHARED_TAGS = [...COMPANY_TAGS, ...PROJECT_TAGS];

export const ROLE_MATRIX = [
  {
    key: 'ticketRequester',
    label: 'TicketRequester',
    role: 'TICKET_REQUESTER',
    roleAr: 'طالب التذكرة',
    prefix: 'r',
    tags: [...SHARED_TAGS, 'call'],
  },
  {
    key: 'systemOwner',
    label: 'SystemOwner',
    role: 'SYSTEM_OWNER',
    roleAr: 'مالك النظام',
    prefix: 'o',
    tags: [...SHARED_TAGS, 'call'],
  },
  {
    key: 'programmingHead',
    label: 'ProgrammingHead',
    role: 'PROGRAMMING_HEAD',
    roleAr: 'رئيس البرمجة',
    prefix: 'h',
    tags: [...SHARED_TAGS, 'all'],
  },
  {
    key: 'projectManager',
    label: 'ProjectManager',
    role: 'PROJECT_MANAGER',
    roleAr: 'مدير المشروع',
    prefix: 'pm',
    tags: [...SHARED_TAGS, 'all'],
  },
  {
    key: 'developer',
    label: 'Developer',
    role: 'DEVELOPER',
    roleAr: 'مطور',
    prefix: 'd',
    tags: [...SHARED_TAGS, 'call'],
  },
  {
    key: 'qa',
    label: 'Qa',
    role: 'QA',
    roleAr: 'مختبر',
    prefix: 'qa',
    tags: [...SHARED_TAGS, 'all'],
  },
  {
    key: 'seniorManagement',
    label: 'SeniorManagement',
    role: 'SENIOR_MANAGEMENT',
    roleAr: 'الإدارة العليا',
    prefix: 's',
    tags: [...SHARED_TAGS, 'all'],
  },
] as const;

export type RoleKey = (typeof ROLE_MATRIX)[number]['key'];

export function displayName(label: string, tag: string) {
  if (tag === 'all' || tag === 'call') return `${label}All`;
  return `${label}${tag.toUpperCase()}`;
}

export function lastNameFor(tag: string) {
  const scope = SCOPE_TAGS[tag];
  if (!scope || scope.kind === 'all') return 'OrgWide';
  if (scope.kind === 'companies') {
    return scope.ids.length === 6 ? 'AllCompanies' : `Company${scope.ids.join('')}`;
  }
  return `Project${scope.ids.join('')}`;
}

export function scopeNote(tag: string) {
  const scope = SCOPE_TAGS[tag];
  if (!scope || scope.kind === 'all') return 'Org-wide — no company/system grants';
  if (scope.kind === 'companies') {
    if (scope.ids.length === 6) return 'All 6 companies (every project)';
    if (scope.ids.length === 1) {
      const [c] = scope.ids;
      return `Company${c} only (${projectsOfCompany(c).map((p) => `Project${p}`).join(' + ')})`;
    }
    return `Companies ${scope.ids.join(' + ')}`;
  }
  if (scope.ids.length === 1) {
    const p = scope.ids[0];
    return `Project${p} only (Company${companyOfProject(p)}, not sibling projects)`;
  }
  return `Projects ${scope.ids.join(' + ')} (cross-company)`;
}

export function loginAccounts() {
  return ROLE_MATRIX.flatMap((r) =>
    r.tags.map((tag) => ({
      key: `${r.role}_${String(tag).toUpperCase()}`,
      email: seedEmail(`${r.prefix}${tag}`),
      role: r.role,
      roleAr: r.roleAr,
      label: displayName(r.label, tag),
      lastName: lastNameFor(tag),
      note: scopeNote(tag),
    })),
  );
}
