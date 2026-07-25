"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Check, X, Clock, UserCheck, UserX } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "بانتظار المراجعة", color: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "مُعتمد", color: "bg-green-100 text-green-700" },
  REJECTED: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

export default function SignupRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");

  const { data = [], isLoading } = useQuery({
    queryKey: ["signup-requests"],
    queryFn: () => api.get("/signup-requests").then(r => r.data),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.patch(`/signup-requests/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signup-requests"] }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.patch(`/signup-requests/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signup-requests"] }),
  });

  const filtered = filter === "ALL" ? data : data.filter((r: any) => r.status === filter);
  const pending = data.filter((r: any) => r.status === "PENDING").length;

  return (
    <AppShell>
      <PageHeader
        title="طلبات التسجيل"
        description={`${data.length} طلب إجمالاً${pending > 0 ? ` — ${pending} بانتظار المراجعة` : ""}`}
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === s
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s === "ALL" ? "الكل" : STATUS_MAP[s].label}
            {s === "PENDING" && pending > 0 && (
              <span className="mr-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req: any) => {
            const st = STATUS_MAP[req.status];
            const isPending = req.status === "PENDING";
            return (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    {/* Info */}
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 font-bold text-indigo-600 text-sm">
                        {req.firstName[0]}{req.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{req.firstName} {req.lastName}</p>
                        <p className="text-sm text-slate-500 dir-ltr text-right" dir="ltr">{req.email}</p>
                      </div>
                    </div>

                    {/* Status + date */}
                    <div className="flex items-center gap-3 flex-wrap shrink-0">
                      <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(req.createdAt), "d MMM yyyy", { locale: ar })}
                      </span>
                      {req.reviewedBy && (
                        <span className="text-xs text-slate-400">
                          بواسطة {req.reviewedBy.firstName} {req.reviewedBy.lastName}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    {isPending && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => approve.mutate(req.id)}
                          disabled={approve.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          اعتماد
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reject.mutate(req.id)}
                          disabled={reject.isPending}
                          className="border-red-200 text-red-600 hover:bg-red-50 h-8 px-3 gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          رفض
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
