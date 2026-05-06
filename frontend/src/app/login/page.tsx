"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Layers, ArrowLeft } from "lucide-react";

const schema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور قصيرة"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await api.post("/auth/login", data);
      const { access_token } = res.data;
      localStorage.setItem("token", access_token);
      const me = await api.get("/auth/me", { headers: { Authorization: `Bearer ${access_token}` } });
      setAuth(access_token, me.data);
      toast.success("مرحباً بك!");
      router.replace("/dashboard");
    } catch (e: any) {
      toast.error(e.response?.data?.message || "بيانات الدخول غير صحيحة");
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)" }}
      >
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <Layers className="w-6 h-6 text-white" />
          </div>
          <span className="text-white font-bold text-xl">برمجلي</span>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-snug mb-4">
            نظام إدارة<br />طلبات البرمجة
          </h2>
          <p className="text-indigo-200 text-lg leading-relaxed">
            تتبع طلبات التطوير، وأدر فريقك، وتابع التقدم — كل ذلك في مكان واحد.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { label: "تتبع التذاكر", desc: "من الطلب حتى التسليم" },
              { label: "إدارة الفريق", desc: "أدوار وصلاحيات دقيقة" },
              { label: "تقارير لحظية", desc: "بيانات واضحة دائماً" },
            ].map(f => (
              <div key={f.label} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.1)" }}>
                <p className="text-white font-semibold text-sm">{f.label}</p>
                <p className="text-indigo-200 text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-indigo-300 text-sm">© {new Date().getFullYear()} برمجلي · جميع الحقوق محفوظة</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6" style={{ background: "#F8FAFC" }}>
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#4338CA" }}>
              <Layers className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl" style={{ color: "#1E1B4B" }}>برمجلي</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">تسجيل الدخول</h1>
          <p className="text-slate-500 text-sm mb-8">أدخل بياناتك للوصول إلى حسابك</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">البريد الإلكتروني</label>
              <input
                {...register("email")}
                type="email"
                dir="ltr"
                placeholder="name@company.com"
                className="w-full border rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
                style={{ borderColor: "#E2E8F0" }}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full border rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  style={{ borderColor: "#E2E8F0" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all mt-2 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 14px rgba(67,56,202,0.35)" }}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  جار الدخول...
                </>
              ) : (
                <>دخول <ArrowLeft className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
