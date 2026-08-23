"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  type CompanyWithSystems,
  type MembershipSelection,
  companyCheckState,
  isSystemChecked,
  toggleCompany,
  toggleSystem,
  filterCompaniesByScope,
} from "@/lib/membership";

export function CompanyProjectTree({
  companies,
  value,
  onChange,
  visibleCompanyIds,
  maxHeight = "max-h-48",
}: {
  companies: CompanyWithSystems[];
  value: MembershipSelection;
  onChange: (value: MembershipSelection) => void;
  visibleCompanyIds?: string[] | null;
  maxHeight?: string;
}) {
  const scoped = useMemo(
    () => filterCompaniesByScope(companies, visibleCompanyIds),
    [companies, visibleCompanyIds],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (scoped.length === 0) {
    return (
      <p className="text-xs px-2 py-3" style={{ color: "var(--muted-foreground)" }}>
        لا توجد شركات متاحة
      </p>
    );
  }

  return (
    <div
      className={`rounded-xl p-2 space-y-1 overflow-y-auto ${maxHeight}`}
      style={{ border: "1px solid var(--border)", background: "var(--muted)" }}
    >
      {scoped.map((company) => {
        const open = expanded[company.id] ?? false;
        const state = companyCheckState(company, value);

        return (
          <div key={company.id} className="rounded-lg" style={{ background: open ? "var(--card)" : "transparent" }}>
            <div className="flex items-center gap-1 px-1 py-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpanded((e) => ({ ...e, [company.id]: !open }))}
                className="p-1 rounded-md transition-colors shrink-0"
                style={{ color: "var(--muted-foreground)" }}
              >
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <label className="flex flex-1 items-center gap-2 cursor-pointer rounded-lg px-1 py-1 min-w-0">
                <input
                  type="checkbox"
                  checked={state === "checked"}
                  ref={(el) => {
                    if (el) el.indeterminate = state === "indeterminate";
                  }}
                  onChange={(e) => onChange(toggleCompany(company, value, e.target.checked))}
                  className="w-4 h-4 rounded accent-indigo-600 shrink-0"
                />
                <span className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                  {company.name}
                </span>
              </label>
            </div>

            {open && company.systems.length > 0 && (
              <div className="pr-6 pb-2 space-y-0.5">
                {company.systems.map((system) => (
                  <label
                    key={system.id}
                    className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <input
                      type="checkbox"
                      checked={isSystemChecked(company.id, system.id, value)}
                      onChange={(e) =>
                        onChange(toggleSystem(company, system.id, value, e.target.checked, scoped))
                      }
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                    <span className="text-sm" style={{ color: "var(--foreground)" }}>
                      {system.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
