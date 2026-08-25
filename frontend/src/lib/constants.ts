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
  BLOCKED: "متوقفة",
  ON_HOLD: "معلقة",
};

/** Read out beside the sidebar notification count, which is hidden as digits. */
export const NAV_UNREAD_LABEL = "إشعار غير مقروء";

/** Tickets list — assignment filter (ticket assigned to me, or a task assigned to me). */
export const TICKET_MINE_LABEL = "تذاكري";

function arabicDays(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return "أيام";
  return "يوماً";
}

function relativePhrase(
  n: number,
  one: string,
  two: string,
  few: string,
  many: string,
): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** Remaining / overdue copy for a task or ticket due date. */
export const DUE_REMAINING_LABELS = {
  field: "المتبقي",
  today: "اليوم",
  tomorrow: "غداً",
  remaining: (n: number) => (n <= 2 ? `متبقي ${arabicDays(n)}` : `متبقي ${n} ${arabicDays(n)}`),
  overdue: (n: number) => (n <= 2 ? `متأخر ${arabicDays(n)}` : `متأخر ${n} ${arabicDays(n)}`),
} as const;

/** Elapsed / remaining wall-clock copy. Uses exact counts — no "approximately". */
export const RELATIVE_TIME_LABELS = {
  lessThanMinute: "أقل من دقيقة",
  minutes: (n: number) => relativePhrase(n, "دقيقة", "دقيقتين", "دقائق", "دقيقة"),
  hours: (n: number) => relativePhrase(n, "ساعة", "ساعتين", "ساعات", "ساعة"),
  days: (n: number) => relativePhrase(n, "يوم", "يومين", "أيام", "يوماً"),
  ago: (phrase: string) => `منذ ${phrase}`,
  ahead: (phrase: string) => `خلال ${phrase}`,
} as const;

/** Ticket task list — delete confirmation. */
export const TASK_LABELS = {
  dueDate: "تاريخ الاستحقاق",
  edit: "تعديل المهمة",
  editEstimate: "تعديل التقدير",
  save: "حفظ",
  saving: "جارٍ الحفظ...",
  delete: "حذف المهمة",
  deleteConfirm: "هل أنت متأكد من حذف هذه المهمة؟",
  deleteHint: "لا يمكن التراجع عن هذا الإجراء.",
  deleteAction: "حذف",
  cancel: "إلغاء",
  close: "إغلاق",
  createdBy: "أنشأها",
  assignedToMe: "مُكلف بها",
  devFinishedAt: "أنجزها",
  assigneeSync: "يُضاف المُكلَّف تلقائياً إلى فريق التذكرة",
} as const;

/** Ticket create — cover image and attachment pickers. */
export const FILE_PICK_LABELS = {
  coverEmpty: "اضغط أو اسحب لرفع صورة الغلاف",
  coverHint: "PNG, JPG — حد أقصى 10 MB",
  attachEmpty: "اضغط أو اسحب لإضافة مرفق",
  attachHint: "أي نوع ملف — حد أقصى 10 MB",
  creating: "جارٍ الإنشاء...",
  uploading: (current: number, total: number) => `جارٍ رفع الملفات ${current}/${total}...`,
} as const;

/**
 * The ticket activity feed. Every entry is an AuditLog row, so the copy is
 * keyed by its action.
 */
