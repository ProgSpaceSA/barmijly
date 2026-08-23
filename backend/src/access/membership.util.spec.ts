import {
  buildSystemsByCompany,
  mergeMembershipGrants,
  normalizeMembershipGrants,
} from './membership.util';

describe('membership.util', () => {
  const systemsByCompany = buildSystemsByCompany([
    { id: 's1', companyId: 'c1' },
    { id: 's2', companyId: 'c1' },
    { id: 's3', companyId: 'c2' },
  ]);

  it('drops per-system rows covered by a whole-company grant', () => {
    expect(
      normalizeMembershipGrants(['c1'], ['s1', 's2'], systemsByCompany),
    ).toEqual({ companyIds: ['c1'], systemIds: [] });
  });

  it('keeps partial system grants when the company is not granted', () => {
    expect(normalizeMembershipGrants([], ['s1'], systemsByCompany)).toEqual({
      companyIds: [],
      systemIds: ['s1'],
    });
  });

  it('merges a PM patch without touching grants outside the portfolio', () => {
    const merged = mergeMembershipGrants(
      { companyIds: ['c2'], systemIds: ['s3'] },
      { companyIds: ['c1'], systemIds: [] },
      ['c1'],
      ['s1', 's2'],
      systemsByCompany,
    );
    expect(merged).toEqual({ companyIds: ['c2', 'c1'], systemIds: [] });
  });
});
