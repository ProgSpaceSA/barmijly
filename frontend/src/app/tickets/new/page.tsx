"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { useCreateTicket } from "@/hooks/useTickets";
import api from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/auth";

const schema = z.object({
  title: z.string().min(5, "العنوان مطلوب"),
  description: z.string().min(20, "الوصف مطلوب (20 حرف على الأقل)"),
  reason: z.string().min(10, "السبب مطلوب"),
  expectedOutcome: z.string().min(10, "النتيجة المتوقعة مطلوبة"),
  businessImpact: z.string().min(5, "التأثير على العمل مطلوب"),
  type: z.string().min(1, "نوع الطلب مطلوب"),
  systemId: z.string().min(1, "النظام مطلوب"),
  companyId: z.string().min(1, "الشركة مطلوبة"),
  hasFinancialLoss: z.boolean().optional(),
  financialLossDetails: z.string().optional(),
  priority: z.string().optional(),
});

const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400";
const selectCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none cursor-pointer disabled:bg-slate-50 disabled:text-slate-400";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";
const errorCls = "text-red-500 text-xs mt-1";

const RESTRICTED_ROLES = ["TICKET_REQUESTER", "SYSTEM_OWNER"];

export default function NewTicketPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { mutateAsync: createTicket } = useCreateTicket();
  const [companies, setCompanies] = useState<any[]>([]);
  const [systems, setSystems] = useState<any[]>([]);

  const isRestricted = RESTRICTED_ROLES.includes(user?.role ?? "");

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { hasFinancialLoss: false, type: "", companyId: "", systemId: "", priority: "" },
  });

  const hasFinancialLoss = watch("hasFinancialLoss");
  const companyId = watch("companyId");

  useEffect(() => {
    if (isRestricted) {
      // Load only user's assigned companies
      api.get("/auth/me").then(r => {
        const userCompanies = r.data?.companies?.map((uc: any) => uc.company).filter(Boolean) || [];
        if (userCompanies.length === 1) {
          setCompanies(userCompanies);
          setValue("companyId", userCompanies[0].id);
        } else if (userCompanies.length > 1) {
          setCompanies(userCompanies);
        } else if (r.data?.companyId) {
          api.get(`/companies/${r.data.companyId}`).then(r2 => {
            setCompanies([r2.data]);
            setValue("companyId", r2.data.id);
          });
        }
      });
    } else {
      api.get("/companies").then(r => setCompanies(r.data || []));
    }
  }, [isRestricted, setValue]);

  useEffect(() => {
    setSystems([]);
    setValue("systemId", "");
    if (companyId) {
      api.get(`/systems?companyId=${companyId}`).then(r => setSystems(r.data || []));
    }
  }, [companyId, setValue]);

  const onSubmit = async (data: any) => {
    const ticket = await createTicket(data);
    router.push(`/tickets/${ticket.id}`);
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            رجوع
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <h1 className="text-2xl font-bold text-slate-900">تذكرة جديدة</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Section 1: Basic Info */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h2 className="font-bold text-slate-800 text-base pb-3 border-b border-slate-100">معلومات أساسية</h2>

            <div>
              <label className={labelCls}>عنوان الطلب *</label>
              <input {...register("title")} className={inputCls} placeholder="وصف موجز للطلب" />
              {errors.title && <p className={errorCls}>{errors.title.message as string}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>الشركة *</label>
                {isRestricted && companies.length === 1 ? (
                  <input value={companies[0]?.name ?? ""} className={inputCls} disabled />
                ) : (
                  <select {...register("companyId")} className={selectCls}>
                    <option value="">اختر شركة...</option>
                    {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {errors.companyId && <p className={errorCls}>{errors.companyId.message as string}</p>}
              </div>

              <div>
                <label className={labelCls}>النظام *</label>
                <select {...register("systemId")} className={selectCls} disabled={!companyId}>
                  <option value="">اختر النظام...</option>
                  {systems.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.systemId && <p className={errorCls}>{errors.systemId.message as string}</p>}
              </div>

              <div>
                <label className={labelCls}>نوع الطلب *</label>
                <select {...register("type")} className={selectCls}>
                  <option value="">اختر نوع الطلب...</option>
                  {Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                {errors.type && <p className={errorCls}>{errors.type.message as string}</p>}
              </div>

              <div>
                <label className={labelCls}>الأولوية المقترحة</label>
                <select {...register("priority")} className={selectCls}>
                  <option value="">اختياري</option>
                  <option value="CRITICAL">حرجة</option>
                  <option value="HIGH">عالية</option>
                  <option value="MEDIUM">متوسطة</option>
                  <option value="LOW">منخفضة</option>
                  <option value="DEFERRED">مؤجلة</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Details */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h2 className="font-bold text-slate-800 text-base pb-3 border-b border-slate-100">تفاصيل الطلب</h2>

            <div>
              <label className={labelCls}>الوصف التفصيلي *</label>
              <textarea rows={4} {...register("description")} className={inputCls} placeholder="اشرح الطلب بالتفصيل..." />
              {errors.description && <p className={errorCls}>{errors.description.message as string}</p>}
            </div>

            <div>
              <label className={labelCls}>سبب الطلب / المشكلة *</label>
              <textarea rows={3} {...register("reason")} className={inputCls} placeholder="ما السبب الذي يدفعك لهذا الطلب؟" />
              {errors.reason && <p className={errorCls}>{errors.reason.message as string}</p>}
            </div>

            <div>
              <label className={labelCls}>النتيجة المطلوبة *</label>
              <textarea rows={3} {...register("expectedOutcome")} className={inputCls} placeholder="ما النتيجة التي تتوقعها بعد التنفيذ؟" />
              {errors.expectedOutcome && <p className={errorCls}>{errors.expectedOutcome.message as string}</p>}
            </div>

            <div>
              <label className={labelCls}>التأثير على العمل *</label>
              <textarea rows={2} {...register("businessImpact")} className={inputCls} placeholder="كيف يؤثر هذا الطلب على سير العمل؟" />
              {errors.businessImpact && <p className={errorCls}>{errors.businessImpact.message as string}</p>}
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-700">هل يوجد ضرر مالي؟</p>
                <p className="text-xs text-slate-500 mt-0.5">توقف النظام أو خسائر مالية مباشرة</p>
              </div>
              <Switch checked={!!hasFinancialLoss} onCheckedChange={v => setValue("hasFinancialLoss", v)} />
            </div>

            {hasFinancialLoss && (
              <div>
                <label className={labelCls}>تفاصيل الضرر المالي</label>
                <textarea rows={2} {...register("financialLossDetails")} className={inputCls} placeholder="اشرح الضرر المالي..." />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pb-8">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}
            >
              {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء كمسودة"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
