"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CodeComment } from "@/components/shared/CodeComment";

function loginErrorMessage(error: unknown): string {
  const message =
    error && typeof error === "object" && "response" in error
      ? (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
      : undefined;
  if (typeof message === "string" && message.trim()) {
    return message === "Invalid credentials" ? "بيانات الدخول غير صحيحة" : message;
  }
  if (Array.isArray(message) && message.length) {
    return message.map(String).join(" — ");
  }
  return "بيانات الدخول غير صحيحة";
}

const schema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور قصيرة"),
});
type FormData = z.infer<typeof schema>;

function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let t = 0;
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const spacing = 28;
      const cols = Math.ceil(canvas.width / spacing) + 1;
      const rows = Math.ceil(canvas.height / spacing) + 1;
      t += 0.003;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ox = Math.sin(t + r * 0.4 + c * 0.3) * 3;
          const oy = Math.cos(t + c * 0.4 + r * 0.25) * 3;
          const x = c * spacing + ox;
          const y = r * spacing + oy;
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(129,140,248,0.18)";
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(raf); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await api.post("/auth/login", data);
      const { access_token } = res.data;
      const me = await api.get("/auth/me", { headers: { Authorization: `Bearer ${access_token}` } });
      setAuth(access_token, me.data);
      toast.success("مرحباً بك!");
      router.refresh();
      router.replace("/dashboard");
    } catch (error) {
      toast.error(loginErrorMessage(error));
    }
  };

  const submitLogin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void handleSubmit(onSubmit)(e);
  };

  return (
    <div className="min-h-screen flex" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* Left panel — deep ink with dot-grid */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #09091A 0%, #12122A 50%, #191940 100%)" }}
      >
        <DotGrid />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.4)" }}>
            <span className="text-white font-bold text-lg" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>B</span>
          </div>
          <span className="text-white font-bold text-xl">برمجلي</span>
        </div>

        <div className="relative z-10">
          <p className="font-brm text-xs mb-4" style={{ color: "rgba(129,140,248,0.7)" }}>
            <CodeComment>ticket management system</CodeComment>
          </p>
          <h2 className="text-4xl font-bold leading-snug mb-4" style={{ color: "#E2E8F0" }}>
            نظام إدارة<br />طلبات البرمجة
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: "rgba(224,231,255,0.55)" }}>
            تتبع طلبات التطوير، وأدر فريقك، وتابع التقدم — كل ذلك في مكان واحد.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              { label: "تتبع التذاكر", code: "track()" },
              { label: "إدارة الفريق", code: "manage()" },
              { label: "تقارير لحظية", code: "report()" },
            ].map(f => (
              <div
                key={f.label}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="font-brm text-xs mb-1" style={{ color: "rgba(129,140,248,0.7)" }}>
                  <span className="ltr-isolate">{f.code}</span>
                </p>
                <p className="text-sm font-semibold" style={{ color: "rgba(224,231,255,0.8)" }}>{f.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 font-brm text-xs" style={{ color: "rgba(224,231,255,0.2)" }}>
          © {new Date().getFullYear()} barmijly.ai
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6" style={{ background: "var(--background)" }}>
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#4F46E5" }}>
              <span className="font-brm text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold text-xl" style={{ color: "var(--foreground)" }}>برمجلي</span>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--foreground)" }}>تسجيل الدخول</h1>
          <p className="text-sm mb-8" style={{ color: "var(--muted-foreground)" }}>أدخل بياناتك للوصول إلى حسابك</p>

          <form onSubmit={submitLogin} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>البريد الإلكتروني</label>
              <input
                {...register("email")}
                type="email"
                dir="ltr"
                placeholder="name@company.com"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:opacity-40"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
                onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>كلمة المرور</label>
              <div className="relative">
                <input
                  {...register("password")}
                  id="login-password"
                  dir="ltr"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full rounded-xl py-3 pe-4 ps-10 text-sm outline-none transition-all placeholder:opacity-40"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                  onBlur={e => (e.target.style.borderColor = "var(--border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
              <div className="text-left mt-1.5">
                <Link href="/forgot-password" className="text-xs hover:underline" style={{ color: "#4F46E5" }}>
                  نسيت كلمة المرور؟
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all mt-2 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)", boxShadow: "0 4px 14px rgba(79,70,229,0.35)" }}
            >
              {isSubmitting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> جارٍ الدخول...</>
              ) : (
                <>دخول <ArrowLeft className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: "var(--muted-foreground)" }}>
            مطور جديد؟{" "}
            <Link href="/signup-request" className="font-medium hover:underline" style={{ color: "#4F46E5" }}>
              اطلب الانضمام
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
