"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Layers } from "lucide-react";

const schema = z.object({
  password: z.string().min(8, "8 أحرف على الأقل"),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: "كلمات المرور غير متطابقة", path: ["confirm"] });

function AcceptForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const setAuth = useAuthStore(s => s.setAuth);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data: any) => {
    try {
      const res = await api.post("/auth/set-password", { token, password: data.password });
      const { access_token } = res.data;
      localStorage.setItem("token", access_token);
      const me = await api.get("/auth/me", { headers: { Authorization: `Bearer ${access_token}` } });
      setAuth(access_token, me.data);
      toast.success("تم تفعيل الحساب بنجاح");
      router.replace("/dashboard");
    } catch (e: any) {
      toast.error(e.response?.data?.message || "الرابط غير صالح أو منتهي");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>كلمة المرور</Label>
        <Input type="password" {...register("password")} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message as string}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>تأكيد كلمة المرور</Label>
        <Input type="password" {...register("confirm")} />
        {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message as string}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "جار الحفظ..." : "تفعيل الحساب"}
      </Button>
    </form>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">برمجلي</h1>
          <p className="text-muted-foreground mt-1">قبول الدعوة</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>إنشاء كلمة المرور</CardTitle>
            <CardDescription>اختر كلمة مرور قوية لحسابك</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>جار التحميل...</div>}>
              <AcceptForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
