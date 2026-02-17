"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Sales from "./modules/Sales";
import Speed from "./modules/Speed";
import SPPDashboard from "./modules/SPPDashboard";
import CCCommissionsOverview from "./modules/CCCommissionsOverview";
import Payfile from "./modules/Payfile";
import Advances from "./modules/Advances";
import UserManagement from "./modules/UserManagement";
import Payroll from "./modules/Payroll";
import OrgChart from "./modules/OrgChart";
import RepPortal from "./modules/RepPortal";       // ← NEW
import { useAuth } from "@/lib/useAuth";
import LoginPage from "./LoginPage";
import ChangePasswordPage from "./ChangePasswordPage";
import { supabase } from "@/lib/supabaseClient";

type MenuKey = "sales" | "speed" | "spp" | "cc_commissions" | "payfile" | "advances" | "user_management" | "cc_payroll" | "org_chart" | "rep_portal";

type MenuItem = { key: MenuKey; label: string; group: string; icon: string };

const MENUS: MenuItem[] = [
  { key: "sales",           label: "Sales",                   group: "Operations", icon: "📊" },
  { key: "speed",           label: "Speed",                   group: "Operations", icon: "⚡" },
  { key: "rep_portal",     label: "Sales Rep Portal",        group: "Operations", icon: "💎" },  // ← NEW
  { key: "spp",             label: "SPP Dashboard",           group: "Dashboards", icon: "📈" },
  { key: "cc_commissions",  label: "CC Commissions Overview", group: "Dashboards", icon: "💰" },
  { key: "payfile",         label: "Pay File Generation",     group: "Finance",    icon: "📄" },
  { key: "advances",        label: "Advances",                group: "Finance",    icon: "💵" },
  { key: "user_management", label: "User Management",         group: "Admin",      icon: "👥" },
  { key: "cc_payroll",      label: "Payroll",                 group: "Finance",    icon: "🗓️" },
  { key: "org_chart",       label: "Org Chart",               group: "Admin",      icon: "🏢" },
];

export default function FidelioShellPage() {
  const { user, loading, signOut } = useAuth();
  const [active, setActive] = useState<MenuKey>("sales");
  const [collapsed, setCollapsed] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [portalUserId, setPortalUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) { setMustChangePassword(null); return; }
    supabase
      .from("portal_users")
      .select("id, must_change_password")
      .eq("email", user.email)
      .single()
      .then(({ data }) => {
        setMustChangePassword(data?.must_change_password ?? false);
        setPortalUserId(data?.id ?? null);
      });
  }, [user?.email]);

  const grouped = useMemo(() => {
    const m = new Map<string, MenuItem[]>();
    for (const item of MENUS) m.set(item.group, [...(m.get(item.group) ?? []), item]);
    return Array.from(m.entries());
  }, []);

  const activeItem = MENUS.find(m => m.key === active)!;

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (mustChangePassword === true && portalUserId) {
    return (
      <ChangePasswordPage
        userEmail={user.email ?? ""}
        portalUserId={portalUserId}
        onPasswordChanged={() => setMustChangePassword(false)}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-100 text-slate-800 flex flex-col overflow-hidden">

      {/* ═══ TOP BAR ═══ */}
      <header className="flex-shrink-0 h-16 flex items-center justify-between px-5 border-b border-slate-200 bg-white shadow-sm z-40">
        <div className="flex items-center gap-3.5">
          <Image src="/logo.png" alt="Nova NRG" width={40} height={40} className="rounded-md" unoptimized priority />
          <div className="leading-tight">
            <div className="text-[17px] font-bold tracking-wide text-slate-800">NOVA NRG PORTAL</div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Accounting Workspace</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-400">
            Active: <span className="text-slate-700 font-semibold">{activeItem.label}</span>
          </div>
          <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
            {user.email}
          </div>
          <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] text-slate-500 font-semibold">
            {user.email?.charAt(0).toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══ SIDEBAR ═══ */}
        <aside
          className="flex-shrink-0 flex flex-col border-r border-slate-200 bg-white overflow-hidden"
          style={{
            width: collapsed ? 56 : 240,
            transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Sidebar header */}
          <div className="flex-shrink-0 flex items-center h-11 border-b border-slate-200"
            style={{ justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? "0" : "0 12px" }}>
            {!collapsed && (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 overflow-hidden whitespace-nowrap">Navigator</span>
            )}
            <button
              onClick={() => setCollapsed(v => !v)}
              className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={collapsed ? "Expand menu" : "Collapse menu"}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-200" style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}>
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Menu items */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
            {grouped.map(([group, items]) => (
              <div key={group} className="mb-1.5">
                {/* Group label */}
                <div className="overflow-hidden whitespace-nowrap h-6 flex items-end px-2 mb-0.5"
                  style={{ opacity: collapsed ? 0 : 1, height: collapsed ? 4 : 24, transition: "opacity 150ms, height 200ms" }}>
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{group}</span>
                </div>

                <div className="space-y-0.5">
                  {items.map(it => {
                    const isActive = it.key === active;
                    return (
                      <button
                        key={it.key}
                        onClick={() => setActive(it.key)}
                        title={it.label}
                        type="button"
                        className={[
                          "w-full flex items-center gap-2.5 rounded-lg h-9 text-[13px] font-medium transition-all duration-150 relative",
                          collapsed ? "px-0 justify-center" : "px-2.5 justify-start",
                          isActive
                            ? "bg-slate-100 text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-slate-800 transition-all" />
                        )}

                        {/* Icon */}
                        <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[12px] transition-colors duration-150 ${isActive ? "bg-slate-200/60" : ""}`}>
                          {it.icon}
                        </span>

                        {/* Label */}
                        <span
                          className="truncate whitespace-nowrap"
                          style={{
                            opacity: collapsed ? 0 : 1,
                            width: collapsed ? 0 : "auto",
                            transition: "opacity 150ms, width 200ms",
                          }}
                        >
                          {it.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="flex-shrink-0 border-t border-slate-200 px-2 py-2 overflow-hidden whitespace-nowrap space-y-1.5">
            <button
              onClick={signOut}
              title="Sign out"
              type="button"
              className={[
                "w-full flex items-center gap-2.5 rounded-lg h-9 text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors",
                collapsed ? "px-0 justify-center" : "px-2.5 justify-start",
              ].join(" ")}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : "auto", transition: "opacity 150ms, width 200ms" }}>
                Sign Out
              </span>
            </button>
            <div style={{ opacity: collapsed ? 0 : 1, transition: "opacity 150ms" }}>
              <div className="text-[9px] text-slate-300 leading-tight px-2.5">Nova NRG Portal v2.0</div>
            </div>
          </div>
        </aside>

        {/* ═══ WORKSPACE ═══ */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-gray-100">
          <div className="p-2">
            <div className="rounded-xl bg-white text-slate-800 overflow-hidden shadow-sm border border-slate-200/60">
              {active === "sales" ? <Sales />
                : active === "speed" ? <Speed />
                : active === "spp" ? <SPPDashboard />
                : active === "cc_commissions" ? <CCCommissionsOverview />
                : active === "payfile" ? <Payfile />
                : active === "advances" ? <Advances />
                : active === "user_management" ? <UserManagement />
                : active === "cc_payroll" ? <Payroll />
                : active === "org_chart" ? <OrgChart />
                : active === "rep_portal" ? <RepPortal />
                : <div className="p-6 text-gray-400">Select a module</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