export const TIMELINE_LABELS = {
  section: "سجل النشاط",
  empty: "لا يوجد نشاط بعد",
  emptyFilter: "لا يوجد نشاط من هذا النوع",
  /** Verbs — the actor and subject names are rendered beside these. */
  CREATE: "أنشأ التذكرة",
  TICKET_CREATED: "أنشأ التذكرة",
  UPDATE: "عدّل بيانات التذكرة",
  STATUS_CHANGE: "غيّر الحالة",
  FORCE_STATUS: "غيّر الحالة يدوياً",
  ASSIGNEES_CHANGED: "حدّث فريق العمل",
  ASSIGNEE_ADD: "أضاف",
  ASSIGNEE_REMOVE: "أزال",
  LEAD_CHANGED: "عيّن",
  LEAD_CHANGED_SUFFIX: "قائداً للعمل",
  TASK_CREATE: "أضاف مهمة",
  TASK_UPDATE: "عدّل مهمة",
  TASK_STATUS_CHANGE: "غيّر حالة مهمة",
  TASK_DELETE: "حذف مهمة",
  DEPENDENCY_ADD: "أضاف علاقة",
  DEPENDENCY_REMOVE: "أزال علاقة",
  PLAN_UPDATED: "حدّث التخطيط",
  BUG_STATUS_CHANGE: "غيّر حالة الخطأ",
  BUG_PROMOTE: "أنشأ تذكرة من خطأ",
  BUG_UPDATE: "عدّل خطأ",
  BUG_CREATE: "سجّل خطأ",
  BUG_ARCHIVE: "أرشف خطأ",
  BUG_UNARCHIVE: "ألغى أرشفة خطأ",
  CASE_CREATE: "أنشأ حالة اختبار",
  CASE_UPDATE: "عدّل حالة اختبار",
  CASE_PUBLISH: "فعّل حالة اختبار",
  CASE_RESULT: "سجّل نتيجة اختبار",
  CASE_ARCHIVE: "أرشف حالة اختبار",
  CASE_DELETE: "حذف حالة اختبار",
  SUITE_CREATE: "أنشأ مجموعة اختبار",
  SUITE_UPDATE: "عدّل مجموعة اختبار",
  SUITE_PUBLISH: "نشر مجموعة اختبار",
  SUITE_ARCHIVE: "أرشف مجموعة اختبار",
  SUITE_UNARCHIVE: "ألغى أرشفة مجموعة",
  SUITE_TICKET_LINK: "ربط مجموعة اختبارات",
  SUITE_TICKET_UNLINK: "أزال ربط مجموعة اختبارات",
  /** Aliases kept for older audit rows. */
  TEST_CASE_RESULT: "سجّل نتيجة اختبار",
  TEST_CASE_UPDATE: "عدّل حالة اختبار",
  TEST_SUITE_LINK: "ربط مجموعة اختبارات",
  TEST_SUITE_UNLINK: "أزال ربط مجموعة اختبارات",
} as const;

/** Filter tabs for the activity feed — keyed by audit `action`. */
export const TIMELINE_FILTERS = {
  all: {
    label: "الكل",
    actions: null as readonly string[] | null,
  },
  status: {
    label: "الحالة",
    actions: [
      "CREATE",
      "TICKET_CREATED",
      "UPDATE",
      "STATUS_CHANGE",
      "FORCE_STATUS",
      "BUG_STATUS_CHANGE",
      "BUG_PROMOTE",
    ] as const,
  },
  assign: {
    label: "الإسناد",
    actions: ["ASSIGNEE_ADD", "ASSIGNEE_REMOVE", "LEAD_CHANGED", "ASSIGNEES_CHANGED"] as const,
  },
  tasks: {
    label: "المهام",
    actions: ["TASK_CREATE", "TASK_UPDATE", "TASK_STATUS_CHANGE", "TASK_DELETE"] as const,
  },
  relations: {
    label: "العلاقات",
    actions: ["DEPENDENCY_ADD", "DEPENDENCY_REMOVE"] as const,
  },
  plan: {
    label: "التخطيط",
    actions: ["PLAN_UPDATED"] as const,
  },
  qa: {
    label: "اختبارات",
    actions: [
      "BUG_CREATE",
      "BUG_UPDATE",
      "BUG_STATUS_CHANGE",
      "BUG_PROMOTE",
      "BUG_ARCHIVE",
      "BUG_UNARCHIVE",
      "CASE_CREATE",
      "CASE_UPDATE",
      "CASE_PUBLISH",
      "CASE_RESULT",
      "CASE_ARCHIVE",
      "CASE_DELETE",
      "SUITE_CREATE",
      "SUITE_UPDATE",
      "SUITE_PUBLISH",
      "SUITE_ARCHIVE",
      "SUITE_UNARCHIVE",
      "SUITE_TICKET_LINK",
      "SUITE_TICKET_UNLINK",
      "TEST_CASE_RESULT",
      "TEST_CASE_UPDATE",
      "TEST_SUITE_LINK",
      "TEST_SUITE_UNLINK",
    ] as const,
  },
} as const;

export type TimelineFilterKey = keyof typeof TIMELINE_FILTERS;

/** Ticket detail — force status confirmation. */
export const FORCE_STATUS_LABELS = {
  title: "تغيير الحالة",
  confirm: "هل أنت متأكد من تغيير حالة التذكرة؟",
  hint: "سيتم تجاوز مسار الاعتماد المعتاد.",
  action: "تأكيد",
  cancel: "إلغاء",
  close: "إغلاق",
} as const;

