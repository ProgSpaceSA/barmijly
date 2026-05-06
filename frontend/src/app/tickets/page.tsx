"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { useTickets } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS } from "@/lib/constants";
import { Plus, Search, Ticket, Calendar, User } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const STATUSES = Object.entries(TICKET_STATUS_LABELS);

export default function TicketsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, isLoading } = useTickets(filters);

  const canCreate = user?.role && !["SENIOR_MANAGEMENT"].includes(user.role);

  const setFilter = (key: string, val: string) => {
    setFilters(prev => val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  };

  return (
    <AppShell>
      <PageHeader
        title="التذاكر"
        description={`${data?.total ?? 0} تذكرة`}
        action={canCreate ? (
          <Button onClick={() => router.push("/tickets/new")}>
            <Plus className="w-4 h-4 ml-2" /> تذكرة جديدة
          </Button>
        ) : undefined}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث..." className="pr-9" onChange={e => setFilter("search", e.target.value)} />
        </div>
        <Select onValueChange={(v: string | null) => setFilter("status", v === "ALL" ? "" : (v || ""))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">جميع الحالات</SelectItem>
            {STATUSES.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={(v: string | null) => setFilter("priority", v === "ALL" ? "" : (v || ""))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="الأولوية" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">جميع الأولويات</SelectItem>
            {[["CRITICAL","حرجة"],["HIGH","عالية"],["MEDIUM","متوسطة"],["LOW","منخفضة"],["DEFERRED","مؤجلة"]].map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <LoadingSpinner /> : !data?.data?.length ? (
        <EmptyState icon={Ticket} title="لا توجد تذاكر" description="لم يتم العثور على تذاكر بهذه الفلاتر"
          action={canCreate ? { label: "إنشاء تذكرة", onClick: () => router.push("/tickets/new") } : undefined} />
      ) : (
        <div className="space-y-3">
          {data.data.map((ticket: any) => (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
                        <span className="text-xs text-muted-foreground">{TICKET_TYPE_LABELS[ticket.type]}</span>
                      </div>
                      <h3 className="font-semibold text-foreground truncate">{ticket.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ticket.creator?.firstName} {ticket.creator?.lastName}
                        </span>
                        <span>{ticket.system?.name}</span>
                        <span>{ticket.company?.name}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(ticket.createdAt), "d MMM yyyy", { locale: ar })}
                        </span>
                      </div>
                    </div>
                    {ticket.assignments?.[0] && (
                      <div className="text-xs text-muted-foreground shrink-0">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {ticket.assignments[0].developer?.firstName?.[0]}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map(p => (
                <Button key={p} variant={String(p) === (filters.page || "1") ? "default" : "outline"} size="sm"
                  onClick={() => setFilter("page", String(p))}>{p}</Button>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
