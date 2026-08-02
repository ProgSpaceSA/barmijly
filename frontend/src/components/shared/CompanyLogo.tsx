"use client";

const FILE_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace("/api", "");

const SIZE = {
  xs:  { box: "w-5 h-5",   text: "text-[10px]", radius: "rounded-md" },
  sm:  { box: "w-7 h-7",   text: "text-xs",     radius: "rounded-lg" },
  md:  { box: "w-9 h-9",   text: "text-sm",     radius: "rounded-xl" },
  lg:  { box: "w-12 h-12", text: "text-base",   radius: "rounded-xl" },
};

export function CompanyLogo({
  company,
  size = "md",
  className = "",
}: {
  company: { name: string; logoUrl?: string | null };
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  if (company.logoUrl) {
    return (
      <img
        src={`${FILE_BASE}${company.logoUrl}`}
        alt={company.name}
        className={`${s.box} ${s.radius} object-cover shrink-0 ${className}`}
        style={{ border: "1px solid var(--border)" }}
      />
    );
  }
  const initials = company.name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className={`${s.box} ${s.radius} ${s.text} flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{ background: "rgba(79,70,229,0.12)", color: "#818CF8" }}
    >
      {initials}
    </div>
  );
}
