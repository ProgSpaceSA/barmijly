"use client";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { CodeComment } from "@/components/shared/CodeComment";
import { SkeletonList, SkeletonProfile } from "@/components/shared/LoadingSpinner";
import { UserNameWithYou } from "@/components/shared/UserNameWithYou";
import { SELECT_PLACEHOLDERS, TICKET_TYPE_LABELS } from "@/lib/constants";
import { useAuthStore } from "@/store/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { SearchableDeveloperSelect } from "@/components/shared/SearchableDeveloperSelect";
import { canManageRoster } from "@/lib/permissions";
import api from "@/lib/api";
import { qk, invalidateStructure } from "@/lib/query-keys";
import { toast } from "sonner";
import { ArrowLeft, Globe, Monitor, FolderOpen, Users, Pencil, Plus, X, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_BAR: Record<string, string> = {
  DRAFT:"#94A3B8", NEW:"#3B82F6", AWAITING_INFO:"#F59E0B",
  AWAITING_APPROVAL:"#F97316", APPROVED:"#10B981", REJECTED:"#EF4444",
  SCHEDULED:"#8B5CF6", IN_PROGRESS:"#22C55E", AWAITING_TESTING:"#06B6D4",
  AWAITING_OWNER_APPROVAL:"#14B8A6", COMPLETED:"#10B981", CLOSED:"#6B7280", ON_HOLD:"#94A3B8",
};

const inputCls = "w-full rounded-lg px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" };
const labelCls = "block text-xs font-semibold mb-1.5";

/** A cleared optional field goes back as null so the API drops the stored value. */
const orNull = (v: string) => (v.trim() ? v.trim() : null);

