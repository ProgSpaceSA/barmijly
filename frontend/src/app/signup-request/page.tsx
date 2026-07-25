"use client";
import { useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { CheckCircle, Layers } from "lucide-react";

export default function SignupRequestPage() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("جميع الحقول مطلوبة");
      return;
    }
    setLoading(true);
    try {
      await api.post("/signup-requests", form);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || "حدث خطأ، يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-slate-900">برمجلي</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-8" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">تم إرسال طلبك</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                سيقوم الفريق بمراجعة طلبك وستصلك رسالة على بريدك الإلكتروني عند الاعتماد.
              </p>
              <Link href="/login" className="text-indigo-600 hover:underline text-sm font-medium">
                العودة لتسجيل الدخول
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 mb-1">طلب انضمام كمطور</h1>
              <p className="text-slate-500 text-sm mb-6">أدخل بياناتك وسيتم مراجعة طلبك من قِبل الإدارة</p>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">الاسم الأول *</label>
                    <input
                      value={form.firstName}
                      onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                      className={inputCls}
                      placeholder="محمد"
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">الاسم الأخير *</label>
                    <input
                      value={form.lastName}
                      onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                      className={inputCls}
                      placeholder="الأحمد"
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">البريد الإلكتروني *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className={inputCls}
                    placeholder="name@company.com"
                    autoComplete="email"
                    dir="ltr"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all mt-2"
                  style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}
                >
                  {loading ? "جارٍ الإرسال..." : "إرسال الطلب"}
                </button>
              </form>

              <p className="text-center text-sm text-slate-500 mt-5">
                لديك حساب؟{" "}
                <Link href="/login" className="text-indigo-600 hover:underline font-medium">
                  تسجيل الدخول
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
