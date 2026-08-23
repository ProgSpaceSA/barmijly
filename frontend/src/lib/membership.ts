export type CompanyWithSystems = {
  id: string;
  name: string;
  systems: { id: string; name: string }[];
};

export type MembershipSelection = {
  companyIds: string[];
  systemIds: string[];
};

export function buildSystemsByCompany(
  companies: CompanyWithSystems[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of companies) {
    map.set(c.id, c.systems.map((s) => s.id));
  }
  return map;
}

export function normalizeMembershipSelection(
  selection: MembershipSelection,
  companies: CompanyWithSystems[],
): MembershipSelection {
  const systemsByCompany = buildSystemsByCompany(companies);
  const companySet = new Set(selection.companyIds);
  const systemSet = new Set(selection.systemIds);

  for (const cid of companySet) {
    for (const sid of systemsByCompany.get(cid) ?? []) {
      systemSet.delete(sid);
    }
  }

  return { companyIds: [...companySet], systemIds: [...systemSet] };
}

export function membershipFromUser(user: {
  companies?: { company: { id: string } }[];
  systems?: { system: { id: string; companyId?: string } }[];
}): MembershipSelection {
  const companyIds = user.companies?.map((c) => c.company.id) ?? [];
  const companySet = new Set(companyIds);
  const systemIds =
    user.systems
      ?.map((s) => s.system.id)
      .filter((sid) => {
        const row = user.systems?.find((x) => x.system.id === sid);
        return row ? !companySet.has(row.system.companyId ?? '') : true;
      }) ?? [];
  return { companyIds, systemIds };
}

export function companyCheckState(
  company: CompanyWithSystems,
  selection: MembershipSelection,
): 'checked' | 'indeterminate' | 'unchecked' {
  if (selection.companyIds.includes(company.id)) return 'checked';
  const selected = company.systems.filter((s) => selection.systemIds.includes(s.id));
  if (selected.length === 0) return 'unchecked';
  if (selected.length === company.systems.length) return 'checked';
  return 'indeterminate';
}

export function isSystemChecked(companyId: string, systemId: string, selection: MembershipSelection) {
  return selection.companyIds.includes(companyId) || selection.systemIds.includes(systemId);
}

export function toggleCompany(
  company: CompanyWithSystems,
  selection: MembershipSelection,
  checked: boolean,
): MembershipSelection {
  const companyIds = new Set(selection.companyIds);
  const systemIds = new Set(selection.systemIds);
  const systemList = company.systems.map((s) => s.id);

  if (checked) {
    companyIds.add(company.id);
    for (const sid of systemList) systemIds.delete(sid);
  } else {
    companyIds.delete(company.id);
    for (const sid of systemList) systemIds.delete(sid);
  }

  return normalizeMembershipSelection(
    { companyIds: [...companyIds], systemIds: [...systemIds] },
    [company],
  );
}

export function toggleSystem(
  company: CompanyWithSystems,
  systemId: string,
  selection: MembershipSelection,
  checked: boolean,
  allCompanies: CompanyWithSystems[],
): MembershipSelection {
  let companyIds = [...selection.companyIds];
  const systemIds = new Set(selection.systemIds);

  if (selection.companyIds.includes(company.id)) {
    companyIds = companyIds.filter((id) => id !== company.id);
    for (const s of company.systems) {
      if (s.id !== systemId) systemIds.add(s.id);
    }
  }

  if (checked) systemIds.add(systemId);
  else systemIds.delete(systemId);

  return normalizeMembershipSelection(
    { companyIds, systemIds: [...systemIds] },
    allCompanies,
  );
}

export function filterCompaniesByScope(
  companies: CompanyWithSystems[],
  visibleCompanyIds: string[] | null | undefined,
): CompanyWithSystems[] {
  if (!visibleCompanyIds) return companies;
  return companies.filter((c) => visibleCompanyIds.includes(c.id));
}

type DirectoryUser = {
  company?: { id: string; name: string } | null;
  companies?: { company: { id: string; name: string } }[];
  systems?: {
    system: {
      id: string;
      name: string;
      companyId?: string;
      company?: { id: string; name: string };
    };
  }[];
};

/**
 * Apply a saved membership tree onto a directory row for instant UI update.
 * Grants for companies outside `portfolioCompanyIds` (or outside `tree` when
 * portfolio is null) are kept — matching backend `mergeMembershipGrants`.
 */
export function applyMembershipToUser<T extends DirectoryUser>(
  user: T,
  selection: MembershipSelection,
  tree: CompanyWithSystems[],
  portfolioCompanyIds?: string[] | null,
): T {
  const normalized = normalizeMembershipSelection(selection, tree);
  const editable = new Set(
    portfolioCompanyIds && portfolioCompanyIds.length > 0
      ? portfolioCompanyIds
      : tree.map((c) => c.id),
  );

  const keptCompanies = (user.companies ?? []).filter((uc) => !editable.has(uc.company.id));
  const keptSystems = (user.systems ?? []).filter((us) => {
    const cid = us.system.companyId ?? us.system.company?.id;
    return !cid || !editable.has(cid);
  });

  const selectedCompanies = tree
    .filter((c) => normalized.companyIds.includes(c.id))
    .map((c) => ({ company: { id: c.id, name: c.name } }));

  const selectedSystems = tree.flatMap((c) =>
    c.systems
      .filter((s) => normalized.systemIds.includes(s.id))
      .map((s) => ({
        system: {
          id: s.id,
          name: s.name,
          companyId: c.id,
          company: { id: c.id, name: c.name },
        },
      })),
  );

  const companies = [...keptCompanies, ...selectedCompanies];
  const systems = [...keptSystems, ...selectedSystems];
  const primary =
    companies[0]?.company ??
    (systems[0]?.system.company
      ? { id: systems[0].system.company.id, name: systems[0].system.company.name }
      : null);

  return {
    ...user,
    company: primary,
    companies,
    systems,
  };
}
