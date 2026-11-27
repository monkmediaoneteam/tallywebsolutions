/**
 * Admin chrome, redesigned after the Metis admin template: fixed top bar with search, a 240px sidebar,
 * and a page header with title, subtitle and actions. Styles live in src/styles/admin-metis.css (scoped to .admin-metis).
 * Client-safe: nothing here uses browser APIs.
 */
import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell, ChartNoAxesColumn, FolderTree, HardDrive, Image, Layers, LayoutDashboard, LayoutList, LogOut,
  Package, Palette, Search, Settings2, ShoppingBag, Store, Tag, Truck, Users, Download,
} from "lucide-react";
import { STORE } from "@/lib/store";

export type AdminSection = "overview" | "analytics" | "orders" | "books" | "offers" | "categories" | "authors" | "collections" | "banners" | "seo" | "modules" | "homepage" | "theme" | "reviews" | "delivery" | "storage";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
const nav: { key: AdminSection; label: string; href: string; icon: Icon; group: "Store" | "Content" | "Platform" }[] = [
  { key: "overview", label: "Dashboard", href: "/admin", icon: LayoutDashboard, group: "Store" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics", icon: ChartNoAxesColumn, group: "Store" },
  { key: "orders", label: "Orders", href: "/admin/orders", icon: ShoppingBag, group: "Store" },
  { key: "books", label: "Products", href: "/admin/products", icon: Package, group: "Store" },
  { key: "offers", label: "Offers", href: "/admin/offers", icon: Tag, group: "Store" },
  { key: "categories", label: "Categories", href: "/admin/categories", icon: FolderTree, group: "Store" },
  { key: "collections", label: "Bundles", href: "/admin/platform/collections", icon: Layers, group: "Content" },
  { key: "banners", label: "Banners", href: "/admin/banners", icon: Image, group: "Content" },
  { key: "seo", label: "SEO", href: "/admin/seo", icon: Search, group: "Content" },
  { key: "homepage", label: "Homepage sections", href: "/admin/homepage", icon: LayoutList, group: "Content" },
  { key: "theme", label: "Theme", href: "/admin/theme", icon: Palette, group: "Content" },
  { key: "modules", label: "Advanced content", href: "/admin/platform/modules", icon: Settings2, group: "Content" },
  { key: "delivery", label: "Delivery recovery", href: "/admin/platform/delivery", icon: Truck, group: "Platform" },
  { key: "storage", label: "Storage", href: "/admin/storage", icon: HardDrive, group: "Platform" },
];
const GROUPS = ["Store", "Content", "Platform"] as const;

export default function AdminShell({
  active,
  title,
  subtitle,
  actions,
  children,
}: {
  active: AdminSection;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-metis">
      <header className="am-header">
        <div className="am-brand">
          <span className="am-brand-mark" aria-hidden="true">{STORE.name.slice(0, 1)}</span>
          <span>{STORE.name}</span>
        </div>
        <form className="am-search" role="search" action="/admin/products" method="get">
          <Search size={16} aria-hidden="true" />
          <label className="sr-only" htmlFor="am-search-input">Search admin</label>
          <input id="am-search-input" name="q" type="search" placeholder="Search admin..." />
          <span className="am-kbd" aria-hidden="true">⌘K</span>
        </form>
        <div className="am-header-end">
          <a className="round-btn" href="/" aria-label="View storefront" title="View storefront"><Store size={16} aria-hidden="true" /></a>
          <span className="round-btn" aria-hidden="true" title="Notifications"><Bell size={16} /></span>
          <form action="/api/reader/sign-out" method="post">
            <button type="submit" className="am-user" title="Sign out"><span className="am-avatar" aria-hidden="true">A</span><span>Admin</span><LogOut size={14} aria-hidden="true" /></button>
          </form>
        </div>
      </header>

      <div className="am-shell">
        <aside className="am-sidebar">
          <nav aria-label="Admin">
            {GROUPS.map((group) => (
              <div key={group}>
                {group !== "Store" && <p className="am-nav-label">{group}</p>}
                <ul className="am-nav">
                  {nav.filter((n) => n.group === group).map((n) => {
                    const Icon = n.icon;
                    return (
                      <li key={n.key}>
                        <Link href={n.href} aria-current={active === n.key ? "page" : undefined}>
                          <Icon size={18} strokeWidth={1.75} aria-hidden={true} />
                          {n.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="am-nav-label">Export</p>
            <ul className="am-nav">
              <li>
                <a href="/api/admin/export"><Download size={18} strokeWidth={1.75} aria-hidden={true} />Export orders (CSV)</a>
              </li>
              <li>
                <a href="/"><Users size={18} strokeWidth={1.75} aria-hidden={true} />View storefront</a>
              </li>
            </ul>
          </nav>
        </aside>

        <main className="am-main min-w-0">
          <div className="am-page-head">
            <div>
              <h1 className="am-page-title">{title}</h1>
              {subtitle && <p className="am-page-sub">{subtitle}</p>}
            </div>
            {actions && <div className="am-page-actions">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
