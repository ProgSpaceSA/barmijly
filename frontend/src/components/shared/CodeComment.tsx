import type { ReactNode } from "react";

/** Keeps `//` on the left of mixed Arabic/English labels without flipping the parent RTL layout. */
export function CodeComment({ children }: { children: ReactNode }) {
  return (
    <span className="ltr-isolate inline-block">
      <span>{"// "}</span>
      <span dir="auto">{children}</span>
    </span>
  );
}
