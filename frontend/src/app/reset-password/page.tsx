"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { toast } from "sonner";
import { Layers, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

const schema = z.object({
  password: z.string().min(8, "8 أحرف على الأقل"),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: "كلمات المرور غير متطابقة", path: ["confirm"] });
type FormData = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <p className="text-red-500 font-medium">الرابط غير صالح</p>
        <Link href="/forgot-password" className="text-sm text-indigo-600 hover:underline">طلب رابط جديد</Link>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    try {
      await api.post("/auth/reset-password", { token, password: data.password });
      setDone(true);
      setTimeout(() => router.replace("/login"), 2500);
    } catch (e: any) {
      toast.error(e.response?.data?.message || "الرابط غير صالح أو منتهي الصلاحية");
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-900">تم تغيير كلمة المرور</h2>
        <p className="text-sm text-slate-500">سيتم تحويلك لصفحة الدخول...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور الجديدة</label>
        <div className="relative">
          <input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            placeholder="8 أحرف على الأقل"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">تأكيد كلمة المرور</label>
        <div className="relative">
          <input
            {...register("confirm")}
            type={showConfirm ? "text" : "password"}
            placeholder="أعد كتابة كلمة المرور"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
          />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
        style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 14px rgba(67,56,202,0.35)" }}
      >
        {isSubmitting ? "جارٍ الحفظ..." : "حفظ كلمة المرور الجديدة"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8FAFC" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)" }}>
            <Layers className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">برمجلي</h1>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-8" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          <h2 className="text-xl font-bold text-slate-900 mb-1">إعادة تعيين كلمة المرور</h2>
          <p className="text-sm text-slate-500 mb-6">اختر كلمة مرور جديدة لحسابك</p>
          <Suspense fallback={<div className="text-center text-slate-400">جارٍ التحميل...</div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
