"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Sales from "./modules/Sales";
import SpeedPipeline from "./modules/SpeedPipeline";
import PayfileExport from "./modules/PayfileExport";
import Advances from "./modules/Advances";
import UserPermissions from "./modules/UserPermissions";
import Payroll from "./modules/Payroll";
import OrgChart from "./modules/OrgChart";
import PricingRedline from "./modules/PricingRedline";
import CommissionsEngine from "./modules/CommissionsEngine";
import CEODashboard from "./modules/CEODashboard";
import REPDashboard from "./modules/REPDashboard";
import ManagerDashboard from "./modules/ManagerDashboard";
import CashflowDashboard from "./modules/CashflowDashboard";
import AuditLogs from "./modules/AuditLogs";
import Integrations from "./modules/Integrations";
import { useAuth } from "@/lib/useAuth";
import LoginPage from "./LoginPage";
import ChangePasswordPage from "./ChangePasswordPage";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type MenuKey =
  | "sales" | "pricing_redline" | "commissions_engine"
  | "ceo_dashboard" | "rep_dashboard" | "manager_dashboard"
  | "speed_pipeline" | "cashflow_dashboard"
  | "advances" | "payroll" | "payfile_export"
  | "user_permissions" | "org_chart" | "audit_logs" | "integrations";

type MenuItem = { key: MenuKey; label: string; group: string; icon: (active: boolean) => ReactNode };

/* ═══════════════════ SVG ICON HELPER ═══════════════════ */

