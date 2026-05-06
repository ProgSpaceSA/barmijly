"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { useTicket, useTicketAction, useAddComment } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TICKET_TYPE_LABELS, ROLE_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { ArrowRight, Send, Clock, User, Building2, Monitor, Lock } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: ticket, isLoading } = useTicket(id);
  const actions = useTicketAction(id);
  const { mutateAsync: addComment } = useAddComment(id);

  const [comment, setComment] = useState("");
  const [commentVisibility, setCommentVisibility] = useState("PUBLIC");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [closureNotes, setClosureNotes] = useState("");

  const isHead = user?.role === "PROGRAMMING_HEAD";
  const isManager = user?.role === "PROJECT_MANAGER" || isHead;
  const isDeveloper = user?.role === "DEVELOPER";
  const isQA = user?.role === "QA";
  const isRequester = user?.role === "TICKET_REQUESTER";

  const handleComment = async () => {
    if (!comment.trim()) return;
    await addComment({ content: comment, visibility: commentVisibility });
    setComment("");
  };

  if (isLoading) return <AppShell><LoadingSpinner /></AppShell>;
  if (!ticket) return <AppShell><p className="text-muted-foreground">التذكرة غير موجودة</p></AppShell>;

  return (
    <AppShell>
      <div className="max-w-4xl">
        <PageHeader
          title={ticket.title}
          action={<Button variant="ghost" onClick={() => router.back()}><ArrowRight className="w-4 h-4 ml-1" /> رجوع</Button>}
        />

        {/* Meta */}
        <div className="flex flex-wrap gap-2 mb-6">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
          <Badge variant="outline">{TICKET_TYPE_LABELS[ticket.type]}</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details */}
            <Card>
              <CardHeader><CardTitle className="text-base">تفاصيل الطلب</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div><p className="text-muted-foreground mb-1">الوصف</p><p className="whitespace-pre-wrap">{ticket.description}</p></div>
                <Separator />
                <div><p className="text-muted-foreground mb-1">السبب</p><p>{ticket.reason}</p></div>
                <Separator />
                <div><p className="text-muted-foreground mb-1">النتيجة المتوقعة</p><p>{ticket.expectedOutcome}</p></div>
                <Separator />
                <div><p className="text-muted-foreground mb-1">التأثير على العمل</p><p>{ticket.businessImpact}</p></div>
                {ticket.hasFinancialLoss && (
                  <><Separator /><div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-red-700 font-medium text-xs mb-1">⚠ يوجد ضرر مالي</p>
                    <p className="text-red-600 text-xs">{ticket.financialLossDetails}</p>
                  </div></>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            {ticket.statusHistory?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">سجل الحالات</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {ticket.statusHistory.map((h: any, i: number) => (
                      <div key={h.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                          {i < ticket.statusHistory.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                        </div>
                        <div className="pb-3 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {h.fromStatus && <StatusBadge status={h.fromStatus} />}
                            {h.fromStatus && <span className="text-muted-foreground">←</span>}
                            <StatusBadge status={h.toStatus} />
                          </div>
                          {h.reason && <p className="text-xs text-muted-foreground mt-1">{h.reason}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(h.createdAt), "d MMM yyyy - HH:mm", { locale: ar })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Comments */}
            <Card>
              <CardHeader><CardTitle className="text-base">التعليقات</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {ticket.comments?.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">لا توجد تعليقات بعد</p>}
                {ticket.comments?.map((c: any) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {c.author?.firstName?.[0]}{c.author?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{c.author?.firstName} {c.author?.lastName}</span>
                        {c.visibility === "INTERNAL" && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            <Lock className="w-3 h-3" /> داخلي
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "d MMM - HH:mm", { locale: ar })}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                    </div>
                  </div>
                ))}

                <Separator />
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Textarea value={comment} onChange={e => setComment(e.target.value)}
                      placeholder="اكتب تعليقك..." rows={3} className="flex-1" />
                  </div>
                  <div className="flex items-center justify-between">
                    {!isRequester && (
                      <Select value={commentVisibility} onValueChange={(v: string | null) => v && setCommentVisibility(v)}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PUBLIC">عام</SelectItem>
                          <SelectItem value="INTERNAL">داخلي</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button size="sm" onClick={handleComment} disabled={!comment.trim()}>
                      <Send className="w-4 h-4 ml-1" /> إرسال
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Info */}
            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" /><span>{ticket.creator?.firstName} {ticket.creator?.lastName}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4" /><span>{ticket.company?.name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Monitor className="w-4 h-4" /><span>{ticket.system?.name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" /><span>{format(new Date(ticket.createdAt), "d MMM yyyy", { locale: ar })}</span>
                </div>
                {ticket.estimatedDeadline && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>التسليم: {format(new Date(ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}</span>
                  </div>
                )}
                {ticket.assignments?.[0]?.developer && (
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {ticket.assignments[0].developer.firstName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-muted-foreground">{ticket.assignments[0].developer.firstName} {ticket.assignments[0].developer.lastName}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader><CardTitle className="text-sm">الإجراءات</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {ticket.status === "DRAFT" && ticket.creatorId === user?.id && (
                  <Button className="w-full" size="sm" onClick={() => actions.submit.mutate(undefined)}>
                    إرسال للمراجعة
                  </Button>
                )}
                {ticket.status === "NEW" && isHead && (
                  <div className="space-y-2">
                    <Textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} placeholder="ملاحظات (اختياري)" rows={2} />
                    <Button className="w-full" size="sm" onClick={() => actions.approve.mutate({ decision: "APPROVED", notes: approvalNotes })}>
                      اعتماد
                    </Button>
                    <Button variant="outline" className="w-full" size="sm" onClick={() => actions.approve.mutate({ decision: "NEEDS_INFO", notes: approvalNotes })}>
                      طلب معلومات
                    </Button>
                    <Button variant="destructive" className="w-full" size="sm" onClick={() => actions.approve.mutate({ decision: "REJECTED", notes: approvalNotes })}>
                      رفض
                    </Button>
                  </div>
                )}
                {ticket.status === "SCHEDULED" && isDeveloper && (
                  <Button className="w-full" size="sm" onClick={() => actions.startWork.mutate(undefined)}>بدء العمل</Button>
                )}
                {ticket.status === "IN_PROGRESS" && isDeveloper && (
                  <Button className="w-full" size="sm" onClick={() => actions.submitForTesting.mutate(undefined)}>إرسال للاختبار</Button>
                )}
                {(ticket.status === "AWAITING_TESTING" || ticket.status === "AWAITING_OWNER_APPROVAL") && (isQA || isRequester) && (
                  <Button className="w-full" size="sm" onClick={() => actions.approveCompletion.mutate(undefined)}>اعتماد الإكمال</Button>
                )}
                {ticket.status === "COMPLETED" && isManager && (
                  <div className="space-y-2">
                    <Textarea value={closureNotes} onChange={e => setClosureNotes(e.target.value)} placeholder="ملاحظات الإغلاق *" rows={2} />
                    <Button className="w-full" size="sm" onClick={() => actions.close.mutate({ closureNotes })} disabled={!closureNotes.trim()}>
                      إغلاق التذكرة
                    </Button>
                  </div>
                )}
                {["CLOSED", "REJECTED"].includes(ticket.status) && isManager && (
                  <Button variant="outline" className="w-full" size="sm" onClick={() => actions.reopen.mutate(undefined)}>إعادة الفتح</Button>
                )}
                {isManager && (
                  <Button variant="ghost" className="w-full text-muted-foreground" size="sm" onClick={() => actions.archive.mutate(undefined)}>
                    أرشفة
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