/** Ticket detail — sidebar action confirmation. */
export const TICKET_ACTION_CONFIRM = {
  cancel: "إلغاء",
  close: "إغلاق",
  action: "تأكيد",
  pending: "جارٍ التنفيذ...",
  notes: "ملاحظات (اختياري)",
  notesPlaceholder: "اكتب سبب القرار…",
  notesHint: "ستُنشر الملاحظات كتعليق على التذكرة",
  hint: "سيُحدَّث مسار التذكرة فوراً بعد التأكيد.",
  submit: { title: "إرسال للمراجعة", confirm: "هل أنت متأكد من إرسال التذكرة للمراجعة؟" },
  resubmit: { title: "إعادة الإرسال", confirm: "هل أنت متأكد من إعادة إرسال التذكرة للمراجعة؟" },
  approve: { title: "اعتماد", confirm: "هل أنت متأكد من اعتماد هذه التذكرة؟" },
  needsInfo: { title: "طلب معلومات", confirm: "هل أنت متأكد من طلب معلومات إضافية؟" },
  reject: { title: "رفض", confirm: "هل أنت متأكد من رفض هذه التذكرة؟", danger: true },
  assign: { title: "جدولة", confirm: "هل أنت متأكد من جدولة هذه التذكرة؟" },
  start: { title: "بدء العمل", confirm: "هل أنت متأكد من بدء العمل على هذه التذكرة؟" },
  submitForTesting: { title: "إرسال للاختبار", confirm: "هل أنت متأكد من إرسال التذكرة للاختبار؟" },
  approveCompletion: { title: "اعتماد الإكمال", confirm: "هل أنت متأكد من اعتماد إكمال هذه التذكرة؟" },
  requestChanges: { title: "طلب تعديلات", confirm: "هل أنت متأكد من إعادة التذكرة للتطوير؟", danger: true },
  closeTicket: { title: "إغلاق التذكرة", confirm: "هل أنت متأكد من إغلاق هذه التذكرة؟" },
  reopen: { title: "إعادة الفتح", confirm: "هل أنت متأكد من إعادة فتح هذه التذكرة؟" },
  archive: { title: "أرشفة", confirm: "هل أنت متأكد من أرشفة هذه التذكرة؟", danger: true },
  unarchive: { title: "إلغاء الأرشفة", confirm: "هل أنت متأكد من إلغاء أرشفة هذه التذكرة؟" },
  block: { title: "إيقاف التذكرة", confirm: "هل أنت متأكد من إيقاف العمل على هذه التذكرة؟", danger: true },
  hold: { title: "تعليق التذكرة", confirm: "هل أنت متأكد من تعليق هذه التذكرة؟", danger: true },
  resume: { title: "استئناف العمل", confirm: "هل أنت متأكد من استئناف العمل على هذه التذكرة؟" },
  setLead: { title: "تعيين قائد العمل", confirm: "هل أنت متأكد من تغيير قائد العمل؟" },
  removeAssignee: { title: "إزالة مطور", confirm: "هل أنت متأكد من إزالة هذا المطور من التذكرة؟", danger: true },
} as const;

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
  BLOCKED: "bg-rose-100 text-rose-700",
  ON_HOLD: "bg-slate-100 text-slate-600",
};

/** Task status. Previously hardcoded in the ticket page, the dashboard and the force-status grid. */
export const TASK_STATUS_LABELS: Record<string, string> = {
  NEW: "جديدة",
  IN_PROGRESS: "جارٍ",
  COMPLETED: "مكتملة",
};

export const TASK_STATUS_COLORS: Record<string, string> = {
  NEW: "#6B7280",
  IN_PROGRESS: "#D97706",
  COMPLETED: "#059669",
};

/** Difficulty 1–5 — the same scale on a ticket and on a task (req.md §9). */
export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "بسيطة",
  2: "سهلة",
  3: "متوسطة",
  4: "صعبة",
  5: "معقدة",
};

