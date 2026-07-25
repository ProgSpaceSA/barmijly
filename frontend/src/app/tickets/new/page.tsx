"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { useCreateTicket } from "@/hooks/useTickets";
import api from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import { ArrowLeft, ImagePlus, Paperclip, X, FileText } from "lucide-react";
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

const RESTRICTED_ROLES = ["TICKET_REQUESTER", "SYSTEM_OWNER"];

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const fieldStyle: React.CSSProperties = {
  background: "var(--muted)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
};

function FormInput({ register, name, error, ...rest }: any) {
  return (
    <div>
      <input
        {...register(name)}
        {...rest}
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:opacity-40"
        style={fieldStyle}
        onFocus={(e: any) => (e.target.style.borderColor = "#4F46E5")}
        onBlur={(e: any) => (e.target.style.borderColor = "var(--border)")}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error.message}</p>}
    </div>
  );
}

function FormTextarea({ register, name, error, rows = 3, placeholder }: any) {
  return (
    <div>
      <textarea
        {...register(name)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none transition-all"
        style={fieldStyle}
        onFocus={(e: any) => (e.target.style.borderColor = "#4F46E5")}
        onBlur={(e: any) => (e.target.style.borderColor = "var(--border)")}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error.message}</p>}
    </div>
  );
}

function FormSelect({ register, name, error, children, disabled }: any) {
  return (
    <div>
      <select
        {...register(name)}
        disabled={disabled}
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none cursor-pointer appearance-none disabled:opacity-40"
        style={fieldStyle}
        onFocus={(e: any) => (e.target.style.borderColor = "#4F46E5")}
        onBlur={(e: any) => (e.target.style.borderColor = "var(--border)")}
      >
        {children}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error.message}</p>}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-bold text-sm" style={{ color: "var(--foreground)" }}>{title}</h2>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--muted-foreground)" }}>
      {children}
    </label>
  );
}

