"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCreateTicket } from "@/hooks/useTickets";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import { ArrowRight } from "lucide-react";

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

export default function NewTicketPage() {
  const router = useRouter();
  const { mutateAsync: createTicket } = useCreateTicket();
  const [companies, setCompanies] = useState<any[]>([]);
  const [systems, setSystems] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { hasFinancialLoss: false },
  });

  const hasFinancialLoss = watch("hasFinancialLoss");
  const companyId = watch("companyId");

  useEffect(() => {
    api.get("/companies").then(r => setCompanies(r.data));
  }, []);

  useEffect(() => {
    if (companyId) {
      api.get(`/systems?companyId=${companyId}`).then(r => setSystems(r.data));
    }
  }, [companyId]);

  const onSubmit = async (data: any) => {
    const ticket = await createTicket(data);
    router.push(`/tickets/${ticket.id}`);
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        <PageHeader
          title="تذكرة جديدة"
          action={<Button variant="ghost" onClick={() => router.back()}><ArrowRight className="w-4 h-4 ml-1" /> رجوع</Button>}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card><CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-base border-b pb-2">معلومات أساسية</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>عنوان الطلب *</Label>
                <Input {...register("title")} placeholder="وصف موجز للطلب" />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message as string}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>الشركة *</Label>
                <Select onValueChange={(v: string | null) => { if(v) { setValue("companyId", v as string); setValue("systemId", ""); } }}>
                  <SelectTrigger><SelectValue placeholder="اختر شركة" /></SelectTrigger>
                  <SelectContent>{companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nameAr || c.name}</SelectItem>)}</SelectContent>
                </Select>
                {errors.companyId && <p className="text-xs text-destructive">{errors.companyId.message as string}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>النظام *</Label>
                <Select onValueChange={(v: string | null) => { if(v) setValue("systemId", v as string); }} disabled={!companyId}>
                  <SelectTrigger><SelectValue placeholder="اختر النظام" /></SelectTrigger>
                  <SelectContent>{systems.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nameAr || s.name}</SelectItem>)}</SelectContent>
                </Select>
                {errors.systemId && <p className="text-xs text-destructive">{errors.systemId.message as string}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>نوع الطلب *</Label>
                <Select onValueChange={(v: string | null) => { if(v) setValue("type", v as string); }}>
                  <SelectTrigger><SelectValue placeholder="اختر نوع الطلب" /></SelectTrigger>
                  <SelectContent>{Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                {errors.type && <p className="text-xs text-destructive">{errors.type.message as string}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>الأولوية المقترحة</Label>
                <Select onValueChange={(v: string | null) => { if(v) setValue("priority", v as string); }}>
                  <SelectTrigger><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>
                    {[["CRITICAL","حرجة"],["HIGH","عالية"],["MEDIUM","متوسطة"],["LOW","منخفضة"],["DEFERRED","مؤجلة"]].map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-base border-b pb-2">تفاصيل الطلب</h2>

            <div className="space-y-1.5">
              <Label>الوصف التفصيلي *</Label>
              <Textarea rows={4} {...register("description")} placeholder="اشرح الطلب بالتفصيل..." />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message as string}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>سبب الطلب / المشكلة *</Label>
              <Textarea rows={3} {...register("reason")} placeholder="ما السبب الذي يدفعك لهذا الطلب؟" />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message as string}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>النتيجة المطلوبة *</Label>
              <Textarea rows={3} {...register("expectedOutcome")} placeholder="ما النتيجة التي تتوقعها بعد التنفيذ؟" />
              {errors.expectedOutcome && <p className="text-xs text-destructive">{errors.expectedOutcome.message as string}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>التأثير على العمل *</Label>
              <Textarea rows={2} {...register("businessImpact")} placeholder="كيف يؤثر هذا الطلب على سير العمل؟" />
              {errors.businessImpact && <p className="text-xs text-destructive">{errors.businessImpact.message as string}</p>}
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">هل يوجد ضرر مالي؟</p>
                <p className="text-xs text-muted-foreground">توقف النظام أو خسائر مالية مباشرة</p>
              </div>
              <Switch checked={!!hasFinancialLoss} onCheckedChange={v => setValue("hasFinancialLoss", v)} />
            </div>

            {hasFinancialLoss && (
              <div className="space-y-1.5">
                <Label>تفاصيل الضرر المالي</Label>
                <Textarea rows={2} {...register("financialLossDetails")} placeholder="اشرح الضرر المالي..." />
              </div>
            )}
          </CardContent></Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "جار الإنشاء..." : "إنشاء كمسودة"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>إلغاء</Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