/** Estimation and time tracking. */
export const ESTIMATE_LABELS = {
  hours: "ساعات مقدّرة",
  hoursShort: (n: number) => `${n} س`,
  difficulty: "الصعوبة",
  planned: "التقدير المخطط",
  summaryTitle: "التقدير والوقت",
  fromPlan: "من التخطيط",
  fromTasks: "من المهام",
  fromTasksOpen: (n: number) => `${n} مهمة مفتوحة — المجموع من تقديراتها`,
  tasksOverride: "عند وجود مهام مُقدّرة، يُستخدم مجموعها في العرض والتقارير بدلاً من تخطيط التذكرة.",
  rollup: "مجموع تقدير المهام",
  rollupHint: "يُجمع من ساعات وصعوبة المهام عند وجودها، وإلا من التقدير المخطط عند الجدولة",
  actual: "الوقت الفعلي",
  actualHours: (n: number) => `${n} س`,
  started: "بدأ",
  completed: "اكتمل",
  completedAt: "تاريخ الإكمال",
  devFinishedTicket: "أُنجزت للاختبار",
  workStarted: "بدأ التنفيذ",
  workTimingSection: "أوقات التنفيذ",
  notStarted: "لم يبدأ بعد",
  weightTotal: "مجموع الصعوبة",
  none: "—",
} as const;

/** Ticket roster — several developers, one lead. */
export const ASSIGNEE_LABELS = {
  section: "فريق العمل",
  lead: "قائد العمل",
  leadHint: "قائد العمل وحده ينقل حالة التذكرة.",
  contributor: "مساهم",
  add: "إضافة مطور",
  remove: "إزالة",
  makeLead: "تعيين كقائد",
  empty: "لم يُسند أحد بعد",
  pick: "اختر مطوراً",
  scheduleHint: "أضف المطورين من فريق العمل، ثم حدّد موعد الجدولة أدناه",
  planSection: "التخطيط",
  estimateSection: "التقدير",
  planSaving: "جارٍ الحفظ...",
  planSaved: "تم الحفظ",
} as const;

/** Stopping and restarting a ticket. */
export const BLOCK_LABELS = {
  block: "إيقاف",
  hold: "تعليق",
  resume: "استئناف",
  reason: "السبب",
  reasonRequired: "السبب مطلوب",
  reasonPlaceholder: "لماذا توقف العمل؟",
  changesReasonPlaceholder: "ما التعديلات المطلوبة؟",
  blockedBanner: "التذكرة متوقفة",
  heldBanner: "التذكرة معلقة",
  blockedBy: "بسبب التذكرة",
  blockedByPick: "تذكرة تسبب التوقف (اختياري)",
  resumeTo: "ستعود التذكرة إلى الحالة التي توقفت عندها.",
} as const;

/** How two tickets relate. Only BLOCKS is a constraint — it gates `start`. */
export const DEPENDENCY_TYPE_LABELS: Record<string, string> = {
  BLOCKS: "تحجب",
  RELATES_TO: "مرتبطة بـ",
  DUPLICATES: "مكرّرة من",
};

/**
 * The relation picker, as one list rather than a direction and a kind chosen
 * separately. "blocks" and "is blocked by" are the same edge read from opposite
 * ends, and asking for them as two fields makes the reader do that translation.
 */
export const RELATION_OPTIONS = [
  { value: "blocked-by",   label: "تعتمد على",  direction: "blockedBy", type: "BLOCKS" },
  { value: "blocks",       label: "تحجب",       direction: "blocks",    type: "BLOCKS" },
  { value: "relates",      label: "مرتبطة بـ",  direction: "blocks",    type: "RELATES_TO" },
  { value: "duplicate-of", label: "مكرّرة من",  direction: "blockedBy", type: "DUPLICATES" },
  { value: "duplicated-by", label: "مكرّرة في", direction: "blocks",    type: "DUPLICATES" },
] as const;

export type RelationOptionValue = (typeof RELATION_OPTIONS)[number]["value"];

export const DEPENDENCY_LABELS = {
  section: "العلاقات",
  blockedBy: "تعتمد على",
  blocking: "تحجب",
  add: "إضافة علاقة",
  pick: "ابحث ضمن تذاكر النظام",
  remove: "إزالة العلاقة",
  removeConfirm: "هل أنت متأكد من إزالة هذه العلاقة؟",
  removeHint: "يمكن إعادة إضافتها لاحقاً.",
  removeAction: "إزالة",
  removing: "جارٍ الإزالة...",
  none: "لا توجد علاقات",
  unmet: "غير مكتملة",
  required: "مطلوبة",
  relation: "نوع العلاقة",
  noResults: "لا توجد نتائج في هذا النظام",
  emptySystem: "لا توجد تذاكر أخرى في هذا النظام",
  loading: "جارٍ التحميل...",
  searchHint: "اكتب للبحث عن تذكرة",
  unmetSubmitHint: "أكمل التذاكر المتطلَّبة أولاً",
  cancel: "إلغاء",
  close: "إغلاق",
  alreadyAdded: "هذه العلاقة مضافة مسبقاً",
} as const;

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
  BUG_ASSIGNED: "خطأ",
};

