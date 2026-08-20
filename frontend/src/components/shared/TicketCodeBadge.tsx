"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatTicketCode } from "@/lib/utils";

export function TicketCodeBadge({
  ticketNumber,
}: {
  ticketNumber?: number | null;
}) {
  const code = formatTicketCode(ticketNumber);
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("تم نسخ رقم التذكرة");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذر نسخ رقم التذكرة");
    }
  };

  return (
    <button
      type="button"
      dir="ltr"
      onClick={copy}
      title="نسخ الرقم"
      className="brm-ticket-code inline-flex h-6 shrink-0 items-center gap-1 rounded-full border-0 px-2.5 text-xs font-brm font-semibold leading-4 transition-all"
    >
      {code}
      {copied
        ? <Check className="w-2.5 h-2.5" />
        : <Copy className="w-2.5 h-2.5 opacity-50" />}
    </button>
  );
}
