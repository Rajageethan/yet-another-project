import Link from "next/link";
import { FlameIcon, LogoIcon, SlidersIcon } from "./icons";
import { NavLinks } from "./NavLinks";

export function Logo({ href = "/today" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2.5 text-[15px] font-semibold text-ink no-underline">
      <span className="inline-flex size-7 items-center justify-center rounded-[7px] bg-ink text-white">
        <LogoIcon />
      </span>
      DSA Mentor
    </Link>
  );
}

export function AppHeader({ streak, name }: { streak: number; name: string | null }) {
  const initials =
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-6">
      <Logo />
      <NavLinks />
      <div className="flex items-center gap-2">
        <Link
          href="/progress"
          aria-label={`Current streak: ${streak} ${streak === 1 ? "day" : "days"}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 font-medium text-ink"
        >
          <FlameIcon className="text-flame" />
          {streak} {streak === 1 ? "day" : "days"}
        </Link>
        <Link href="/settings" aria-label="Settings" className="inline-flex size-11 items-center justify-center text-muted hover:text-ink">
          <SlidersIcon size={18} />
        </Link>
        <span
          aria-label={name ? `Signed in as ${name}` : "Signed in"}
          className="inline-flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong"
        >
          {initials}
        </span>
      </div>
    </header>
  );
}
