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

/** Tickets list — assignment filter (ticket assigned to me, or a task assigned to me). */
export const TICKET_MINE_LABEL = "تذاكري";

/** Personal dashboard greeting for the manager. */
const PERSONAL_GREETING_EMAILS = new Set([
  "a.aldughairi@sanam-holding.com",
  "aldughairi@gmail.com",
]);

export const PERSONAL_GREETING = "لأنك مختلف، أنت تقود.";

export function personalGreetingFor(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  return PERSONAL_GREETING_EMAILS.has(email.trim().toLowerCase()) ? PERSONAL_GREETING : undefined;
}

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

/** Monthly trend series — keys match the reports API payload. */
export const TREND_SERIES_LABELS = {
  created: "مُنشأة",
  closed: "مُغلقة",
} as const;

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

export const SIGNUP_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مُعتمد",
  REJECTED: "مرفوض",
};

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "معلقة",
  ACCEPTED: "مقبولة",
  EXPIRED: "منتهية",
  REVOKED: "ملغاة",
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TICKET_CREATED: "تذكرة جديدة",
  INFO_REQUESTED: "طلب معلومات",
  TICKET_APPROVED: "اعتماد",
  TICKET_REJECTED: "رفض",
  TICKET_ASSIGNED: "إسناد",
  STATUS_CHANGED: "تغيير الحالة",
  COMMENT_ADDED: "تعليق",
  DEADLINE_APPROACHING: "اقتراب التسليم",
  TICKET_DELAYED: "تأخير",
  EXECUTION_COMPLETED: "اكتمال التنفيذ",
  CLOSURE_APPROVAL_REQUESTED: "اعتماد الإغلاق",
  TASK_ASSIGNED: "مهمة جديدة",
};

/** Empty-state labels for <select> / Select triggers. */
export const SELECT_PLACEHOLDERS = {
  developer: "اختر المطور",
  manager: "اختر المدير",
  company: "اختر الشركة",
  system: "اختر النظام",
  role: "اختر الدور",
  ticketType: "اختر نوع الطلب",
  priority: "اختر الأولوية",
  commentVisibility: "اختر نوع التعليق",
} as const;

/** Badge tint per role — the "who is talking" chip beside a comment author. */
export const ROLE_COLORS: Record<string, string> = {
  TICKET_REQUESTER: "#64748B",
  SYSTEM_OWNER: "#0D9488",
  PROGRAMMING_HEAD: "#4F46E5",
  PROJECT_MANAGER: "#8B5CF6",
  DEVELOPER: "#0EA5E9",
  QA: "#F59E0B",
  SENIOR_MANAGEMENT: "#E11D48",
};

/** Arabic copy for the comment thread and its composer. */
export const COMMENT_LABELS = {
  sectionTitle: "التعليقات",
  empty: "لا توجد تعليقات بعد",
  emptyHint: "ابدأ النقاش — اكتب @ لذكر زميل",
  emptyFilter: "لا توجد تعليقات في هذا التصنيف",
  placeholder: "اكتب تعليقك…",
  editPlaceholder: "عدّل تعليقك…",
  send: "إرسال",
  save: "حفظ",
  cancel: "إلغاء",
  edit: "تعديل",
  delete: "حذف",
  edited: "مُعدَّل",
  attach: "مرفق",
  mention: "ذكر",
  internal: "داخلي",
  public: "عام",
  visibility: "نوع التعليق",
  internalHint: "هذا التعليق يظهر لفريق البرمجة فقط",
  filterAll: "الكل",
  filterMentions: "ذُكرت",
  you: "أنت",
  mentionedYou: "ذُكرت هنا",
  deleteConfirm: "حذف التعليق نهائياً؟",
  posting: "جارٍ نشر التعليق…",
  saving: "جارٍ حفظ التعديل…",
  uploading: "جارٍ رفع المرفقات",
  refreshing: "جارٍ التحديث…",
  dirHint: "Ctrl + Shift لتبديل اتجاه الكتابة",
  dropHere: "أفلت الملفات هنا",
  noMentionMatch: "لا يوجد مستخدم مطابق",
  menuMove: "تنقّل",
  menuPick: "اختيار",
  menuClose: "إغلاق",
  today: "اليوم",
  yesterday: "أمس",
} as const;

/** Writing direction of the comment editor; `auto` follows the first letter typed. */
export const EDITOR_DIRECTION_LABELS: Record<string, string> = {
  auto: "تلقائي",
  rtl: "من اليمين",
  ltr: "من اليسار",
};

/** Markdown editor and renderer — toolbar, slash menu, and the syntax cheatsheet. */
export const MARKDOWN_LABELS = {
  write: "تحرير",
  preview: "معاينة",
  previewEmpty: "لا يوجد شيء لعرضه بعد",
  supported: "يدعم Markdown",
  help: "دليل التنسيق",
  toolbar: "أدوات التنسيق",
  direction: "اتجاه الكتابة",
  bold: "عريض",
  italic: "مائل",
  strike: "يتوسطه خط",
  code: "كود سطري",
  codeBlock: "كتلة كود",
  link: "رابط",
  image: "صورة",
  heading: "عنوان",
  heading1: "عنوان رئيسي",
  heading2: "عنوان فرعي",
  heading3: "عنوان صغير",
  bulletList: "قائمة نقطية",
  numberList: "قائمة مرقّمة",
  taskList: "قائمة مهام",
  quote: "اقتباس",
  table: "جدول",
  divider: "فاصل",
  slashHint: "اكتب / لإدراج عنصر",
  slashEmpty: "لا يوجد عنصر مطابق",
  words: "كلمة",
  chars: "حرف",
  copy: "نسخ",
  copied: "تم النسخ",
  copyCode: "نسخ الكود",
  plainCode: "كود",
  linkPlaceholder: "https://",
  tableHeader: "العمود",
  tableCell: "قيمة",
} as const;

/** One row of the cheatsheet: what to type, and what it turns into. */
export const MARKDOWN_CHEATSHEET: { syntax: string; label: string }[] = [
  { syntax: "# عنوان", label: "عنوان" },
  { syntax: "**نص**", label: "عريض" },
  { syntax: "*نص*", label: "مائل" },
  { syntax: "~~نص~~", label: "يتوسطه خط" },
  { syntax: "- عنصر", label: "قائمة نقطية" },
  { syntax: "1. عنصر", label: "قائمة مرقّمة" },
  { syntax: "- [ ] مهمة", label: "قائمة مهام" },
  { syntax: "> اقتباس", label: "اقتباس" },
  { syntax: "`كود`", label: "كود سطري" },
  { syntax: "```sql", label: "كتلة كود" },
  { syntax: "[نص](رابط)", label: "رابط" },
  { syntax: "![وصف](رابط)", label: "صورة" },
  { syntax: "| عمود |", label: "جدول" },
  { syntax: "---", label: "فاصل" },
];