function StatBox({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="font-brm text-2xl font-bold" style={{ color: "var(--foreground)" }}>{value ?? "—"}</div>
      <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

function SystemCard({ system, allDevs, canEditSystem, canManageRoster }: {
  system: any;
  allDevs: any[];
  canEditSystem: boolean;
  canManageRoster: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", domain: "" });
  const [addingDev, setAddingDev] = useState(false);
  const [selectedDev, setSelectedDev] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sysData, refetch } = useQuery({
    queryKey: qk.systems.detail(system.id),
    queryFn: ({ signal }) => api.get(`/systems/${system.id}`, { signal }).then(r => r.data),
    enabled: expanded,
  });

  const updateSystem = useMutation({
    mutationFn: (dto: { name: string; description: string | null; domain: string | null }) =>
      api.patch(`/systems/${system.id}`, dto),
    onSuccess: () => {
      toast.success("تم تحديث النظام");
      setEditing(false);
      invalidateStructure(qc);
      if (expanded) refetch();
    },
    onError: () => toast.error("فشل تحديث النظام"),
  });

  const startEdit = () => {
    setForm({ name: system.name ?? "", description: system.description ?? "", domain: system.domain ?? "" });
    setEditing(true);
  };

  const assignedDevs: any[] = sysData?.userSystems?.filter((us: any) => us.user?.role === "DEVELOPER") ?? [];
  const assignedIds = new Set(assignedDevs.map((us: any) => us.user?.id));
  const availableDevs = allDevs.filter(d => !assignedIds.has(d.id));

  const handleAdd = async () => {
    if (!selectedDev) return;
    const userId = selectedDev;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/systems/${system.id}/users`, { userId });
      const added = allDevs.find((d) => d.id === userId);
      setSelectedDev(null);
      setAddingDev(false);
      // Patch the open system roster immediately — do not wait for refetch.
      qc.setQueryData(qk.systems.detail(system.id), (old: any) => {
        if (!old) return old;
        const userSystems = [
          ...(old.userSystems ?? []).filter((us: any) => us.userId !== userId && us.user?.id !== userId),
          {
            userId,
            systemId: system.id,
            user: added ?? { id: userId, role: "DEVELOPER", firstName: "?", lastName: "" },
          },
        ];
        return { ...old, userSystems };
      });
      await refetch();
      invalidateStructure(qc);
      void qc.invalidateQueries({ queryKey: qk.users.all });
      void qc.invalidateQueries({ queryKey: qk.users.developers("roster") });
    } catch {
      setError("فشل التعيين، حاول مرة أخرى");
    } finally { setSaving(false); }
  };

  const handleRemove = async (userId: string) => {
    try {
      await api.delete(`/systems/${system.id}/users/${userId}`);
      qc.setQueryData(qk.systems.detail(system.id), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          userSystems: (old.userSystems ?? []).filter(
            (us: any) => us.userId !== userId && us.user?.id !== userId,
          ),
        };
      });
      await refetch();
      invalidateStructure(qc);
      void qc.invalidateQueries({ queryKey: qk.users.all });
      void qc.invalidateQueries({ queryKey: qk.users.developers("roster") });
    } catch {
      setError("فشل الحذف، حاول مرة أخرى");
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      {editing ? (
        <div className="p-4 space-y-3" style={{ borderBottom: expanded ? "1px solid var(--border)" : "none" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`system-name-${system.id}`} className={labelCls} style={{ color: "var(--muted-foreground)" }}>
                اسم النظام
              </label>
              <input id={`system-name-${system.id}`} value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label htmlFor={`system-domain-${system.id}`} className={labelCls} style={{ color: "var(--muted-foreground)" }}>
                النطاق (اختياري)
              </label>
              <input id={`system-domain-${system.id}`} value={form.domain} dir="ltr"
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`system-description-${system.id}`} className={labelCls} style={{ color: "var(--muted-foreground)" }}>
                الوصف (اختياري)
              </label>
              <input id={`system-description-${system.id}`} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updateSystem.mutate({
                name: form.name.trim(),
                description: orNull(form.description),
                domain: orNull(form.domain),
              })}
              disabled={!form.name.trim() || updateSystem.isPending}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "#4F46E5" }}>
              حفظ
            </button>
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
      <div className="flex items-stretch" style={{ borderBottom: expanded ? "1px solid var(--border)" : "none" }}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 min-w-0 flex items-center justify-between px-4 py-3 text-right transition-colors"
          onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(79,70,229,0.1)" }}>
              <Monitor className="w-3.5 h-3.5" style={{ color: "#4F46E5" }} />
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{system.name}</p>
              {system.domain && (
                <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">{system.domain}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!expanded && sysData && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                {assignedDevs.length} مطور
              </span>
            )}
            {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} />}
          </div>
        </button>
        {canEditSystem && (
          <button onClick={startEdit} aria-label={`تعديل النظام ${system.name}`} title="تعديل النظام"
            className="px-3 flex items-center transition-colors"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      )}

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Assigned devs */}
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
            المطورون المكلَّفون
          </p>
          {assignedDevs.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>لم يُعيَّن مطورون بعد</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignedDevs.map((us: any) => (
                <div key={us.user?.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm"
                  style={{ background: "rgba(79,70,229,0.08)", color: "#4F46E5", border: "1px solid rgba(79,70,229,0.15)" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "rgba(79,70,229,0.2)" }}>
                    {us.user?.firstName?.[0]}
                  </div>
                  {us.user?.firstName} {us.user?.lastName}
                  {canManageRoster && (
                    <button onClick={() => handleRemove(us.user?.id)}
                      className="transition-colors hover:text-red-500 mr-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs font-medium" style={{ color: "#DC2626" }}>{error}</p>
          )}

          {/* Add developer (managers only) */}
          {canManageRoster && (
            addingDev ? (
              <div className="flex gap-2 items-center">
                <SearchableDeveloperSelect
                  developers={availableDevs}
                  value={selectedDev}
                  onChange={setSelectedDev}
                />
                <button onClick={handleAdd} disabled={!selectedDev || saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: "#4F46E5" }}>
                  {saving ? "..." : "إضافة"}
                </button>
                <button onClick={() => { setAddingDev(false); setSelectedDev(null); }}
                  className="px-2 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
                  إلغاء
                </button>
              </div>
            ) : (
              <button onClick={() => setAddingDev(true)}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: "#4F46E5" }}>
                <Plus className="w-3.5 h-3.5" /> تعيين مطور
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();
  const { can: allowed } = usePermissions();
  const qc = useQueryClient();
  // Capability, not role names — the same matrix PATCH /companies/:id gates on.
  const canEditStructure = allowed("structure:manage");
  const canManageRosterFlag = canManageRoster(user?.role ?? null);
  const canCreateSystem = allowed("structure:create-system") || canEditStructure;
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", nameAr: "", domain: "" });

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: qk.companies.detail(id),
    queryFn: () => api.get(`/companies/${id}`).then(r => r.data),
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: qk.tickets.byCompany(id),
    queryFn: () => api.get(`/tickets?companyId=${id}&limit=50`).then(r => r.data),
  });

  const { data: allUsersData } = useQuery({
    queryKey: qk.users.developers("roster"),
    queryFn: () => api.get("/users/developers", { params: { pool: "roster" } }).then(r => r.data),
    staleTime: 60_000,
    enabled: canManageRosterFlag,
  });

  const updateCompany = useMutation({
    mutationFn: (dto: { name: string; nameAr: string | null; domain: string | null }) =>
      api.patch(`/companies/${id}`, dto),
    onSuccess: () => {
      toast.success("تم تحديث بيانات الشركة");
      setEditingCompany(false);
      invalidateStructure(qc);
    },
    onError: () => toast.error("فشل تحديث بيانات الشركة"),
  });

  const startCompanyEdit = () => {
    setCompanyForm({ name: company?.name ?? "", nameAr: company?.nameAr ?? "", domain: company?.domain ?? "" });
    setEditingCompany(true);
  };

  const tickets: any[] = ticketsData?.data ?? [];
  const allDevs: any[] = allUsersData ?? [];

  return (
    <AppShell requires="structure:read-all">
      <div className="space-y-6">
        {/* Back */}
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--foreground)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
          <ArrowLeft className="w-4 h-4" /> رجوع
        </button>

        {companyLoading ? (
          <SkeletonProfile />
        ) : company && (
          <>
            {/* Company card */}
            <div className="rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0"
                  style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}>
                  {company.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  {editingCompany ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label htmlFor="company-name" className={labelCls} style={{ color: "var(--muted-foreground)" }}>
                            اسم الشركة
                          </label>
                          <input id="company-name" value={companyForm.name} autoFocus
                            onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                            className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                          <label htmlFor="company-nameAr" className={labelCls} style={{ color: "var(--muted-foreground)" }}>
                            الاسم بالعربية (اختياري)
                          </label>
                          <input id="company-nameAr" value={companyForm.nameAr}
                            onChange={e => setCompanyForm(f => ({ ...f, nameAr: e.target.value }))}
                            className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                          <label htmlFor="company-domain" className={labelCls} style={{ color: "var(--muted-foreground)" }}>
                            النطاق (اختياري)
                          </label>
                          <input id="company-domain" value={companyForm.domain} dir="ltr"
                            onChange={e => setCompanyForm(f => ({ ...f, domain: e.target.value }))}
                            className={inputCls} style={inputStyle} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateCompany.mutate({
                            name: companyForm.name.trim(),
                            nameAr: orNull(companyForm.nameAr),
                            domain: orNull(companyForm.domain),
                          })}
                          disabled={!companyForm.name.trim() || updateCompany.isPending}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: "#4F46E5" }}>
                          حفظ
                        </button>
                        <button onClick={() => setEditingCompany(false)}
                          className="px-3 py-1.5 rounded-lg text-xs"
                          style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{company.name}</h1>
                        {company.nameAr && company.nameAr !== company.name && (
                          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{company.nameAr}</span>
                        )}
                        {!company.isActive && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: "rgba(220,38,38,.1)", color: "#DC2626" }}>غير نشطة</span>
                        )}
                        {canEditStructure && (
                          <button onClick={startCompanyEdit}
                            className="flex items-center gap-1 text-xs font-medium transition-colors"
                            style={{ color: "#4F46E5" }}>
                            <Pencil className="w-3.5 h-3.5" /> تعديل
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm sm:gap-5" style={{ color: "var(--muted-foreground)" }}>
                        {company.domain && (
                          <span className="flex items-center gap-1.5 font-brm" dir="ltr">
                            <Globe className="w-3.5 h-3.5" /> {company.domain}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5" /> {company.departments?.length ?? 0} قسم
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5" /> {company.systems?.length ?? 0} نظام
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> {company._count?.users ?? 0} مستخدم
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <StatBox label="إجمالي التذاكر"  value={tickets.length} />
              <StatBox label="قيد التنفيذ"      value={tickets.filter((t: any) => t.status === "IN_PROGRESS").length} />
              <StatBox label="مكتملة"           value={tickets.filter((t: any) => t.status === "COMPLETED").length} />
              <StatBox label="مغلقة"            value={tickets.filter((t: any) => t.status === "CLOSED").length} />
            </div>

            {/* Systems with developer assignment */}
            {company.systems?.length > 0 && (
              <div>
                <p className="font-brm text-xs uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
                  <CodeComment>الأنظمة والمطورون</CodeComment>
                </p>
                <div className="space-y-2">
                  {company.systems.map((s: any) => (
                    <SystemCard
                      key={s.id}
                      system={s}
                      allDevs={allDevs}
                      canEditSystem={canEditStructure}
                      canManageRoster={canManageRosterFlag}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tickets */}
        <div>
          <p className="font-brm text-xs uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
            <CodeComment>تذاكر الشركة</CodeComment>
          </p>

          {ticketsLoading ? (
            <SkeletonList count={4} />
          ) : tickets.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="font-brm text-sm" style={{ color: "var(--muted-foreground)" }}>$ no tickets found_</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {tickets.map((ticket: any) => {
                const bar = STATUS_BAR[ticket.status] ?? "#94A3B8";
                const assignedDev = ticket.assignments?.[0]?.developer;
                const assignedDevName = [assignedDev?.firstName, assignedDev?.lastName]
                  .filter(Boolean)
                  .join(" ");
                const assignedDevLabel = assignedDevName
                  ? `المطور المُكلَّف: ${assignedDevName}`
                  : "المطور المُكلَّف";
                return (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
                    <div className="rounded-xl flex overflow-hidden transition-all hover:shadow-md"
                      style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      <div className="w-1 shrink-0 self-stretch" style={{ background: bar, borderRadius: "0 4px 4px 0" }} />
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <StatusBadge status={ticket.status} />
                              <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
                              <TicketCodeBadge ticketNumber={ticket.ticketNumber} />
                              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                                {TICKET_TYPE_LABELS[ticket.type]}
                              </span>
                            </div>
                            <h3 className="brm-row-title font-semibold" style={{ color: "var(--foreground)" }}>{ticket.title}</h3>
                            <div className="flex gap-4 mt-1.5 text-xs flex-wrap" style={{ color: "var(--muted-foreground)" }}>
                              <UserNameWithYou person={ticket.creator} currentUserId={user?.id} />
                              <span>{ticket.system?.name}</span>
                              <RelativeTime date={ticket.createdAt} />
                            </div>
                          </div>
                          {ticket.assignments?.[0] && (
                            <div
                              title={assignedDevLabel}
                              aria-label={assignedDevLabel}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 cursor-help"
                              style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}>
                              {assignedDev?.firstName?.[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
