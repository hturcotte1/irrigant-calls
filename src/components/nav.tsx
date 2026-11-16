"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Call list" },
  { href: "/follow-up", label: "To follow up" },
  { href: "/ai", label: "AI caller" },
  { href: "/script", label: "Script" },
];

export function NavLinks({ followUps, aiOn }: { followUps: number; aiOn: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/contacts") : path.startsWith(href));
  return (
    <nav aria-label="Main" className="-mx-1 flex gap-0.5 overflow-x-auto sm:gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium sm:gap-2 sm:px-3 ${active(l.href) ? "bg-white/15 text-white" : "text-field-100 hover:bg-white/10 hover:text-white"}`}
        >
          {l.label}
          {l.href === "/follow-up" && followUps > 0 ? (
            <span className="rounded-full bg-amber-300 px-1.5 text-xs font-bold text-amber-950">{followUps}</span>
          ) : null}
          {l.href === "/ai" ? <span className={`size-2 rounded-full ${aiOn ? "bg-lime-300" : "bg-stone-400"}`} title={aiOn ? "On" : "Off"} /> : null}
        </Link>
      ))}
    </nav>
  );
}