/** Heading shown on the notification row. Distinct from the type chip. */
export const NOTIFICATION_TITLES: Record<string, string> = {
  TICKET_CREATED: "تذكرة جديدة تنتظر المراجعة",
  INFO_REQUESTED: "طُلبت معلومات إضافية",
  TICKET_APPROVED: "تم اعتماد التذكرة",
  TICKET_REJECTED: "تم رفض التذكرة",
  TICKET_ASSIGNED: "أُسندت إليك تذكرة",
  STATUS_CHANGED: "تغيّرت حالة التذكرة",
  COMMENT_ADDED: "تعليق جديد على تذكرتك",
  DEADLINE_APPROACHING: "موعد التسليم يقترب",
  TICKET_DELAYED: "التذكرة متأخرة",
  EXECUTION_COMPLETED: "التذكرة جاهزة للاختبار",
  CLOSURE_APPROVAL_REQUESTED: "مطلوب اعتماد الإغلاق",
  TASK_ASSIGNED: "تم تكليفك بمهمة جديدة",
  BUG_ASSIGNED: "خطأ على تذكرتك",
};

/** English titles stored before in-app copy switched to Arabic. */
const LEGACY_ENGLISH_TITLES: Record<string, string> = {
  "You were mentioned in a comment": "تمت الإشارة إليك في تعليق",
  "New comment on your ticket": "تعليق جديد على تذكرتك",
  "New ticket assigned to you": "أُسندت إليك تذكرة",
  "Ticket ready for testing": "التذكرة جاهزة للاختبار",
  "Ticket approved": "تم اعتماد التذكرة",
  "Ticket rejected": "تم رفض التذكرة",
  "Ticket needs_info": "طُلبت معلومات إضافية",
  "Ticket convert_to_project": "تحويل التذكرة إلى مشروع",
};

export function notificationTitle(type: string, storedTitle: string): string {
  const legacy = LEGACY_ENGLISH_TITLES[storedTitle];
  if (legacy) return legacy;
  if (/[^\u0000-\u007F]/.test(storedTitle)) return storedTitle;
  return NOTIFICATION_TITLES[type] ?? storedTitle;
}

/** Empty-state labels for Select triggers — never pair with native `<select>`. */
export const SELECT_PLACEHOLDERS = {
  developer: "اختر المطور",
  manager: "اختر المدير",
  company: "اختر الشركة",
  system: "اختر النظام",
  role: "اختر الدور",
  ticketType: "اختر نوع الطلب",
  priority: "اختر الأولوية",
  difficulty: "اختر الصعوبة",
  relation: "اختر نوع العلاقة",
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

/** Authoring state of a suite or a case. Separate axis from the run result. */
export const TEST_STATE_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "منشورة",
  ARCHIVED: "مؤرشفة",
};

/** The last execution result of a case. */
export const TEST_RESULT_LABELS: Record<string, string> = {
  NOT_RUN: "لم يُنفَّذ",
  PASS: "نجح",
  FAIL: "فشل",
  BLOCKED: "محجوب",
  SKIPPED: "متخطى",
};

/** Impact, judged by whoever found the bug. Scheduling urgency is PRIORITY_LABELS. */
export const BUG_SEVERITY_LABELS: Record<string, string> = {
  BLOCKER: "مُعطِّل",
  CRITICAL: "حرج",
  MAJOR: "كبير",
  MINOR: "بسيط",
  TRIVIAL: "طفيف",
};

export const BUG_STATUS_LABELS: Record<string, string> = {
  OPEN: "مفتوح",
  IN_PROGRESS: "قيد الإصلاح",
  FIXED: "تم الإصلاح",
  VERIFIED: "تم التحقق",
  CLOSED: "مغلق",
  WONT_FIX: "لن يُصلَح",
  DUPLICATE: "مكرر",
};

