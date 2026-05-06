export const TICKET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  NEW: "جديدة",
  AWAITING_INFO: "بانتظار معلومات",
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  SCHEDULED: "مجدولة",
  IN_PROGRESS: "قيد التنفيذ",
  AWAITING_TESTING: "بانتظار اختبار",
  AWAITING_OWNER_APPROVAL: "بانتظار اعتماد المالك",
  COMPLETED: "مكتملة",
  CLOSED: "مغلقة",
  ON_HOLD: "معلقة",
};

export const TICKET_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  NEW: "bg-blue-100 text-blue-700",
  AWAITING_INFO: "bg-yellow-100 text-yellow-700",
  AWAITING_APPROVAL: "bg-orange-100 text-orange-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  SCHEDULED: "bg-purple-100 text-purple-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  AWAITING_TESTING: "bg-cyan-100 text-cyan-700",
  AWAITING_OWNER_APPROVAL: "bg-teal-100 text-teal-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-gray-200 text-gray-600",
  ON_HOLD: "bg-slate-100 text-slate-600",
};

export const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "حرجة",
  HIGH: "عالية",
  MEDIUM: "متوسطة",
  LOW: "منخفضة",
  DEFERRED: "مؤجلة",
};

export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-green-100 text-green-700",
  DEFERRED: "bg-gray-100 text-gray-600",
};

export const TICKET_TYPE_LABELS: Record<string, string> = {
  MODIFICATION: "تعديل على نظام قائم",
  NEW_FEATURE: "إضافة ميزة جديدة",
  BUG_FIX: "إصلاح خطأ",
  UI_IMPROVEMENT: "تحسين واجهة",
  PERFORMANCE: "تحسين أداء",
  REPORT_DASHBOARD: "تقرير أو لوحة بيانات",
  USER_PERMISSIONS: "صلاحيات مستخدمين",
  API_INTEGRATION: "ربط تكاملي API",
  EMERGENCY: "طلب طارئ",
  TECHNICAL_CONSULTATION: "طلب استشارة تقنية",
};

export const ROLE_LABELS: Record<string, string> = {
  TICKET_REQUESTER: "طالب التذكرة",
  SYSTEM_OWNER: "مالك النظام",
  PROGRAMMING_HEAD: "رئيس قسم البرمجة",
  PROJECT_MANAGER: "مدير المشروع",
  DEVELOPER: "مطور",
  QA: "مختبر QA",
  SENIOR_MANAGEMENT: "الإدارة العليا",
};
