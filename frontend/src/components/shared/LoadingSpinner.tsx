"use client";

import { cn } from "@/lib/utils";

/** Full-page spinner — AppShell auth gate only, never for page data. */
export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center h-48 ${className ?? ""}`}>
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--background)" }}>
      <div className="text-center">
        <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>loading...</p>
      </div>
    </div>
  );
}

function Bone({ className }: { className?: string }) {
  return <span className={cn("skeleton max-w-full", className)} aria-hidden />;
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label="جارٍ التحميل" className={className}>
      {children}
    </div>
  );
}

const cardStyle = {
  background: "var(--card)",
  borderColor: "var(--border)",
} as const;

/** Ticket list card — fluid widths so it does not overflow on a phone. */
export function SkeletonCard() {
  return (
    <div
      className="rounded-xl flex overflow-hidden min-w-0"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="w-1 shrink-0 self-stretch skeleton rounded-none" />
      <div className="flex-1 min-w-0 p-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          <Bone className="h-5 w-16 inline-block" />
          <Bone className="h-5 w-12 inline-block" />
          <Bone className="h-5 w-14 hidden sm:inline-block" />
        </div>
        <Bone className="h-4 w-3/4 mb-2 block" />
        <div className="flex gap-3 flex-wrap">
          <Bone className="h-3 w-20 inline-block" />
          <Bone className="h-3 w-24 hidden sm:inline-block" />
          <Bone className="h-3 w-16 inline-block" />
        </div>
      </div>
    </div>
  );
}

/** Invitation / signup / company row. */
export function SkeletonPersonCard() {
  return (
    <div
      className="rounded-xl flex overflow-hidden min-w-0"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="w-1 shrink-0 self-stretch skeleton rounded-none" />
      <div className="flex-1 min-w-0 p-4 flex items-center gap-3 flex-wrap">
        <Bone className="w-9 h-9 rounded-full shrink-0 inline-block" />
        <div className="min-w-0 flex-1">
          <Bone className="h-4 w-1/3 max-w-40 mb-1.5 block" />
          <Bone className="h-3 w-1/2 max-w-56 block" />
        </div>
        <Bone className="h-6 w-16 rounded-full hidden sm:inline-block shrink-0" />
      </div>
    </div>
  );
}

function SkeletonNotificationRow({ bordered }: { bordered?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 min-w-0"
      style={{ borderTop: bordered ? "1px solid var(--border)" : undefined }}
    >
      <Bone className="w-8 h-8 rounded-lg shrink-0 inline-block" />
      <div className="min-w-0 flex-1">
        <Bone className="h-3.5 w-2/3 mb-1.5 block" />
        <Bone className="h-3 w-1/2 block" />
      </div>
      <Bone className="h-3 w-12 shrink-0 hidden sm:inline-block" />
    </div>
  );
}

export type SkeletonListVariant = "tickets" | "people" | "rows";

export function SkeletonList({
  count = 5,
  variant = "tickets",
}: {
  count?: number;
  variant?: SkeletonListVariant;
}) {
  if (variant === "rows") {
    const perGroup = Math.max(2, Math.ceil(count / 2));
    return (
      <Frame className="space-y-4">
        {[0, 1].map((g) => (
          <section key={g}>
            <Bone className="h-3 w-16 mb-1.5 block" />
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)", background: "var(--card)" }}
            >
              {Array.from({ length: perGroup }).map((_, i) => (
                <SkeletonNotificationRow key={i} bordered={i > 0} />
              ))}
            </div>
          </section>
        ))}
      </Frame>
    );
  }

  const Item = variant === "people" ? SkeletonPersonCard : SkeletonCard;
  return (
    <Frame>
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <Item key={i} />
        ))}
      </div>
    </Frame>
  );
}

export function SkeletonStat() {
  return (
    <div className="rounded-xl border p-3 min-w-0 sm:p-4" style={cardStyle}>
      <Bone className="h-3 w-20 max-w-full mb-4 block" />
      <Bone className="h-8 w-12 max-w-full mb-2 block" />
      <Bone className="h-3 w-16 max-w-full hidden sm:block" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="rounded-xl border p-4 min-w-0" style={cardStyle}>
      <Bone className="h-4 w-32 max-w-[70%] mb-2 block" />
      <Bone className="h-3 w-40 max-w-[80%] mb-4 block" />
      <Bone className="h-[160px] w-full rounded-lg block sm:h-[200px]" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Frame className="brm-table-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-right sm:px-6">
                <Bone className="h-3 w-16 inline-block" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderTop: r === 0 ? undefined : "1px solid var(--border)" }}>
              <td className="px-4 py-3.5 sm:px-6">
                <div className="flex items-center gap-3 min-w-0">
                  <Bone className="w-9 h-9 rounded-full shrink-0 inline-block" />
                  <div className="min-w-0 flex-1">
                    <Bone className="h-3.5 w-28 max-w-full mb-1.5 block" />
                    <Bone className="h-3 w-36 max-w-[80%] block" />
                  </div>
                </div>
              </td>
              {Array.from({ length: cols - 1 }).map((_, c) => (
                <td key={c} className="px-4 py-3.5 sm:px-6">
                  <Bone className="h-3 w-20 max-w-full inline-block" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}

export function SkeletonTicketDetail() {
  return (
    <Frame className="max-w-4xl">
      <Bone className="h-4 w-16 mb-5 block" />
      <div className="flex gap-2 mb-3 flex-wrap">
        <Bone className="h-6 w-20 rounded-full inline-block" />
        <Bone className="h-6 w-16 rounded-full inline-block" />
        <Bone className="h-6 w-14 rounded-full inline-block" />
      </div>
      <Bone className="h-6 w-3/4 mb-6 block sm:h-7" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,56rem)_18rem] lg:justify-start">
        <div className="space-y-4 min-w-0">
          <div className="rounded-xl border p-4 sm:p-5" style={cardStyle}>
            <Bone className="h-4 w-24 mb-4 block" />
            <Bone className="h-3 w-full mb-2 block" />
            <Bone className="h-3 w-5/6 mb-2 block" />
            <Bone className="h-3 w-2/3 block" />
          </div>
          <div className="rounded-xl border p-4 sm:p-5" style={cardStyle}>
            <Bone className="h-4 w-20 mb-4 block" />
            <Bone className="h-3 w-full mb-2 block" />
            <Bone className="h-3 w-4/5 block" />
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          <div className="rounded-xl border p-4" style={cardStyle}>
            <Bone className="h-4 w-20 mb-3 block" />
            <Bone className="h-3 w-full mb-2 block" />
            <Bone className="h-3 w-3/4 block" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function SkeletonProfile() {
  return (
    <Frame className="space-y-6">
      <div className="rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-start gap-4">
          <Bone className="w-16 h-16 rounded-2xl shrink-0 inline-block" />
          <div className="flex-1 basis-48 min-w-0">
            <Bone className="h-5 w-40 max-w-full mb-2 block" />
            <Bone className="h-3 w-56 max-w-full block" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
    </Frame>
  );
}

export function SkeletonDashboard({
  showStats = true,
  showCharts = false,
}: {
  showStats?: boolean;
  showCharts?: boolean;
}) {
  return (
    <Frame className="space-y-5">
      {showStats && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStat key={i} />
          ))}
        </div>
      )}
      {showCharts && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      )}
    </Frame>
  );
}

export function SkeletonReports() {
  return (
    <Frame className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </Frame>
  );
}