/** Statuses that still cost somebody work — mirrors OPEN_BUG_STATUSES on the API. */
export const OPEN_BUG_STATUSES = ["OPEN", "IN_PROGRESS", "FIXED"] as const;

/** Resolved / no longer needing attention — used for list cues and icon color. */
export const RESOLVED_BUG_STATUSES = [
  "FIXED",
  "VERIFIED",
  "CLOSED",
  "WONT_FIX",
  "DUPLICATE",
] as const;

/** Icon / accent colour for a bug status (list rows, link dialogs). */
export function bugStatusColor(status: string): string {
  switch (status) {
    case "OPEN":
      return "#EF4444";
    case "IN_PROGRESS":
      return "#F59E0B";
    case "FIXED":
    case "VERIFIED":
      return "#10B981";
    case "CLOSED":
    case "WONT_FIX":
      return "#94A3B8";
    case "DUPLICATE":
      return "#8B5CF6";
    default:
      return "#EF4444";
  }
}

/** Every string on the QA surface: suites, cases, steps and bugs. */
export const TESTING_LABELS = {
  // nav + page chrome
  suitesTitle: "الاختبارات",
  suitesDescription: "مجموعات الاختبار وحالاتها",
  bugsTitle: "الأخطاء",
  newSuite: "مجموعة جديدة",
  newCase: "حالة اختبار جديدة",
  newBug: "تسجيل خطأ",
  back: "رجوع",
  suiteCount: "مجموعة",
  caseCount: "حالة اختبار",
  bugCount: "خطأ",
  searchSuites: "بحث في المجموعات...",
  searchBugs: "بحث في الأخطاء...",
  searchCases: "بحث في حالات الاختبار...",

  // filter rails
  filterAll: "الكل",
  filterState: "حالة المجموعة",
  filterHealth: "الجاهزية",
  filterOwner: "المالك",
  filterCompanies: "الشركات",
  filterSeverity: "الخطورة",
  filterStatus: "حالة الخطأ",
  filterLink: "الربط",
  filterAssignee: "الإسناد",
  filterArchived: "الأرشفة",
  filterSystem: "المشروع",
  filterSuite: "مجموعة الاختبارات",
  pickSystemFirst: "اختر مشروعاً أولاً",
  archivedOnly: "مؤرشفة فقط",
  activeOnly: "النشطة",
  mine: "المُسندة إليّ",
  minePlain: "أخطائي",
  healthFailing: "بها فشل",
  healthOpenBugs: "بها أخطاء",
  healthNotRun: "لم تُنفَّذ",
  hasTicket: "لها تذكرة",
  noTicket: "بلا تذكرة",

  // suite card + workspace
  passRate: "نسبة النجاح",
  lastRun: "آخر تنفيذ",
  neverRun: "لم تُنفَّذ بعد",
  owner: "المالك",
  linkedTickets: "التذاكر المرتبطة",
  linkTicket: "ربط بتذكرة",
  unlinkTicket: "إزالة الربط",
  unlinkConfirm: "إزالة ربط هذه التذكرة؟",
  publishSuite: "نشر المجموعة",
  archiveSuite: "أرشفة المجموعة",
  unarchiveSuite: "إلغاء أرشفة المجموعة",
  archiveConfirm: "أرشفة المجموعة؟ لا تُحذف، ويبقى سجلها.",
  suiteAttachments: "مرفقات المجموعة",
  collapseSuiteAttachments: "طي مرفقات المجموعة",
  expandSuiteAttachments: "توسيع مرفقات المجموعة",
  downloadAttachment: "تحميل",
  uploadingPercent: (n: number) => `جارٍ الرفع... ${n}%`,
  uploading: "جارٍ الرفع...",
  linkCaseNeedsSuite: "اربط الخطأ بمجموعة أولاً، أو اختر حالة من مجموعة النظام",

  // case panel + detail
  cases: "حالات الاختبار",
  noCases: "لا توجد حالات اختبار بعد",
  noCasesHint: "أضف أول حالة اختبار للمجموعة",
  addCase: "إضافة حالة اختبار",
  caseTitle: "عنوان حالة الاختبار",
  description: "الوصف",
  preconditions: "المتطلبات المسبقة",
  steps: "خطوات التنفيذ",
  reproSteps: "خطوات إعادة الإنتاج",
  expectedResult: "النتيجة المتوقعة",
  actualResult: "النتيجة الفعلية",
  attachments: "المرفقات",
  noAttachments: "لا توجد مرفقات",
  assignee: "المُسند إليه",
  assignCase: "إسناد حالة الاختبار",
  unassigned: "غير مسندة",
  linkedTicket: "التذكرة",
  runBy: "نفّذها",
  saveDraft: "حفظ ومتابعة",
  saveDraftHint: "يحفظ الخطأ ويبقي النموذج مفتوحاً للتعديل",
  publishCase: "تفعيل حالة الاختبار",
  deleteCase: "حذف حالة الاختبار",
  deleteCaseConfirm: "حذف حالة الاختبار هذه؟",
  archiveCaseConfirm: "أرشفة حالة الاختبار هذه؟ لا تُحذف، ويبقى سجلها.",
  recordResult: "تسجيل النتيجة",
  selectCase: "اختر حالة لعرض تفاصيلها",
  publishNeedsStep: "أضف خطوة تنفيذ واحدة على الأقل قبل النشر",

  // ordered step list
  addStep: "إضافة خطوة",
  stepPlaceholder: "اكتب الخطوة…",
  addScreenshot: "+ لقطة شاشة",
  deleteStep: "حذف الخطوة",
  deleteStepConfirm: "حذف الخطوة والمرفق؟",
  removeScreenshot: "إزالة اللقطة",
  removeScreenshotConfirm: "إزالة لقطة الشاشة من هذه الخطوة؟",
  screenshotAdded: "تمت إضافة اللقطة",
  uploadFailed: "تعذر رفع اللقطة",
  detachFailed: "تعذر حذف اللقطة",
  moveStepUp: "تحريك لأعلى",
  moveStepDown: "تحريك لأسفل",
  dragStep: "اسحب لإعادة الترتيب",
  noSteps: "لا توجد خطوات بعد",
  stepsAfterSave: "احفظ الخطأ أولاً لإضافة خطوات إعادة الإنتاج",

  // bugs
  bugs: "الأخطاء",
  noBugs: "لا توجد أخطاء",
  noBugsHint: "لم يُسجَّل أي خطأ بهذه الفلاتر",
  bugTitle: "عنوان الخطأ",
  bugDescription: "وصف الخطأ",
  expectedBehavior: "السلوك المتوقع",
  actualBehavior: "السلوك الفعلي",
  environment: "البيئة",
  severity: "الخطورة",
  status: "حالة الخطأ",
  reportedBy: "سجّله",
  detectedAt: "تاريخ الرصد",
  company: "الشركة",
  system: "النظام",
  fromCase: "من حالة الاختبار",
  clearCaseContext: "إزالة الربط بحالة الاختبار",
  promote: "إنشاء تذكرة",
  promoting: "جارٍ الإنشاء...",
  promoteHint: "تُنشأ التذكرة كمسودة وتمر بمسار الاعتماد المعتاد",
  promoteTitle: "إنشاء تذكرة من الخطأ",
  promoteTitleLabel: "عنوان التذكرة",
  promoteConfirm: "إنشاء التذكرة",
  promoted: "أُنشئت التذكرة",
  promoteOpenTicket: "فتح التذكرة",
  saveAndPromote: "حفظ وإنشاء تذكرة",
  bugLinkedToast: "تم ربط الخطأ بالتذكرة",
  bugCreatedToast: "تم تسجيل الخطأ",
  suiteTicketsLinked: "تم ربط التذكرة",
  suiteTicketUnlinked: "تم إزالة ربط التذكرة",
  caseTicketLinked: "تم ربط حالة الاختبار بالتذكرة",
  caseTicketCleared: "تم إزالة ربط حالة الاختبار بالتذكرة",
  suitePublished: "تم نشر المجموعة",
  suiteArchived: "تمت أرشفة المجموعة",
  suiteArchivedToast: "تمت أرشفة المجموعة",
  suiteUnarchivedToast: "تم إلغاء أرشفة المجموعة",
  caseCreatedToast: "تم إنشاء حالة الاختبار",
  casePublished: "تم تفعيل حالة الاختبار",
  caseArchived: "تمت أرشفة حالة الاختبار",
  selectSuiteTickets: "اختيار تذاكر المجموعة",
  selectCaseTicket: "تذكرة حالة الاختبار",
  clearCaseTicket: "بدون تذكرة",
  linkCase: "ربط بحالة اختبار",
  selectBugToLink: "اختر خطأً للربط",
  searchTickets: "بحث في التذاكر...",
  noTicketsInSystem: "لا توجد تذاكر في هذا النظام",
  noSuiteTickets: "لا توجد تذاكر مرتبطة بالمجموعة بعد",
  pickTicket: "اختر تذكرة",
  archiveBug: "أرشفة الخطأ",
  archiveBugConfirm: "أرشفة هذا الخطأ؟ لا يُحذف، ويبقى سجله.",
  unarchiveBug: "إلغاء أرشفة الخطأ",
  bugUnarchivedToast: "تم إلغاء أرشفة الخطأ",
  openBugs: "أخطاء مفتوحة",
  /** Status filter — matches the openCount stat (OPEN + IN_PROGRESS + FIXED). */
  filterOpenBugs: "تحتاج متابعة",
  openBugsHint: "مفتوح + قيد الإصلاح + تم الإصلاح",
  blockers: "مُعطِّلة",
  unpromoted: "بانتظار تذكرة",
  total: "الإجمالي",

  // ticket page section
  ticketSection: "الاختبارات والأخطاء",
  ticketSectionEmpty: "لا توجد اختبارات مرتبطة بهذه التذكرة",
  linkedSuites: "المجموعات المرتبطة",
  coveringCases: "حالات الاختبار المغطاة",
  filedBugs: "الأخطاء المسجّلة",
  linkSuiteFromTicket: "ربط بمجموعة اختبارات",
  linkBugToTicket: "ربط خطأ",
  linkBug: "ربط",
  openBugsAttention: "أخطاء مفتوحة تحتاج متابعة",
  failedCasesAttention: "حالات اختبار فاشلة",
  linkedTicketLabel: "التذكرة:",
  linkedCaseLabel: "حالة الاختبار:",
  linkedSuiteLabel: "مجموعة الاختبارات:",
  noSuitesInSystem: "لا توجد مجموعات اختبار في هذا النظام",
  alreadyLinked: "مرتبطة",
  unlinkSuite: "إزالة ربط المجموعة",
  unlinkCase: "إزالة ربط حالة الاختبار",
  unlinkBug: "إزالة ربط الخطأ",
  unlinkSuiteConfirm: "إزالة ربط هذه المجموعة من التذكرة؟",
  unlinkCaseConfirm: "إزالة ربط حالة الاختبار هذه من التذكرة؟",
  unlinkBugConfirm: "إزالة ربط هذا الخطأ من التذكرة؟",
  unlinkCaseFromBug: "إزالة الربط بحالة الاختبار",
  unlinkTicketFromBug: "إزالة الربط بالتذكرة",
  unlinkTicketFromBugConfirm: "إزالة ربط الخطأ بهذه التذكرة؟",
  unlinkCaseFromBugConfirm: "إزالة ربط الخطأ بحالة الاختبار هذه؟",

  // shared chrome
  save: "حفظ",
  saving: "جارٍ الحفظ...",
  saved: "تم الحفظ",
  cancel: "إلغاء",
  close: "إغلاق",
  delete: "حذف",
  confirm: "تأكيد",
  loading: "جارٍ التحميل...",
  readOnly: "للعرض فقط",
  copyCode: "نسخ الرقم",
  copiedCode: "تم نسخ الرقم",
  copyFailed: "تعذر نسخ الرقم",
  filterCases: "تصفية حالات الاختبار",
  expandBug: "توسيع الخطأ",
  collapseBug: "طي الخطأ",
  editBug: "تعديل الخطأ",
  edit: "تعديل",
  linkExistingBug: "ربط خطأ",
  linkToCase: "ربط بحالة اختبار",
  noBugsToLink: "لا توجد أخطاء متاحة للربط",
  noBugsToLinkHint: "يُعرض فقط أخطاء نفس النظام غير المرتبطة بهذه التذكرة. سجّل خطأً جديداً أو انقل خطأً من نظام آخر إن لزم.",
  bugLinkedToCase: "تم ربط الخطأ بحالة الاختبار",
  caseLinkedToBug: "تم ربط حالة الاختبار بالخطأ",
  archiveTitle: "أرشفة",
  deleteTitle: "حذف",
} as const;
