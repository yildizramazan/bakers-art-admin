"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface OfficeNavigationItem {
  readonly href: string;
  readonly label: string;
}

export function OfficeNavigation({ items }: Readonly<{ items: readonly OfficeNavigationItem[] }>) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary">
      {items.map((item) => {
        const current = item.href === "/office"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link href={item.href} aria-current={current ? "page" : undefined} key={item.href}>{item.label}</Link>;
      })}
    </nav>
  );
}

