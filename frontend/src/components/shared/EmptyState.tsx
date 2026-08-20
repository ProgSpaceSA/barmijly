"use client";
import { Button } from "@/components/ui/button";
import { CodeComment } from "@/components/shared/CodeComment";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  command?: string;
}

export function EmptyState({ title, description, action, command }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="font-brm text-sm mb-2 inline-flex items-center gap-2 ltr-isolate"
        style={{ color: "var(--muted-foreground)" }}
      >
        <span style={{ color: "#22C55E" }}>$</span>
        <span>{command ?? title}</span>
        <span
          className="inline-block w-[1ch] h-[1em] bg-current"
          style={{ animation: "pulse-signal 1s step-end infinite" }}
        />
      </div>
      {description && (
        <p
          className="font-brm text-xs mt-1 mb-6"
          style={{ color: "var(--muted-foreground)", opacity: 0.6 }}
        >
          <CodeComment>{description}</CodeComment>
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm" className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}
