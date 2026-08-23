import { describe, expect, it } from "vitest";
import {
  buildSystemsByCompany,
  companyCheckState,
  normalizeMembershipSelection,
  toggleCompany,
  toggleSystem,
  applyMembershipToUser,
} from "./membership";

const companies = [
  {
    id: "c1",
    name: "Company1",
    systems: [
      { id: "s1", name: "Project1" },
      { id: "s2", name: "Project2" },
    ],
  },
];

describe("membership", () => {
  it("normalizes whole-company selection", () => {
    expect(
      normalizeMembershipSelection(
        { companyIds: ["c1"], systemIds: ["s1"] },
        companies,
      ),
    ).toEqual({ companyIds: ["c1"], systemIds: [] });
  });

  it("reports indeterminate company state", () => {
    expect(
      companyCheckState(companies[0], { companyIds: [], systemIds: ["s1"] }),
    ).toBe("indeterminate");
  });

  it("selecting a company clears per-system rows", () => {
    const next = toggleCompany(
      companies[0],
      { companyIds: [], systemIds: ["s1"] },
      true,
    );
    expect(next).toEqual({ companyIds: ["c1"], systemIds: [] });
  });

  it("unchecking one system under a full company grant splits to systems", () => {
    const next = toggleSystem(
      companies[0],
      "s1",
      { companyIds: ["c1"], systemIds: [] },
      false,
      companies,
    );
    expect(next.companyIds).toEqual([]);
    expect(next.systemIds).toEqual(["s2"]);
  });

  it("applies membership onto a directory row for instant list updates", () => {
    const user = {
      id: "u1",
      company: null as { id: string; name: string } | null,
      companies: [] as { company: { id: string; name: string } }[],
      systems: [] as { system: { id: string; name: string; companyId: string; company: { id: string; name: string } } }[],
    };
    const next = applyMembershipToUser(
      user,
      { companyIds: ["c1"], systemIds: [] },
      companies,
      ["c1"],
    );
    expect(next.companies).toEqual([{ company: { id: "c1", name: "Company1" } }]);
    expect(next.company).toEqual({ id: "c1", name: "Company1" });
    expect(next.systems).toEqual([]);
  });

  it("keeps grants outside the PM portfolio when applying a patch", () => {
    const user = {
      companies: [
        { company: { id: "c1", name: "Company1" } },
        { company: { id: "c2", name: "Company2" } },
      ],
      systems: [],
    };
    const next = applyMembershipToUser(
      user,
      { companyIds: [], systemIds: ["s1"] },
      companies,
      ["c1"],
    );
    expect(next.companies).toEqual([{ company: { id: "c2", name: "Company2" } }]);
    expect(next.systems).toEqual([
      {
        system: {
          id: "s1",
          name: "Project1",
          companyId: "c1",
          company: { id: "c1", name: "Company1" },
        },
      },
    ]);
  });
});