export default function NewTicketPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { mutateAsync: createTicket } = useCreateTicket();
  const [companies, setCompanies] = useState<any[]>([]);
  const [systems, setSystems] = useState<any[]>([]);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const isRestricted = RESTRICTED_ROLES.includes(user?.role ?? "");

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { hasFinancialLoss: false, type: "", companyId: "", systemId: "", priority: "" },
  });

  const hasFinancialLoss = watch("hasFinancialLoss");
  const companyId = watch("companyId");

  useEffect(() => {
    if (isRestricted) {
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

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleAttachChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const uploadFile = async (file: File, ticketId: string) => {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post(`/attachments/upload?ticketId=${ticketId}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  };

  const onSubmit = async (data: any) => {
    const ticket = await createTicket(data);
    const ticketId = ticket.id;
    const uploads: Promise<any>[] = [];
    if (coverFile) {
      uploads.push(uploadFile(coverFile, ticketId).then(att => api.patch(`/tickets/${ticketId}`, { coverImageUrl: att.url })));
    }
    for (const file of attachments) uploads.push(uploadFile(file, ticketId));
    if (uploads.length > 0) await Promise.all(uploads);
    router.push(`/tickets/${ticketId}`);
  };

  return (
    <AppShell>
      <div className="max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--foreground)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
            <ArrowLeft className="w-4 h-4" /> رجوع
          </button>
          <div className="h-5 w-px" style={{ background: "var(--border)" }} />
          <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>تذكرة جديدة</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Section 1: Basic Info */}
          <FormSection title="معلومات أساسية">
            <div>
              <Label>عنوان الطلب *</Label>
              <FormInput register={register} name="title" placeholder="وصف موجز للطلب" error={errors.title} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الشركة *</Label>
                {isRestricted && companies.length === 1 ? (
                  <input value={companies[0]?.name ?? ""} disabled
                    className="w-full rounded-xl px-4 py-2.5 text-sm opacity-40" style={fieldStyle} />
                ) : (
                  <FormSelect register={register} name="companyId" error={errors.companyId}>
                    <option value="">اختر شركة...</option>
                    {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </FormSelect>
                )}
              </div>
              <div>
                <Label>النظام *</Label>
                <FormSelect register={register} name="systemId" disabled={!companyId} error={errors.systemId}>
                  <option value="">اختر النظام...</option>
                  {systems.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </FormSelect>
              </div>
              <div>
                <Label>نوع الطلب *</Label>
                <FormSelect register={register} name="type" error={errors.type}>
                  <option value="">اختر نوع الطلب...</option>
                  {Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </FormSelect>
              </div>
              <div>
                <Label>الأولوية المقترحة</Label>
                <FormSelect register={register} name="priority">
                  <option value="">اختياري</option>
                  <option value="CRITICAL">حرجة</option>
                  <option value="HIGH">عالية</option>
                  <option value="MEDIUM">متوسطة</option>
                  <option value="LOW">منخفضة</option>
                  <option value="DEFERRED">مؤجلة</option>
                </FormSelect>
              </div>
            </div>
          </FormSection>

          {/* Section 2: Details */}
          <FormSection title="تفاصيل الطلب">
            <div>
              <Label>الوصف التفصيلي *</Label>
              <FormTextarea register={register} name="description" rows={4} placeholder="اشرح الطلب بالتفصيل..." error={errors.description} />
            </div>
            <div>
              <Label>سبب الطلب / المشكلة *</Label>
              <FormTextarea register={register} name="reason" rows={3} placeholder="ما السبب الذي يدفعك لهذا الطلب؟" error={errors.reason} />
            </div>
            <div>
              <Label>النتيجة المطلوبة *</Label>
              <FormTextarea register={register} name="expectedOutcome" rows={3} placeholder="ما النتيجة التي تتوقعها بعد التنفيذ؟" error={errors.expectedOutcome} />
            </div>
            <div>
              <Label>التأثير على العمل *</Label>
              <FormTextarea register={register} name="businessImpact" rows={2} placeholder="كيف يؤثر هذا الطلب على سير العمل؟" error={errors.businessImpact} />
            </div>

            {/* Financial loss toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>هل يوجد ضرر مالي؟</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>توقف النظام أو خسائر مالية مباشرة</p>
              </div>
              <Switch checked={!!hasFinancialLoss} onCheckedChange={v => setValue("hasFinancialLoss", v)} />
            </div>

            {hasFinancialLoss && (
              <div>
                <Label>تفاصيل الضرر المالي</Label>
                <FormTextarea register={register} name="financialLossDetails" rows={2} placeholder="اشرح الضرر المالي..." />
              </div>
            )}
          </FormSection>

          {/* Section 3: Cover Image */}
          <FormSection title="صورة الغلاف">
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
            {coverPreview ? (
              <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <img src={coverPreview} alt="cover" className="w-full h-48 object-cover" />
                <button type="button" onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                  className="absolute top-2 left-2 p-1 rounded-full text-white transition-colors"
                  style={{ background: "rgba(0,0,0,0.6)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => coverInputRef.current?.click()}
                className="w-full h-32 rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed transition-all"
                style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#4F46E5"; e.currentTarget.style.color = "#4F46E5"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}>
                <ImagePlus className="w-6 h-6" />
                <span className="text-sm">اضغط لرفع صورة الغلاف</span>
                <span className="font-brm text-xs opacity-60">PNG, JPG — حد أقصى 10 MB</span>
              </button>
            )}
          </FormSection>

          {/* Section 4: Attachments */}
          <FormSection title="المرفقات">
            <input ref={attachInputRef} type="file" multiple className="hidden" onChange={handleAttachChange} />
            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--muted)" }}>
                    <FileText className="w-4 h-4 shrink-0" style={{ color: "#4F46E5" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{file.name}</p>
                      <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>{formatBytes(file.size)}</p>
                    </div>
                    <button type="button" onClick={() => removeAttachment(idx)} className="transition-colors"
                      style={{ color: "var(--muted-foreground)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => attachInputRef.current?.click()}
              className="flex items-center gap-2 text-sm font-medium transition-colors"
              style={{ color: "#4F46E5" }}>
              <Paperclip className="w-4 h-4" /> إضافة مرفق
            </button>
          </FormSection>

          {/* Submit */}
          <div className="flex gap-3 pb-8">
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)", boxShadow: "0 4px 12px rgba(79,70,229,0.3)" }}>
              {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء كمسودة"}
            </button>
            <button type="button" onClick={() => router.back()}
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
