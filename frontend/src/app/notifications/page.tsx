"use client";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Bell, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import Link from "next/link";

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAllRead } = useMarkAllRead();

  return (
    <AppShell>
      <PageHeader
        title="الإشعارات"
        action={
          <Button variant="outline" size="sm" onClick={() => markAllRead()}>
            <CheckCheck className="w-4 h-4 ml-2" /> قراءة الكل
          </Button>
        }
      />

      {isLoading ? <LoadingSpinner /> : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="w-12 h-12 mb-4 opacity-30" />
          <p>لا توجد إشعارات</p>
        </div>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {data.map((n: any) => (
            <Card key={n.id} className={cn(!n.isRead && "border-primary/30 bg-primary/5")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {format(new Date(n.createdAt), "d MMM yyyy - HH:mm", { locale: ar })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {n.ticketId && (
                      <Link href={`/tickets/${n.ticketId}`}>
                        <Button variant="ghost" size="sm" className="text-xs h-7">عرض</Button>
                      </Link>
                    )}
                    {!n.isRead && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => markRead(n.id)}>
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
