"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { toast } from "sonner";
import { Layers, ArrowLeft } from "lucide-react";
import Link from "next/link";

const schema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await api.post("/auth/forgot-password", data);
      setSent(true);
    } catch {
      toast.error("حدث خطأ، حاول مجدداً");
    }
  };

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
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-slate-900">تم الإرسال</h2>
              <p className="text-sm text-slate-500">
                إذا كان البريد مسجلاً لدينا، ستصلك رسالة بها رابط لإعادة تعيين كلمة المرور خلال دقائق.
              </p>
              <p className="text-xs text-slate-400">الرابط صالح لمدة 30 دقيقة فقط.</p>
              <Link href="/login" className="block text-sm text-indigo-600 hover:underline mt-4">
                العودة لتسجيل الدخول
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-900 mb-1">نسيت كلمة المرور؟</h2>
              <p className="text-sm text-slate-500 mb-6">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">البريد الإلكتروني</label>
                  <input
                    {...register("email")}
                    type="email"
                    dir="ltr"
                    placeholder="name@company.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
                  style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 14px rgba(67,56,202,0.35)" }}
                >
                  {isSubmitting ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
                </button>
              </form>

              <Link href="/login" className="flex items-center justify-center gap-1.5 mt-5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