const I = ({ d, active }: { d: string; active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke={active ? "#ffffff" : "#64748b"} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/* ═══════════════════ MENU DEFINITION ═══════════════════ */

const MENUS: MenuItem[] = [
  { key: "sales",               label: "Sales / Deals",            group: "Sales & Pricing",
    icon: (a) => <I d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" active={a} /> },
  { key: "pricing_redline",     label: "Pricing / Redline Engine", group: "Sales & Pricing",
    icon: (a) => <I d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" active={a} /> },
  { key: "commissions_engine",  label: "Commission Engine",        group: "Sales & Pricing",
    icon: (a) => <I d="M9 7h6M9 11h6M9 15h4M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" active={a} /> },

  { key: "ceo_dashboard",       label: "CEO Dashboard",            group: "Dashboards",
    icon: (a) => <I d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-4 0h4" active={a} /> },
  { key: "rep_dashboard",       label: "Rep Dashboard",            group: "Dashboards",
    icon: (a) => <I d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" active={a} /> },
  { key: "manager_dashboard",   label: "Manager Dashboard",        group: "Dashboards",
    icon: (a) => <I d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M9 20H4v-2a3 3 0 0 1 5.356-1.857M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" active={a} /> },

  { key: "speed_pipeline",      label: "Speed / Pipeline",         group: "Analytics",
    icon: (a) => <I d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" active={a} /> },
  { key: "cashflow_dashboard",  label: "Cashflow Dashboard",       group: "Analytics",
    icon: (a) => <I d="M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-12v2m0 16v-2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" active={a} /> },

  { key: "advances",            label: "Advances Tracker",         group: "Finance",
    icon: (a) => <I d="M19 14l-7 7m0 0l-7-7m7 7V3" active={a} /> },
  { key: "payroll",             label: "Payroll",                  group: "Finance",
    icon: (a) => <I d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" active={a} /> },
  { key: "payfile_export",      label: "Payfile Export",           group: "Finance",
    icon: (a) => <I d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" active={a} /> },

  { key: "user_permissions",    label: "Users & Permissions",      group: "Administration",
    icon: (a) => <I d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197" active={a} /> },
  { key: "org_chart",           label: "Organizational Chart",     group: "Administration",
    icon: (a) => <I d="M9 17V7m0 10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m0 10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m0 10V7m0 10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2" active={a} /> },
  { key: "audit_logs",          label: "Audit Logs",               group: "Administration",
    icon: (a) => <I d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" active={a} /> },
  { key: "integrations",        label: "Integrations",             group: "Administration",
    icon: (a) => <I d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" active={a} /> },
];

/* ═══════════════════ MAIN ═══════════════════ */

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

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 tracking-wide">Loading...</span>
        </div>
      </div>
    );
  }

  /* ── Auth gates ── */
  if (!user) return <LoginPage />;

  if (mustChangePassword === true && portalUserId) {
    return (
      <ChangePasswordPage
        userEmail={user.email ?? ""}
        portalUserId={portalUserId}
        onPasswordChanged={() => setMustChangePassword(false)}
      />
    );
  }

  /* ── Shell ── */
  return (
    <div className="h-screen w-screen bg-slate-100 text-slate-800 flex flex-col overflow-hidden">

      {/* ═══ HEADER ═══ */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-6 bg-slate-950 shadow-lg z-40">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Nova NRG" width={36} height={36} className="rounded-lg" unoptimized priority />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-wide text-white">Nova NRG Portal</div>
            <div className="text-[9px] text-slate-500 font-medium tracking-widest uppercase">Accounting Workspace</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-slate-300 font-medium">{activeItem.label}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-slate-400 truncate max-w-[160px] hidden md:block">
              {user.email}
            </span>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-600 flex items-center justify-center text-[11px] text-white font-semibold shadow-inner">
              {user.email?.charAt(0).toUpperCase() ?? "U"}
            </div>
          </div>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══ SIDEBAR ═══ */}
        <aside
          className="flex-shrink-0 flex flex-col border-r border-slate-200 bg-white overflow-hidden"
          style={{
            width: collapsed ? 60 : 260,
            transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Sidebar header — collapse toggle */}
          <div
            className="flex-shrink-0 flex items-center h-11 border-b border-slate-100"
            style={{ justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? "0" : "0 20px" }}
          >
            {!collapsed && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 select-none">
                Modules
              </span>
            )}
            <button
              onClick={() => setCollapsed(v => !v)}
              className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={collapsed ? "Expand menu" : "Collapse menu"}
              type="button"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
                className="transition-transform duration-200"
                style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}>
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Menu items */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3">
            {grouped.map(([group, items]) => (
              <div key={group} className="mb-2">
                {/* Group label */}
                <div
                  className="overflow-hidden whitespace-nowrap flex items-end mb-1"
                  style={{
                    opacity: collapsed ? 0 : 1,
                    height: collapsed ? 0 : 22,
                    paddingLeft: collapsed ? 0 : 12,
                    transition: "opacity 150ms, height 200ms, padding 200ms",
                  }}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    {group}
                  </span>
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
                          "w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 relative group",
                          collapsed ? "h-10 px-0 justify-center" : "h-9 pl-4 pr-3 justify-start",
                          isActive
                            ? "bg-slate-900 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {/* Icon */}
                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                          {it.icon(isActive)}
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
          <div className="flex-shrink-0 border-t border-slate-100 px-3 py-3 space-y-2">
            <button
              onClick={signOut}
              title="Sign out"
              type="button"
              className={[
                "w-full flex items-center gap-3 rounded-lg h-9 text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors",
                collapsed ? "px-0 justify-center" : "pl-4 pr-3 justify-start",
              ].join(" ")}
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
              <div className="text-[9px] text-slate-300 leading-tight pl-4">Nova NRG Portal v3.0</div>
            </div>
          </div>
        </aside>

        {/* ═══ WORKSPACE ═══ */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-slate-50">
          <div className="p-3">
            <div className="rounded-xl bg-white text-slate-800 overflow-hidden shadow-sm border border-slate-200/60">
              {active === "sales" ? <Sales />
                : active === "pricing_redline" ? <PricingRedline />
                : active === "commissions_engine" ? <CommissionsEngine />
                : active === "ceo_dashboard" ? <CEODashboard />
                : active === "rep_dashboard" ? <REPDashboard />
                : active === "manager_dashboard" ? <ManagerDashboard />
                : active === "speed_pipeline" ? <SpeedPipeline />
                : active === "cashflow_dashboard" ? <CashflowDashboard />
                : active === "advances" ? <Advances />
                : active === "payroll" ? <Payroll />
                : active === "payfile_export" ? <PayfileExport />
                : active === "user_permissions" ? <UserPermissions />
                : active === "org_chart" ? <OrgChart />
                : active === "audit_logs" ? <AuditLogs />
                : active === "integrations" ? <Integrations />
                : <div className="p-6 text-slate-400">Select a module</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
