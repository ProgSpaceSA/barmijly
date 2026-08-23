export interface MembershipGrants {
  companyIds: string[];
  systemIds: string[];
}

/** companyId → system ids under it (for normalizing grants). */
export type SystemsByCompany = Map<string, string[]>;

export function buildSystemsByCompany(
  systems: { id: string; companyId: string }[],
): SystemsByCompany {
  const map: SystemsByCompany = new Map();
  for (const s of systems) {
    const list = map.get(s.companyId) ?? [];
    list.push(s.id);
    map.set(s.companyId, list);
  }
  return map;
}

/**
 * Whole-company grants win over per-system rows for the same company.
 * Stored shape matches invite: UserCompany and/or UserSystem, never both
 * for systems already covered by a company grant.
 */
export function normalizeMembershipGrants(
  companyIds: string[],
  systemIds: string[],
  systemsByCompany: SystemsByCompany,
): MembershipGrants {
  const companies = new Set(companyIds);
  const systems = new Set(systemIds);

  for (const cid of companies) {
    for (const sid of systemsByCompany.get(cid) ?? []) {
      systems.delete(sid);
    }
  }

  return { companyIds: [...companies], systemIds: [...systems] };
}

/**
 * PM membership edits replace grants inside the editable slice only; grants
 * outside the portfolio stay untouched.
 */
export function mergeMembershipGrants(
  existing: MembershipGrants,
  patch: MembershipGrants,
  editableCompanyIds: string[] | null,
  editableSystemIds: string[] | null,
  systemsByCompany: SystemsByCompany,
): MembershipGrants {
  const companyScope = editableCompanyIds
    ? new Set(editableCompanyIds)
    : new Set([...systemsByCompany.keys()]);

  const systemScope = new Set<string>();
  if (editableSystemIds === null) {
    for (const ids of systemsByCompany.values()) {
      for (const id of ids) systemScope.add(id);
    }
  } else {
    for (const sid of editableSystemIds) systemScope.add(sid);
    // A visible company implies every system under it is in the editable slice.
    for (const cid of companyScope) {
      for (const sid of systemsByCompany.get(cid) ?? []) {
        systemScope.add(sid);
      }
    }
  }

  const keptCompanies = existing.companyIds.filter((cid) => !companyScope.has(cid));
  const keptSystems = existing.systemIds.filter((sid) => !systemScope.has(sid));

  const normalized = normalizeMembershipGrants(
    patch.companyIds.filter((cid) => companyScope.has(cid)),
    patch.systemIds.filter((sid) => systemScope.has(sid)),
    systemsByCompany,
  );

  return normalizeMembershipGrants(
    [...keptCompanies, ...normalized.companyIds],
    [...keptSystems, ...normalized.systemIds],
    systemsByCompany,
  );
}
