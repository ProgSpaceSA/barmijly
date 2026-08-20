/**
 * Aggressive critical-path e2e against the seeded company × project matrix.
 *
 * Requires a database that has been seeded (`npm run db:seed`). Logins, ticket
 * lists, detail, comments, companies/systems, reports, admin routes, and a
 * full lifecycle are exercised with as many seeded accounts as possible.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { SEED_PASSWORD, seedEmail } from '../prisma/seed-matrix';
import { createE2eApp } from './create-e2e-app';

const LIMIT = 200;

type Session = { token: string; id: string; role: string; firstName: string };
type TicketRow = {
  id: string;
  title: string;
  status: string;
  company?: { name: string };
  system?: { name: string };
  comments?: Array<{ visibility: string; content: string }>;
};

function marker(title: string) {
  const m = title.match(/^\[C(\d+)\/P(\d+)\]/);
  return m ? { company: Number(m[1]), project: Number(m[2]) } : null;
}

function companiesOf(rows: TicketRow[]) {
  return [...new Set(rows.map((t) => marker(t.title)?.company).filter((n): n is number => !!n))].sort((a, b) => a - b);
}

function projectsOf(rows: TicketRow[]) {
  return [...new Set(rows.map((t) => marker(t.title)?.project).filter((n): n is number => !!n))].sort((a, b) => a - b);
}

describe('seed matrix — critical paths', () => {
  let app: INestApplication<App>;
  const sessions = new Map<string, Session>();

  const http = () => request(app.getHttpServer());

  async function login(plus: string): Promise<Session> {
    const cached = sessions.get(plus);
    if (cached) return cached;
    const res = await http()
      .post('/auth/login')
      .send({ email: seedEmail(plus), password: SEED_PASSWORD });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const session: Session = {
      token: res.body.access_token,
      id: res.body.user.id,
      role: res.body.user.role,
      firstName: res.body.user.firstName,
    };
    expect(session.token).toBeTruthy();
    sessions.set(plus, session);
    return session;
  }

  function auth(plus: string) {
    const session = sessions.get(plus);
    if (!session) throw new Error(`not logged in: ${plus}`);
    return { Authorization: `Bearer ${session.token}` };
  }

  async function listTickets(plus: string, query: Record<string, string> = {}) {
    const res = await http().get('/tickets').query({ limit: String(LIMIT), ...query }).set(auth(plus));
    expect(res.status).toBe(200);
    return res.body.data as TicketRow[];
  }

  async function getTicket(plus: string, id: string) {
    return http().get(`/tickets/${id}`).set(auth(plus));
  }

  beforeAll(async () => {
    app = await createE2eApp();

    const pluses = [
      'rc1', 'rc2', 'rc6', 'rc12', 'rc123', 'rc456', 'rp1', 'rp2', 'rp13', 'rcall',
      'oc1', 'oc2', 'oc6', 'oc12', 'oc123', 'oc456', 'op1', 'op2', 'op13', 'ocall',
      'hc1', 'hc2', 'hc6', 'hc12', 'hc123', 'hc456', 'hp1', 'hp2', 'hp13', 'hall',
      'pmc1', 'pmc2', 'pmc6', 'pmc12', 'pmc123', 'pmc456', 'pmp1', 'pmp2', 'pmp13', 'pmall',
      'dc1', 'dc2', 'dc6', 'dc12', 'dc123', 'dc456', 'dp1', 'dp2', 'dp13', 'dcall',
      'qac1', 'qac2', 'qac6', 'qac12', 'qac123', 'qac456', 'qap1', 'qap2', 'qap13', 'qaall',
      'sc1', 'sc2', 'sc6', 'sc12', 'sc123', 'sc456', 'sp1', 'sp2', 'sp13', 'sall',
    ];
    for (const plus of pluses) {
      await login(plus);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('login', () => {
    it('rejects the inactive developer', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: seedEmail('dinactive'), password: SEED_PASSWORD });
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: seedEmail('oc1'), password: 'wrong-password' });
      expect(res.status).toBe(401);
    });

    it('returns /auth/me for SystemOwnerC1', async () => {
      const res = await http().get('/auth/me').set(auth('oc1'));
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('SYSTEM_OWNER');
      expect(res.body.firstName).toBe('SystemOwnerC1');
    });
  });

  describe('ticket list scope', () => {
    const cases: Array<{ plus: string; companies: number[]; projects: number[]; createdOnly?: boolean }> = [
      { plus: 'oc1', companies: [1], projects: [1, 2] },
      { plus: 'oc2', companies: [2], projects: [3, 4] },
      { plus: 'oc6', companies: [6], projects: [11, 12] },
      { plus: 'oc12', companies: [1, 2], projects: [1, 2, 3, 4] },
      { plus: 'oc123', companies: [1, 2, 3], projects: [1, 2, 3, 4, 5, 6] },
      { plus: 'oc456', companies: [4, 5, 6], projects: [7, 8, 9, 10, 11, 12] },
      { plus: 'op1', companies: [1], projects: [1] },
      { plus: 'op2', companies: [1], projects: [2] },
      { plus: 'op13', companies: [1, 2], projects: [1, 3] },
      { plus: 'ocall', companies: [1, 2, 3, 4, 5, 6], projects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { plus: 'dc1', companies: [1], projects: [1, 2] },
      { plus: 'dp1', companies: [1], projects: [1] },
      { plus: 'dp2', companies: [1], projects: [2] },
      { plus: 'dp13', companies: [1, 2], projects: [1, 3] },
      { plus: 'dc123', companies: [1, 2, 3], projects: [1, 2, 3, 4, 5, 6] },
      { plus: 'dc456', companies: [4, 5, 6], projects: [7, 8, 9, 10, 11, 12] },
      { plus: 'dcall', companies: [1, 2, 3, 4, 5, 6], projects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { plus: 'hc1', companies: [1], projects: [1, 2] },
      { plus: 'hp1', companies: [1], projects: [1] },
      { plus: 'hp13', companies: [1, 2], projects: [1, 3] },
      { plus: 'hc123', companies: [1, 2, 3], projects: [1, 2, 3, 4, 5, 6] },
      { plus: 'hc456', companies: [4, 5, 6], projects: [7, 8, 9, 10, 11, 12] },
      { plus: 'hall', companies: [1, 2, 3, 4, 5, 6], projects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { plus: 'pmc1', companies: [1], projects: [1, 2] },
      { plus: 'pmp1', companies: [1], projects: [1] },
      { plus: 'pmc12', companies: [1, 2], projects: [1, 2, 3, 4] },
      { plus: 'pmc456', companies: [4, 5, 6], projects: [7, 8, 9, 10, 11, 12] },
      { plus: 'pmall', companies: [1, 2, 3, 4, 5, 6], projects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { plus: 'qac1', companies: [1], projects: [1, 2] },
      { plus: 'qap1', companies: [1], projects: [1] },
      { plus: 'qap13', companies: [1, 2], projects: [1, 3] },
      { plus: 'qaall', companies: [1, 2, 3, 4, 5, 6], projects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { plus: 'sc1', companies: [1], projects: [1, 2] },
      { plus: 'sp1', companies: [1], projects: [1] },
      { plus: 'sall', companies: [1, 2, 3, 4, 5, 6], projects: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    ];

    it.each(cases)('$plus sees companies $companies / projects $projects', async ({ plus, companies, projects }) => {
      const rows = await listTickets(plus);
      expect(rows.length).toBeGreaterThan(0);
      expect(companiesOf(rows)).toEqual(companies);
      expect(projectsOf(rows)).toEqual(projects);
    });

    it('TicketRequesterC1 sees only tickets they created, all on Company1', async () => {
      const rows = await listTickets('rc1');
      const me = sessions.get('rc1')!;
      expect(rows.length).toBeGreaterThan(0);
      expect(companiesOf(rows)).toEqual([1]);
      for (const row of rows) {
        const detail = await getTicket('rc1', row.id);
        expect(detail.status).toBe(200);
        expect(detail.body.creatorId ?? detail.body.creator?.id).toBe(me.id);
      }
    });

    it('TicketRequesterC2 does not see Company1 tickets', async () => {
      const rows = await listTickets('rc2');
      expect(companiesOf(rows)).toEqual([2]);
      expect(projectsOf(rows)).toEqual([3, 4]);
    });

    it('TicketRequesterP1 sees only the ticket they filed on Project1', async () => {
      const rows = await listTickets('rp1');
      expect(rows.length).toBeGreaterThan(0);
      expect(projectsOf(rows)).toEqual([1]);
      expect(rows.every((t) => t.title.includes('TicketRequesterP1'))).toBe(true);
    });

    it('TicketRequesterP2 / P13 / All have no seeded tickets of their own', async () => {
      expect(await listTickets('rp2')).toEqual([]);
      expect(await listTickets('rp13')).toEqual([]);
      expect(await listTickets('rcall')).toEqual([]);
    });

    it('SystemOwnerP1 must not see Project2 in the same company', async () => {
      const rows = await listTickets('op1');
      expect(projectsOf(rows)).toEqual([1]);
      expect(rows.some((t) => t.title.includes('[C1/P2]'))).toBe(false);
    });

    it('SystemOwnerP2 must not see Project1 in the same company', async () => {
      const rows = await listTickets('op2');
      expect(projectsOf(rows)).toEqual([2]);
      expect(rows.some((t) => t.title.includes('[C1/P1]'))).toBe(false);
    });
  });

  describe('ticket detail 200 / 403', () => {
    let p1: TicketRow;
    let p2: TicketRow;
    let p12: TicketRow;

    beforeAll(async () => {
      const hall = await listTickets('hall');
      p1 = hall.find((t) => t.title.includes('[C1/P1][IN_PROGRESS]'))!;
      p2 = hall.find((t) => t.title.includes('[C1/P2][IN_PROGRESS]'))!;
      p12 = hall.find((t) => t.title.includes('[C6/P12][IN_PROGRESS]'))!;
      expect(p1 && p2 && p12).toBeTruthy();
    });

    const allowedP1 = ['oc1', 'op1', 'op13', 'ocall', 'dc1', 'dp1', 'dp13', 'hc1', 'hp1', 'hall', 'pmc1', 'pmp1', 'qac1', 'qap1', 'sc1', 'sall', 'rc1'];
    const deniedP1 = ['oc2', 'op2', 'oc6', 'oc456', 'dc2', 'dp2', 'dc6', 'dc456', 'hc2', 'hp2', 'hc456', 'pmc2', 'pmc456', 'qac2', 'qac456', 'sc2', 'rc2', 'rc6'];

    it.each(allowedP1)('%s can open the Project1 in-progress ticket', async (plus) => {
      expect((await getTicket(plus, p1.id)).status).toBe(200);
    });

    it.each(deniedP1)('%s is forbidden from the Project1 in-progress ticket', async (plus) => {
      expect((await getTicket(plus, p1.id)).status).toBe(403);
    });

    it('SystemOwnerP1 is forbidden from Project2', async () => {
      expect((await getTicket('op1', p2.id)).status).toBe(403);
    });

    it('SystemOwnerP2 can open Project2 and not Project1', async () => {
      expect((await getTicket('op2', p2.id)).status).toBe(200);
      expect((await getTicket('op2', p1.id)).status).toBe(403);
    });

    it('SystemOwnerC1 can open both Project1 and Project2', async () => {
      expect((await getTicket('oc1', p1.id)).status).toBe(200);
      expect((await getTicket('oc1', p2.id)).status).toBe(200);
    });

    it('nobody scoped to Company1 can open a Company6 ticket', async () => {
      for (const plus of ['oc1', 'op1', 'dc1', 'dp1', 'hc1', 'pmc1', 'qac1', 'sc1', 'rc1']) {
        expect((await getTicket(plus, p12.id)).status).toBe(403);
      }
    });

    it('Company6 accounts can open Project12', async () => {
      for (const plus of ['oc6', 'dc6', 'hc6', 'pmc6', 'qac6', 'ocall', 'hall', 'pmall']) {
        expect((await getTicket(plus, p12.id)).status).toBe(200);
      }
    });
  });

  describe('internal comments hidden from business roles', () => {
    let p1: TicketRow;

    beforeAll(async () => {
      const rows = await listTickets('hall');
      p1 = rows.find((t) => t.title.includes('[C1/P1][IN_PROGRESS]'))!;
    });

    it('TicketRequesterC1 sees PUBLIC comments only', async () => {
      const res = await getTicket('rc1', p1.id);
      expect(res.status).toBe(200);
      const vis = (res.body.comments as TicketRow['comments'])!.map((c) => c.visibility);
      expect(vis.length).toBeGreaterThan(0);
      expect(vis.every((v) => v === 'PUBLIC')).toBe(true);
      expect(vis).not.toContain('INTERNAL');
    });

    it('SystemOwnerC1 also cannot read INTERNAL comments', async () => {
      const res = await getTicket('oc1', p1.id);
      expect(res.status).toBe(200);
      const vis = (res.body.comments as TicketRow['comments'])!.map((c) => c.visibility);
      expect(vis).not.toContain('INTERNAL');
    });

    it.each(['dc1', 'qac1', 'pmc1', 'hc1', 'hall'])('%s can read INTERNAL comments', async (plus) => {
      const res = await getTicket(plus, p1.id);
      expect(res.status).toBe(200);
      const vis = (res.body.comments as TicketRow['comments'])!.map((c) => c.visibility);
      expect(vis).toContain('INTERNAL');
    });

    it('SystemOwner cannot post an INTERNAL comment', async () => {
      const res = await http()
        .post(`/tickets/${p1.id}/comments`)
        .set(auth('oc1'))
        .send({ content: 'should fail', visibility: 'INTERNAL' });
      expect(res.status).toBe(403);
    });

    it('TicketRequester cannot post an INTERNAL comment', async () => {
      const res = await http()
        .post(`/tickets/${p1.id}/comments`)
        .set(auth('rc1'))
        .send({ content: 'should fail', visibility: 'INTERNAL' });
      expect(res.status).toBe(403);
    });

    it('out-of-scope developer cannot comment on Project1', async () => {
      const res = await http()
        .post(`/tickets/${p1.id}/comments`)
        .set(auth('dc6'))
        .send({ content: 'leak', visibility: 'PUBLIC' });
      expect(res.status).toBe(403);
    });
  });

  describe('companies and systems', () => {
    it('SystemOwnerC1 lists only Company1 with both projects', async () => {
      const res = await http().get('/companies').set(auth('oc1'));
      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Company1']);
      const systems = res.body[0].systems.map((s: { name: string }) => s.name).sort();
      expect(systems).toEqual(['Project1', 'Project1Legacy', 'Project2']);
    });

    it('SystemOwnerP1 lists Company1 but only Project1', async () => {
      const res = await http().get('/companies').set(auth('op1'));
      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Company1']);
      expect(res.body[0].systems.map((s: { name: string }) => s.name)).toEqual(['Project1']);
    });

    it('SystemOwnerP13 lists systems Project1 and Project3', async () => {
      const res = await http().get('/systems').set(auth('op13'));
      expect(res.status).toBe(200);
      expect(res.body.map((s: { name: string }) => s.name).sort()).toEqual(['Project1', 'Project3']);
    });

    it('ProgrammingHeadAll lists all six companies', async () => {
      const res = await http().get('/companies').set(auth('hall'));
      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name)).toEqual([
        'Company1', 'Company2', 'Company3', 'Company4', 'Company5', 'Company6',
      ]);
    });

    it('ProgrammingHeadC456 lists only companies 4–6', async () => {
      const res = await http().get('/companies').set(auth('hc456'));
      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Company4', 'Company5', 'Company6']);
    });

    it('SystemOwnerC1 cannot open Company6 by id', async () => {
      const all = await http().get('/companies').set(auth('hall'));
      const c6 = all.body.find((c: { name: string }) => c.name === 'Company6');
      const res = await http().get(`/companies/${c6.id}`).set(auth('oc1'));
      expect(res.status).toBe(403);
    });

    it('TicketRequesterC1 lists Company1 only', async () => {
      const res = await http().get('/companies').set(auth('rc1'));
      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Company1']);
    });
  });

  describe('admin and reports gates', () => {
    it.each(['rc1', 'oc1', 'dc1', 'qac1'])('%s cannot list users', async (plus) => {
      expect((await http().get('/users').set(auth(plus))).status).toBe(403);
    });

    it.each(['pmc1', 'hc1', 'hall', 'sall'])('%s can list users', async (plus) => {
      expect((await http().get('/users').set(auth(plus))).status).toBe(200);
    });

    it.each(['rc1', 'oc1', 'dc1', 'qac1'])('%s cannot list invitations or signup requests', async (plus) => {
      expect((await http().get('/invitations').set(auth(plus))).status).toBe(403);
      expect((await http().get('/signup-requests').set(auth(plus))).status).toBe(403);
    });

    it.each(['pmc1', 'hall'])('%s can list invitations and signup requests', async (plus) => {
      expect((await http().get('/invitations').set(auth(plus))).status).toBe(200);
      expect((await http().get('/signup-requests').set(auth(plus))).status).toBe(200);
    });

    it.each(['rc1', 'oc1', 'dc1', 'qac1', 'pmc1', 'hall', 'sall'])('%s can read the personal dashboard', async (plus) => {
      const res = await http().get('/reports/dashboard').set(auth(plus));
      expect(res.status).toBe(200);
      expect(typeof res.body.totalTickets).toBe('number');
    });

    it('SystemOwnerC1 dashboard is smaller than org-wide head', async () => {
      const owner = await http().get('/reports/dashboard').set(auth('oc1'));
      const head = await http().get('/reports/dashboard').set(auth('hall'));
      expect(owner.body.totalTickets).toBeGreaterThan(0);
      expect(head.body.totalTickets).toBeGreaterThan(owner.body.totalTickets);
    });

    it.each(['rc1', 'oc1', 'dc1', 'qac1'])('%s cannot read team reports', async (plus) => {
      expect((await http().get('/reports/developers').set(auth(plus))).status).toBe(403);
      expect((await http().get('/reports/companies').set(auth(plus))).status).toBe(403);
    });

    it.each(['pmc1', 'hall', 'sall'])('%s can read team reports', async (plus) => {
      expect((await http().get('/reports/developers').set(auth(plus))).status).toBe(200);
      expect((await http().get('/reports/companies').set(auth(plus))).status).toBe(200);
      expect((await http().get('/reports/systems').set(auth(plus))).status).toBe(200);
    });

    it('archived list is denied to requester and owner, allowed to PM', async () => {
      const requester = await http().get('/tickets').query({ limit: '200', isArchived: 'true' }).set(auth('rc1'));
      expect(requester.status).toBe(200);
      expect(requester.body.data.every((t: TicketRow) => !t.title.includes('مؤرشف'))).toBe(true);

      const owner = await http().get('/tickets').query({ limit: '200', isArchived: 'true' }).set(auth('oc1'));
      expect(owner.body.data.every((t: TicketRow) => !t.title.includes('مؤرشف'))).toBe(true);

      const pm = await http().get('/tickets').query({ limit: '200', isArchived: 'true' }).set(auth('pmc1'));
      expect(pm.status).toBe(200);
      expect(pm.body.data.some((t: TicketRow) => t.title.includes('مؤرشف'))).toBe(true);
      expect(companiesOf(pm.body.data)).toEqual([1]);
    });

    it('ProgrammingHeadAll has a large notification inbox', async () => {
      const res = await http().get('/notifications').query({ limit: '50' }).set(auth('hall'));
      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(40);
    });
  });

  describe('role actions on a seeded NEW ticket', () => {
    let p1New: TicketRow;

    beforeAll(async () => {
      const rows = await listTickets('hall');
      p1New = rows.find((t) => t.title.includes('[C1/P1][NEW]') && !t.title.includes('TicketRequesterP1'))!;
      expect(p1New).toBeTruthy();
    });

    it('SystemOwner cannot approve', async () => {
      const res = await http()
        .patch(`/tickets/${p1New.id}/approve`)
        .set(auth('oc1'))
        .send({ decision: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    it('ProjectManager cannot approve (head only)', async () => {
      const res = await http()
        .patch(`/tickets/${p1New.id}/approve`)
        .set(auth('pmc1'))
        .send({ decision: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    it('ProgrammingHeadC2 cannot approve a Company1 ticket (out of scope)', async () => {
      const res = await http()
        .patch(`/tickets/${p1New.id}/approve`)
        .set(auth('hc2'))
        .send({ decision: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    it('Developer cannot assign', async () => {
      const res = await http()
        .patch(`/tickets/${p1New.id}/assign`)
        .set(auth('dc1'))
        .send({ developerId: sessions.get('dc1')!.id, estimatedDeadline: '2027-01-01' });
      expect(res.status).toBe(403);
    });
  });

  describe('full lifecycle on a fresh Project1 ticket', () => {
    let company1: { id: string; systems: Array<{ id: string; name: string }> };
    let company2: { id: string; systems: Array<{ id: string; name: string }> };
    let project1: string;
    let project3: string;
    let ticketId: string;

    beforeAll(async () => {
      const companies = (await http().get('/companies').set(auth('hall'))).body;
      company1 = companies.find((c: { name: string }) => c.name === 'Company1');
      company2 = companies.find((c: { name: string }) => c.name === 'Company2');
      project1 = company1.systems.find((s) => s.name === 'Project1')!.id;
      project3 = company2.systems.find((s) => s.name === 'Project3')!.id;
    });

    it('SystemOwnerP1 cannot file against Project2 / Company2', async () => {
      const p2 = company1.systems.find((s) => s.name === 'Project2')!.id;
      const wrongProject = await http()
        .post('/tickets')
        .set(auth('op1'))
        .send({
          title: '[E2E] owner p1 on p2',
          description: 'should fail',
          type: 'MODIFICATION',
          systemId: p2,
          companyId: company1.id,
        });
      expect(wrongProject.status).toBe(403);

      const wrongCompany = await http()
        .post('/tickets')
        .set(auth('op1'))
        .send({
          title: '[E2E] owner p1 on c2',
          description: 'should fail',
          type: 'MODIFICATION',
          systemId: project3,
          companyId: company2.id,
        });
      expect(wrongCompany.status).toBe(403);
    });

    it('TicketRequesterC2 cannot file against Company1', async () => {
      const res = await http()
        .post('/tickets')
        .set(auth('rc2'))
        .send({
          title: '[E2E] requester c2 on c1',
          description: 'should fail',
          type: 'MODIFICATION',
          systemId: project1,
          companyId: company1.id,
        });
      expect(res.status).toBe(403);
    });

    it('walks DRAFT → CLOSED with the right roles, and blocks the wrong ones at each step', async () => {
      const created = await http()
        .post('/tickets')
        .set(auth('rc1'))
        .send({
          title: `[E2E] lifecycle ${Date.now()}`,
          description: 'critical path',
          type: 'MODIFICATION',
          systemId: project1,
          companyId: company1.id,
        });
      expect(created.status).toBeGreaterThanOrEqual(200);
      expect(created.status).toBeLessThan(300);
      expect(created.body.status).toBe('DRAFT');
      ticketId = created.body.id;

      expect((await http().patch(`/tickets/${ticketId}/submit`).set(auth('rc2'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/submit`).set(auth('rc1'))).status).toBeLessThan(300);

      const afterSubmit = await getTicket('rc1', ticketId);
      expect(afterSubmit.body.status).toBe('NEW');

      expect(
        (await http().patch(`/tickets/${ticketId}/approve`).set(auth('oc1')).send({ decision: 'APPROVED' })).status,
      ).toBe(403);
      expect(
        (await http().patch(`/tickets/${ticketId}/approve`).set(auth('hc2')).send({ decision: 'APPROVED' })).status,
      ).toBe(403);
      expect(
        (await http().patch(`/tickets/${ticketId}/approve`).set(auth('hc1')).send({ decision: 'APPROVED', notes: 'go' }))
          .status,
      ).toBeLessThan(300);
      expect((await getTicket('hc1', ticketId)).body.status).toBe('APPROVED');

      const p2Dev = sessions.get('dp2')!.id;
      const c1Dev = sessions.get('dc1')!.id;
      const deadline = new Date(Date.now() + 7 * 86400000).toISOString();

      expect(
        (await http()
          .patch(`/tickets/${ticketId}/assign`)
          .set(auth('pmc2'))
          .send({ developerId: c1Dev, estimatedDeadline: deadline })).status,
      ).toBe(403);
      expect(
        (await http()
          .patch(`/tickets/${ticketId}/assign`)
          .set(auth('pmc1'))
          .send({ developerId: p2Dev, estimatedDeadline: deadline })).status,
      ).toBe(403);
      expect(
        (await http()
          .patch(`/tickets/${ticketId}/assign`)
          .set(auth('pmc1'))
          .send({ developerId: c1Dev, estimatedDeadline: deadline })).status,
      ).toBeLessThan(300);
      expect((await getTicket('dc1', ticketId)).body.status).toBe('SCHEDULED');

      expect((await http().patch(`/tickets/${ticketId}/start`).set(auth('dp2'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/start`).set(auth('dc6'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/start`).set(auth('dc1'))).status).toBeLessThan(300);
      expect((await getTicket('dc1', ticketId)).body.status).toBe('IN_PROGRESS');

      expect((await http().patch(`/tickets/${ticketId}/submit-for-testing`).set(auth('dc2'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/submit-for-testing`).set(auth('dc1'))).status).toBeLessThan(300);
      expect((await getTicket('qac1', ticketId)).body.status).toBe('AWAITING_TESTING');

      expect((await http().patch(`/tickets/${ticketId}/approve-completion`).set(auth('qac2'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/approve-completion`).set(auth('oc1'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/approve-completion`).set(auth('dc1'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/approve-completion`).set(auth('qac1'))).status).toBeLessThan(300);
      expect((await getTicket('oc1', ticketId)).body.status).toBe('AWAITING_OWNER_APPROVAL');

      expect((await http().patch(`/tickets/${ticketId}/approve-completion`).set(auth('op2'))).status).toBe(403);
      expect((await http().patch(`/tickets/${ticketId}/approve-completion`).set(auth('oc1'))).status).toBeLessThan(300);
      expect((await getTicket('rc1', ticketId)).body.status).toBe('COMPLETED');

      expect(
        (await http().patch(`/tickets/${ticketId}/close`).set(auth('dc1')).send({ closureNotes: 'nope' })).status,
      ).toBe(403);
      expect(
        (await http().patch(`/tickets/${ticketId}/close`).set(auth('pmc2')).send({ closureNotes: 'nope' })).status,
      ).toBe(403);
      expect(
        (await http().patch(`/tickets/${ticketId}/close`).set(auth('pmc1')).send({ closureNotes: 'تم الإغلاق من اختبار المسار.' }))
          .status,
      ).toBeLessThan(300);
      expect((await getTicket('pmc1', ticketId)).body.status).toBe('CLOSED');

      const internal = await http()
        .post(`/tickets/${ticketId}/comments`)
        .set(auth('dc1'))
        .send({ content: 'ملاحظة داخلية من المسار', visibility: 'INTERNAL' });
      expect(internal.status).toBeLessThan(300);

      const asRequester = await getTicket('rc1', ticketId);
      expect(asRequester.body.comments.every((c: { visibility: string }) => c.visibility === 'PUBLIC')).toBe(true);

      const asDev = await getTicket('dc1', ticketId);
      expect(asDev.body.comments.some((c: { visibility: string }) => c.visibility === 'INTERNAL')).toBe(true);
    });
  });
});
