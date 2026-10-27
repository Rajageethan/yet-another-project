"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/today", label: "Today", match: ["/today", "/session"] },
  { href: "/progress", label: "Progress", match: ["/progress"] },
  { href: "/history", label: "History", match: ["/history"] },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-auto gap-1">
      {LINKS.map((l) => {
        const active = l.match.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 ${
              active ? "font-medium text-ink shadow-[inset_0_-2px_0_var(--color-ink)]" : "text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
