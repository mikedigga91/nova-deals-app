"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type Role = {
  id: string;
  name: string;
  description: string | null;
  allowed_modules: string[];
  data_scope: "all" | "own" | "team" | "none";
  is_system: boolean;
};

type PortalUser = {
  id?: string;
  email: string;
  display_name: string;
  role_id: string | null;
  linked_name: string | null;
  module_overrides: string[] | null;
  data_scope_override: "all" | "own" | "team" | "none" | null;
  is_active: boolean;
  last_login: string | null;
  linked_employee_id: string | null;
  deactivation_source: string | null;
  auth_uid: string | null;
  must_change_password: boolean;
};

type OrgEmployee = {
  id: string;
  full_name: string;
  position: string;
  department: string;
  email: string;
  is_active: boolean;
};

/* ═══════════════════ CONSTANTS ═══════════════════ */

/** All modules in the portal — keep in sync with page.tsx MenuKey */
const ALL_MODULES: { key: string; label: string; group: string }[] = [
  { key: "sales", label: "Sales / Deals", group: "Sales & Pricing" },
  { key: "pricing_redline", label: "Pricing / Redline Engine", group: "Sales & Pricing" },
  { key: "commissions_engine", label: "Commission Engine", group: "Sales & Pricing" },
  { key: "ceo_dashboard", label: "CEO Dashboard", group: "Dashboards" },
  { key: "rep_dashboard", label: "Rep Dashboard", group: "Dashboards" },
  { key: "manager_dashboard", label: "Manager Dashboard", group: "Dashboards" },
  { key: "speed_pipeline", label: "Speed / Pipeline", group: "Analytics" },
  { key: "cashflow_dashboard", label: "Cashflow Dashboard", group: "Analytics" },
  { key: "advances", label: "Advances Tracker", group: "Finance" },
  { key: "payroll", label: "Payroll", group: "Finance" },
  { key: "payfile_export", label: "Payfile Export", group: "Finance" },
  { key: "user_permissions", label: "Users & Permissions", group: "Administration" },
  { key: "org_chart", label: "Organizational Chart", group: "Administration" },
  { key: "audit_logs", label: "Audit Logs", group: "Administration" },
  { key: "integrations", label: "Integrations", group: "Administration" },
];

const DATA_SCOPES: { value: string; label: string; desc: string }[] = [
  { value: "all", label: "All Data", desc: "Can see all records across all reps and companies" },
  { value: "own", label: "Own Data Only", desc: "Can only see records matching their linked name" },
  { value: "team", label: "Team Data", desc: "Can see own records + direct reports' records (org chart)" },
  { value: "none", label: "No Data", desc: "Cannot see any data unless explicitly overridden" },
];

/* ═══════════════════ HELPERS ═══════════════════ */

const scopeColor = (s: string) =>
  s === "all" ? "bg-emerald-100 text-emerald-700" :
  s === "own" ? "bg-blue-100 text-blue-700" :
  s === "team" ? "bg-purple-100 text-purple-700" :
  "bg-slate-100 text-slate-500";

async function adminAuthAction(action: string, payload: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch("/api/admin/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Admin auth action failed");
  return json;
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function UserPermissions() {
  const [tab, setTab] = useState<"users" | "roles">("users");

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">User Management</h2>
                <p className="text-xs text-slate-400">Manage portal users, roles & access control</p>
              </div>
            </div>
            <div className="flex gap-1">
              {(["users", "roles"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-5 py-2.5 text-xs font-semibold rounded-t-lg transition-colors ${tab === t ? "bg-slate-50 border border-b-0 border-slate-200 text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>
                  {t === "users" ? "Users" : "Roles"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {tab === "users" ? <UsersTab /> : <RolesTab />}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: USERS ═══════════════════ */

function UsersTab() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [repNames, setRepNames] = useState<string[]>([]);
  const [allEmployees, setAllEmployees] = useState<OrgEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<PortalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [userSubTab, setUserSubTab] = useState<"active" | "snr">("active");
  const [snrSearch, setSnrSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"active" | "snr">("active");
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importRole, setImportRole] = useState<string>("");
  const [importPassword, setImportPassword] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: r }, { data: reps }, { data: emps }] = await Promise.all([
      supabase.from("portal_users").select("*").order("display_name"),
      supabase.from("roles").select("*").order("name"),
      supabase.from("deals_view").select("sales_rep").not("sales_rep", "is", null),
      supabase.from("employees").select("id, full_name, position, department, email, is_active"),
    ]);
    if (u) setUsers(u as PortalUser[]);
    if (r) setRoles(r as Role[]);
    if (reps) setRepNames([...new Set(reps.map((d: any) => d.sales_rep).filter(Boolean))] as string[]);
    if (emps) setAllEmployees(emps as OrgEmployee[]);
    setLoading(false);
  }, []);

  const employeeMap = useMemo(() => new Map(allEmployees.map(e => [e.id, e])), [allEmployees]);

  // Employees that are active and not already linked to a portal user (available for linking)
  const availableEmployees = useMemo(() => {
    const linkedIds = new Set(users.map(u => u.linked_employee_id).filter(Boolean));
    return allEmployees.filter(e => e.is_active && !linkedIds.has(e.id));
  }, [allEmployees, users]);

  // Inactive employees not linked to any portal user (available for SNR import)
  const availableSnrEmployees = useMemo(() => {
    const linkedIds = new Set(users.map(u => u.linked_employee_id).filter(Boolean));
    return allEmployees.filter(e => !e.is_active && !linkedIds.has(e.id));
  }, [allEmployees, users]);

  const importEmployeeList = importMode === "snr" ? availableSnrEmployees : availableEmployees;

  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);

  const activeUsers = useMemo(() => users.filter(u => u.is_active), [users]);
  const snrUsers = useMemo(() => {
    const q = snrSearch.toLowerCase();
    return users.filter(u => !u.is_active)
      .filter(u => !snrSearch || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, snrSearch]);

  // Inactive org chart employees with no portal user — shown inline on SNR tab
  const snrOrgOnly = useMemo(() => {
    const q = snrSearch.toLowerCase();
    return availableSnrEmployees.filter(e =>
      !snrSearch || e.full_name.toLowerCase().includes(q) || (e.email || "").toLowerCase().includes(q)
        || (e.position || "").toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q)
    );
  }, [availableSnrEmployees, snrSearch]);

  // Position rank for sorting — lower = higher rank (CEO on top)
  const positionRank = useCallback((pos: string) => {
    const p = (pos || "").toLowerCase();
    if (p.includes("ceo")) return 0;
    if (p.includes("president")) return 1;
    if (p.includes("vp") || p.includes("vice president")) return 2;
    if (p.includes("director")) return 3;
    if (p.includes("manager")) return 4;
    if (p.includes("lead") || p.includes("supervisor")) return 5;
    if (p.includes("coordinator")) return 6;
    return 10;
  }, []);

  // Unified sorted SNR list: portal users + org-chart-only, sorted by position hierarchy
  type SnrRow = { kind: "portal"; user: PortalUser; emp?: OrgEmployee } | { kind: "orgonly"; emp: OrgEmployee };
  const snrCombined = useMemo(() => {
    const rows: SnrRow[] = [
      ...snrUsers.map(u => ({
        kind: "portal" as const,
        user: u,
        emp: u.linked_employee_id ? employeeMap.get(u.linked_employee_id) : undefined,
      })),
      ...snrOrgOnly.map(e => ({ kind: "orgonly" as const, emp: e })),
    ];
    rows.sort((a, b) => {
      const posA = a.kind === "portal" ? (a.emp?.position || "") : a.emp.position;
      const posB = b.kind === "portal" ? (b.emp?.position || "") : b.emp.position;
      const rA = positionRank(posA);
      const rB = positionRank(posB);
      if (rA !== rB) return rA - rB;
      const nameA = a.kind === "portal" ? a.user.display_name : a.emp.full_name;
      const nameB = b.kind === "portal" ? b.user.display_name : b.emp.full_name;
      return nameA.localeCompare(nameB);
    });
    return rows;
  }, [snrUsers, snrOrgOnly, employeeMap, positionRank]);

  const totalSnrCount = snrCombined.length;

  useEffect(() => { load(); }, [load]);

  const blankUser: PortalUser = {
    email: "", display_name: "", role_id: null, linked_name: null,
    module_overrides: null, data_scope_override: null, is_active: true, last_login: null,
    linked_employee_id: null, deactivation_source: null,
    auth_uid: null, must_change_password: false,
  };

  const getRoleForUser = (u: PortalUser): Role | undefined => u.role_id ? roleMap.get(u.role_id) : undefined;

  const getEffectiveModules = (u: PortalUser): string[] => {
    if (u.module_overrides) return u.module_overrides;
    const role = getRoleForUser(u);
    return role?.allowed_modules ?? [];
  };

  const getEffectiveScope = (u: PortalUser): string => {
    if (u.data_scope_override) return u.data_scope_override;
    const role = getRoleForUser(u);
    return role?.data_scope ?? "none";
  };

  async function saveUser() {
    if (!editUser) return;
    if (!editUser.email || !editUser.display_name) { setMsg("Email and name are required."); return; }
    setSaving(true); setMsg(null);

    // Clear deactivation_source when admin manually reactivates a user
    const deactivationSource = editUser.is_active ? null : editUser.deactivation_source;

    const payload: Record<string, any> = {
      email: editUser.email,
      display_name: editUser.display_name,
      role_id: editUser.role_id || null,
      linked_name: editUser.linked_name || null,
      module_overrides: editUser.module_overrides,
      data_scope_override: editUser.data_scope_override || null,
      is_active: editUser.is_active,
      linked_employee_id: editUser.linked_employee_id || null,
      deactivation_source: deactivationSource,
    };
    if (editUser.id) {
      // Updating existing user
      const { error } = await supabase.from("portal_users").update(payload).eq("id", editUser.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }

      // Detect is_active toggle → ban/unban
      const original = users.find(u => u.id === editUser.id);
      if (original && original.is_active !== editUser.is_active) {
        try {
          if (!editUser.is_active) {
            await adminAuthAction("ban", { portal_user_id: editUser.id });
          } else {
            await adminAuthAction("unban", { portal_user_id: editUser.id });
          }
        } catch {
          // Non-blocking — user may not have auth account
        }
      }
    } else {
      // Creating new user — get back the ID
      const { data: inserted, error } = await supabase.from("portal_users").insert(payload).select("id").single();
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }

      // Create auth account if password was provided
      if (inserted && newUserPassword) {
        try {
          await adminAuthAction("create", {
            portal_user_id: inserted.id,
            email: editUser.email,
            password: newUserPassword,
          });
        } catch (e: any) {
          setMsg(`User created but auth account failed: ${e.message}`);
          setNewUserPassword("");
          setSaving(false);
          load();
          return;
        }
      }
    }
    setNewUserPassword("");
    setEditUser(null); setSaving(false); load();
  }

  async function deleteUser(id: string) {
    await supabase.from("portal_users").delete().eq("id", id);
    setEditUser(null); load();
  }

  async function moveUserToSNR(user: PortalUser) {
    if (!user.id) return;
    // Deactivate portal user
    const { error } = await supabase.from("portal_users").update({
      is_active: false,
      deactivation_source: "usermgmt_snr",
    }).eq("id", user.id);
    if (error) { setMsg(`Error: ${error.message}`); return; }

    // Ban auth if exists
    if (user.auth_uid) {
      try { await adminAuthAction("ban", { portal_user_id: user.id }); } catch { /* non-blocking */ }
    }

    // Cascade to linked employee
    if (user.linked_employee_id) {
      await supabase.from("employees").update({
        is_active: false,
        snr_at: new Date().toISOString(),
        snr_reason: null,
      }).eq("id", user.linked_employee_id);
    }

    setEditUser(null);
    load();
  }

  async function reinstateUser(id: string) {
    // Reactivate portal user
    const { data: pu, error } = await supabase.from("portal_users")
      .update({ is_active: true, deactivation_source: null })
      .eq("id", id)
      .select("auth_uid, linked_employee_id")
      .single();
    if (error) { setMsg(`Error: ${error.message}`); return; }

    // Unban auth if exists
    if (pu?.auth_uid) {
      try { await adminAuthAction("unban", { portal_user_id: id }); } catch { /* non-blocking */ }
    }

    // Cascade to linked employee
    if (pu?.linked_employee_id) {
      await supabase.from("employees").update({
        is_active: true,
        snr_at: null,
        snr_reason: null,
      }).eq("id", pu.linked_employee_id);
    }

    setEditUser(null);
    load();
  }

  async function resetPassword(portalUserId: string) {
    const tempPw = prompt("Enter new temporary password (min 8 characters):");
    if (!tempPw) return;
    if (tempPw.length < 8) { setMsg("Password must be at least 8 characters."); return; }
    try {
      await adminAuthAction("reset-password", { portal_user_id: portalUserId, password: tempPw });
      setMsg("Password reset successfully. User will be prompted to change it on next login.");
      load();
    } catch (e: any) {
      setMsg(`Reset failed: ${e.message}`);
    }
  }

  /** Best-guess role based on department + position */
  function guessRoleForEmployee(emp: OrgEmployee): string | null {
    const dept = (emp.department || "").toLowerCase();
    const pos = (emp.position || "").toLowerCase();

    // Try exact match on role name first (role names like "Sales Rep", "Sales Manager", etc.)
    for (const r of roles) {
      if (r.name.toLowerCase() === pos) return r.id;
    }

    // Try matching by department + position keywords
    for (const r of roles) {
      const rn = r.name.toLowerCase();
      // If role name contains position keyword or vice versa
      if (pos && (rn.includes(pos) || pos.includes(rn))) return r.id;
    }

    // Try matching by department name to role name
    for (const r of roles) {
      const rn = r.name.toLowerCase();
      if (dept && (rn.includes(dept) || dept.includes(rn))) return r.id;
    }

    // Position-based heuristics
    if (pos.includes("ceo") || pos.includes("president") || pos.includes("vp")) {
      const exec = roles.find(r => r.name.toLowerCase().includes("admin") || r.name.toLowerCase().includes("executive") || r.data_scope === "all");
      if (exec) return exec.id;
    }
    if (pos.includes("manager") || pos.includes("director")) {
      const mgr = roles.find(r => r.name.toLowerCase().includes("manager") || r.data_scope === "team");
      if (mgr) return mgr.id;
    }
    if (pos.includes("rep") || pos.includes("closer") || pos.includes("setter")) {
      const rep = roles.find(r => r.name.toLowerCase().includes("rep") || r.data_scope === "own");
      if (rep) return rep.id;
    }

    return null;
  }

  /** Restore an org-chart-only SNR employee: reactivate in org chart + create portal user with auto-role */
  async function restoreEmployee(emp: OrgEmployee) {
    setMsg(null);

    // 1. Reactivate employee in org chart
    const { error: empErr } = await supabase.from("employees").update({
      is_active: true,
      snr_at: null,
      snr_reason: null,
    }).eq("id", emp.id);
    if (empErr) { setMsg(`Error reactivating employee: ${empErr.message}`); return; }

    // 2. Auto-detect role
    const roleId = guessRoleForEmployee(emp);

    // 3. Create portal user
    const { data: inserted, error: puErr } = await supabase.from("portal_users").insert({
      email: emp.email || "",
      display_name: emp.full_name,
      role_id: roleId,
      linked_employee_id: emp.id,
      is_active: true,
      linked_name: null,
      module_overrides: null,
      data_scope_override: null,
      deactivation_source: null,
    }).select("id").single();
    if (puErr) {
      // Rollback employee reactivation
      await supabase.from("employees").update({ is_active: false, snr_at: new Date().toISOString(), snr_reason: null }).eq("id", emp.id);
      setMsg(`Error creating portal user: ${puErr.message}`);
      return;
    }

    const roleName = roleId ? roles.find(r => r.id === roleId)?.name : null;
    setMsg(`Restored ${emp.full_name} → Active user${roleName ? ` with role "${roleName}"` : " (no role matched — assign one manually)"}`);
    load();
  }

  async function bulkImportEmployees() {
    const selected = importEmployeeList.filter(e => importSelected.has(e.id));
    if (selected.length === 0) return;
    const isSNR = importMode === "snr";
    setImporting(true);
    setImportProgress({ current: 0, total: selected.length });
    setImportResult(null);

    let created = 0;
    const failed: { name: string; error: string }[] = [];

    for (let i = 0; i < selected.length; i++) {
      const emp = selected[i];
      setImportProgress({ current: i + 1, total: selected.length });

      try {
        const payload: Record<string, any> = {
          email: emp.email,
          display_name: emp.full_name,
          role_id: importRole || null,
          linked_employee_id: emp.id,
          is_active: !isSNR,
          linked_name: null,
          module_overrides: null,
          data_scope_override: null,
          deactivation_source: isSNR ? "orgchart_snr" : null,
        };
        const { data: inserted, error } = await supabase.from("portal_users").insert(payload).select("id").single();
        if (error) { failed.push({ name: emp.full_name, error: error.message }); continue; }

        if (!isSNR && inserted && importPassword) {
          try {
            await adminAuthAction("create", {
              portal_user_id: inserted.id,
              email: emp.email,
              password: importPassword,
            });
          } catch (e: any) {
            failed.push({ name: emp.full_name, error: `User created but auth failed: ${e.message}` });
            created++;
            continue;
          }
        }
        created++;
      } catch (e: any) {
        failed.push({ name: emp.full_name, error: e.message || "Unknown error" });
      }
    }

    setImporting(false);
    setImportProgress(null);
    setImportResult({ created, failed });
    if (created > 0) load();
    if (failed.length === 0) {
      setMsg(`Successfully imported ${created} ${isSNR ? "SNR" : ""} user${created !== 1 ? "s" : ""} from Org Chart.`);
      setShowImport(false);
    }
  }

  const su = (k: keyof PortalUser, v: any) => setEditUser(p => p ? { ...p, [k]: v } : p);

  const toggleModule = (mod: string) => {
    if (!editUser) return;
    const current = editUser.module_overrides ?? getEffectiveModules(editUser);
    const next = current.includes(mod) ? current.filter(m => m !== mod) : [...current, mod];
    su("module_overrides", next);
  };

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading users…</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Manage portal users, assign roles, and control module access</p>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setUserSubTab("active")}
              className={`px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${userSubTab === "active" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              Active Users
            </button>
            <button onClick={() => setUserSubTab("snr")}
              className={`px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${userSubTab === "snr" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              SNR
              {totalSnrCount > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${userSubTab === "snr" ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-600"}`}>
                  {totalSnrCount}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={load}>↻ Refresh</button>
          {userSubTab === "active" && (
            <>
              <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 active:scale-[0.99] transition"
                onClick={() => { setImportMode("active"); setImportSelected(new Set()); setImportRole(""); setImportPassword(""); setImportResult(null); setShowImport(true); }}>
                Import from Org Chart
              </button>
              <button className="px-4 py-2 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold"
                onClick={() => { setNewUserPassword(""); setEditUser({ ...blankUser }); }}>+ Add User</button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Active Users — Card Grid ═══ */}
      {userSubTab === "active" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeUsers.map(u => {
            const role = getRoleForUser(u);
            const mods = getEffectiveModules(u);
            const scope = getEffectiveScope(u);
            const linkedEmp = u.linked_employee_id ? employeeMap.get(u.linked_employee_id) : undefined;
            return (
              <div key={u.id} onClick={() => setEditUser({ ...u })}
                className="group relative border rounded-xl p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                {/* X-to-SNR button */}
                <button
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-100 text-slate-400 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold z-10"
                  title="Move to SNR"
                  onClick={e => {
                    e.stopPropagation();
                    if (confirm(`Move ${u.display_name} to SNR (deactivate)?\n\nThis will disable portal access.${u.linked_employee_id ? "\nTheir linked employee will also be moved to SNR in the Org Chart." : ""}`)) {
                      moveUserToSNR(u);
                    }
                  }}
                >✕</button>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{u.display_name}</div>
                    <div className="text-[10px] text-slate-500">{u.email}</div>
                  </div>
                  <div className="flex gap-1.5 items-center flex-wrap justify-end">
                    {!u.auth_uid && (
                      <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-semibold">NO AUTH</span>
                    )}
                    {u.auth_uid && u.must_change_password && (
                      <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">PWD CHANGE</span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${scopeColor(scope)}`}>{scope.toUpperCase()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  <span className="text-[10px] bg-slate-800 text-white px-2 py-0.5 rounded font-semibold">{role?.name ?? "No Role"}</span>
                  {linkedEmp && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                      {linkedEmp.position}{linkedEmp.department ? ` · ${linkedEmp.department}` : ""}
                    </span>
                  )}
                  {u.linked_name && <span className="text-[10px] text-slate-500">→ {u.linked_name}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {mods.length === 0 ? <span className="text-[9px] text-slate-300 italic">No modules assigned</span> : (
                    mods.map(m => {
                      const mod = ALL_MODULES.find(am => am.key === m);
                      return <span key={m} className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">{mod?.label ?? m}</span>;
                    })
                  )}
                </div>
                {u.module_overrides && (
                  <div className="mt-1.5"><span className="text-[8px] text-amber-500 font-semibold uppercase">Custom overrides active</span></div>
                )}
              </div>
            );
          })}
          {activeUsers.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 text-sm">No active users. Click "+ Add User" to create one.</div>
          )}
        </div>
      )}

      {/* ═══ SNR Users — Table View ═══ */}
      {userSubTab === "snr" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500 font-medium">
              {totalSnrCount} inactive{totalSnrCount !== 1 ? "" : ""}{" "}
              <span className="text-slate-400">({snrUsers.length} portal user{snrUsers.length !== 1 ? "s" : ""}, {snrOrgOnly.length} org chart only)</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="border border-slate-200/70 rounded-lg px-3 py-1.5 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Search SNR…"
                value={snrSearch}
                onChange={e => setSnrSearch(e.target.value)}
              />
            </div>
          </div>
          {totalSnrCount === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No inactive users{snrSearch ? " matching your search" : ""}.</div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Position</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snrCombined.map(row => {
                    if (row.kind === "portal") {
                      const u = row.user;
                      const role = getRoleForUser(u);
                      const linkedEmp = row.emp;
                      const srcLabel =
                        u.deactivation_source === "orgchart_removed" ? "Org - Removed" :
                        u.deactivation_source === "orgchart_deactivated" ? "Org - Deactivated" :
                        u.deactivation_source === "orgchart_snr" ? "Org - SNR" :
                        u.deactivation_source === "usermgmt_snr" ? "User Mgmt" :
                        u.deactivation_source ?? "Manual";
                      return (
                        <tr key={u.id} className="hover:bg-slate-50 text-xs text-slate-700">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{u.display_name}</div>
                            {role && <span className="text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded font-semibold">{role.name}</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{u.email}</td>
                          <td className="px-4 py-3 text-slate-500">{linkedEmp?.position || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{linkedEmp?.department || "—"}</td>
                          <td className="px-4 py-3">
                            <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">{srcLabel}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                onClick={() => {
                                  if (confirm(`Reinstate ${u.display_name}?\n\nThis will restore portal access.${u.linked_employee_id ? "\nTheir linked employee will also be reinstated in the Org Chart." : ""}`)) {
                                    reinstateUser(u.id!);
                                  }
                                }}
                              >Reinstate</button>
                              <button
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                                onClick={() => setEditUser({ ...u })}
                              >Edit</button>
                              <button
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                                onClick={() => {
                                  if (confirm(`Permanently delete ${u.display_name}?\n\nThis action cannot be undone.`)) {
                                    deleteUser(u.id!);
                                  }
                                }}
                              >Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    } else {
                      const emp = row.emp;
                      return (
                        <tr key={`org-${emp.id}`} className="hover:bg-slate-50 text-xs text-slate-700 bg-slate-50/40">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{emp.full_name}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{emp.email || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{emp.position || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{emp.department || "—"}</td>
                          <td className="px-4 py-3">
                            <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">Org Chart Only</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                onClick={() => {
                                  const roleId = guessRoleForEmployee(emp);
                                  const roleName = roleId ? roles.find(r => r.id === roleId)?.name : null;
                                  if (confirm(`Restore ${emp.full_name}?\n\nThis will:\n• Reactivate them in the Org Chart\n• Create a portal user account\n• Auto-assign role: ${roleName || "None (assign manually)"}`)) {
                                    restoreEmployee(emp);
                                  }
                                }}
                              >Restore</button>
                              <button
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                                onClick={() => {
                                  setNewUserPassword("");
                                  setEditUser({
                                    ...blankUser,
                                    email: emp.email || "",
                                    display_name: emp.full_name,
                                    linked_employee_id: emp.id,
                                    is_active: false,
                                    deactivation_source: "orgchart_snr",
                                  });
                                }}
                              >Create User</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ Import from Org Chart Modal ═══ */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !importing && setShowImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" onClick={ev => ev.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div>
                <div className="text-sm font-semibold text-slate-900">{importMode === "snr" ? "Import SNR from Org Chart" : "Import from Org Chart"}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{importMode === "snr" ? "Select inactive employees to import as SNR portal users" : "Select active employees not yet linked to a portal user"}</div>
              </div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => !importing && setShowImport(false)} disabled={importing}>✕</button>
            </div>

            {/* Controls */}
            <div className="px-5 py-3 border-b border-slate-100 shrink-0 space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className={importMode === "snr" ? "flex-1" : "flex-1 min-w-[200px]"}>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Default Role</label>
                  <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={importRole} onChange={e => setImportRole(e.target.value)} disabled={importing}>
                    <option value="">No Role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                {importMode !== "snr" && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Temporary Password</label>
                    <input type="password" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={importPassword} onChange={e => setImportPassword(e.target.value)} placeholder="Leave blank for portal-only users" disabled={importing} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                    onClick={() => setImportSelected(new Set(importEmployeeList.map(e => e.id)))} disabled={importing}>
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    onClick={() => setImportSelected(new Set())} disabled={importing}>
                    Deselect All
                  </button>
                </div>
                <div className="text-[11px] font-semibold text-slate-500">
                  {importSelected.size} of {importEmployeeList.length} selected
                </div>
              </div>
            </div>

            {/* Employee list */}
            <div className="flex-1 overflow-y-auto px-5 py-2">
              {importEmployeeList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">{importMode === "snr" ? "All inactive employees are already linked to portal users." : "All active employees are already linked to portal users."}</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {importEmployeeList.map(emp => (
                    <label key={emp.id} className={`flex items-center gap-3 py-2.5 cursor-pointer hover:bg-slate-50 rounded px-2 -mx-2 ${importing ? "opacity-60 pointer-events-none" : ""}`}>
                      <input type="checkbox" checked={importSelected.has(emp.id)}
                        onChange={() => {
                          setImportSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id);
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" disabled={importing} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{emp.full_name}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {emp.position}{emp.department ? ` · ${emp.department}` : ""}{emp.email ? ` · ${emp.email}` : ""}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Import result (partial failure) */}
            {importResult && importResult.failed.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 shrink-0">
                <div className="text-xs font-semibold text-slate-900 mb-1">
                  Created {importResult.created} user{importResult.created !== 1 ? "s" : ""}. {importResult.failed.length} failed:
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {importResult.failed.map((f, i) => (
                    <div key={i} className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">
                      <span className="font-semibold">{f.name}:</span> {f.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl shrink-0">
              <div className="text-[11px] text-slate-500">
                {importProgress ? `Importing ${importProgress.current} of ${importProgress.total}…` : importMode === "snr" ? "Users will be imported as inactive (SNR)" : importPassword ? "Auth accounts will be created" : "Portal-only users (no login)"}
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                  onClick={() => setShowImport(false)} disabled={importing}>Cancel</button>
                <button className="px-5 py-2 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold disabled:opacity-50"
                  onClick={bulkImportEmployees} disabled={importing || importSelected.size === 0}>
                  {importing ? `Importing ${importProgress?.current ?? 0} of ${importProgress?.total ?? 0}…` : `Import ${importSelected.size} User${importSelected.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit/Create User Dialog ═══ */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editUser.id ? "Edit User" : "New User"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditUser(null)}>✕</button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Basic Info */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Basic Information</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Display Name</label>
                    <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editUser.display_name} onChange={e => su("display_name", e.target.value)} placeholder="e.g. Shakeem Jennings" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Email</label>
                    <input type="email" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editUser.email} onChange={e => su("email", e.target.value)} placeholder="user@company.com" />
                  </div>
                </div>
                {/* Password field for new users */}
                {!editUser.id && (
                  <div className="mt-3">
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Temporary Password</label>
                    <input type="password" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Min 8 characters (creates login account)" />
                    <p className="text-[9px] text-slate-400 mt-0.5">Leave blank to create user without login. User will be forced to change password on first login.</p>
                  </div>
                )}
              </div>

              {/* Role & Linking */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Role & Data Access</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Role</label>
                    <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editUser.role_id ?? ""} onChange={e => { su("role_id", e.target.value || null); su("module_overrides", null); su("data_scope_override", null); }}>
                      <option value="">No Role</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Linked Agent Name</label>
                    <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editUser.linked_name ?? ""} onChange={e => su("linked_name", e.target.value || null)}>
                      <option value="">None (manual entry below)</option>
                      {repNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {!editUser.linked_name && (
                      <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        value={editUser.linked_name ?? ""} onChange={e => su("linked_name", e.target.value || null)} placeholder="Or type name manually…" />
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Data Scope Override</label>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => su("data_scope_override", null)}
                      className={`text-[10px] px-3 py-1.5 rounded-lg border font-semibold transition-colors ${!editUser.data_scope_override ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                      Use Role Default ({getRoleForUser(editUser)?.data_scope ?? "none"})
                    </button>
                    {DATA_SCOPES.map(s => (
                      <button key={s.value} onClick={() => su("data_scope_override", s.value)}
                        className={`text-[10px] px-3 py-1.5 rounded-lg border font-semibold transition-colors ${editUser.data_scope_override === s.value ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {editUser.data_scope_override
                      ? DATA_SCOPES.find(s => s.value === editUser.data_scope_override)?.desc
                      : `Inherits from role: ${DATA_SCOPES.find(s => s.value === (getRoleForUser(editUser)?.data_scope ?? "none"))?.desc}`}
                  </p>
                </div>
              </div>

              {/* Org Chart Link */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Org Chart Link</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Linked Employee</label>
                    <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editUser.linked_employee_id ?? ""}
                      onChange={e => {
                        const empId = e.target.value || null;
                        su("linked_employee_id", empId);
                        // Auto-fill email and display_name when linking
                        if (empId) {
                          const emp = employeeMap.get(empId);
                          if (emp) {
                            if (!editUser.email && emp.email) su("email", emp.email);
                            if (!editUser.display_name && emp.full_name) su("display_name", emp.full_name);
                          }
                        }
                      }}>
                      <option value="">None (not linked)</option>
                      {/* Show the currently linked employee even if not in available list */}
                      {editUser.linked_employee_id && !availableEmployees.find(e => e.id === editUser.linked_employee_id) && (() => {
                        const emp = employeeMap.get(editUser.linked_employee_id!);
                        return emp ? <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.position} ({emp.department})</option> : null;
                      })()}
                      {availableEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.position} ({emp.department})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {(() => {
                      const emp = editUser.linked_employee_id ? employeeMap.get(editUser.linked_employee_id) : undefined;
                      if (!emp) return <div className="text-[10px] text-slate-400 pt-4">No employee linked</div>;
                      return (
                        <div className="border border-blue-200 bg-blue-50 rounded-lg p-2.5">
                          <div className="text-[11px] font-semibold text-blue-900">{emp.full_name}</div>
                          <div className="text-[10px] text-blue-700">{emp.position} · {emp.department}</div>
                          <div className="text-[10px] text-blue-600">{emp.email}</div>
                          <span className={`text-[9px] mt-1 inline-block px-1.5 py-0.5 rounded font-semibold ${emp.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                            {emp.is_active ? "Active in Org Chart" : "Inactive in Org Chart"}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {editUser.deactivation_source && (
                  <div className="mt-2 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <span className="font-bold">SNR Warning:</span>{" "}
                    {editUser.deactivation_source === "orgchart_removed"
                      ? "This user was automatically deactivated because their employee record was removed from the Org Chart."
                      : editUser.deactivation_source === "orgchart_snr"
                      ? "This user was automatically deactivated because their employee was moved to SNR in the Org Chart. You can reinstate them from the Org Chart SNR tab, or manually reactivate here."
                      : editUser.deactivation_source === "usermgmt_snr"
                      ? "This user was moved to SNR from User Management. Use the Reinstate button on the SNR tab to restore access."
                      : "This user was automatically deactivated because their employee was marked inactive in the Org Chart."}
                    {!["orgchart_snr", "usermgmt_snr"].includes(editUser.deactivation_source!) && " You can manually reactivate them by toggling the Active switch below."}
                  </div>
                )}
              </div>

              {/* Module Access Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Module Access</div>
                  {editUser.module_overrides && (
                    <button className="text-[9px] text-amber-600 font-semibold hover:underline"
                      onClick={() => su("module_overrides", null)}>Reset to Role Defaults</button>
                  )}
                </div>
                {editUser.module_overrides && (
                  <div className="text-[9px] text-amber-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
                    Custom overrides active — these modules override the role defaults. Click "Reset to Role Defaults" to revert.
                  </div>
                )}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {(() => {
                    const grouped = new Map<string, typeof ALL_MODULES>();
                    ALL_MODULES.forEach(m => {
                      if (!grouped.has(m.group)) grouped.set(m.group, []);
                      grouped.get(m.group)!.push(m);
                    });
                    const effective = editUser.module_overrides ?? (getRoleForUser(editUser)?.allowed_modules ?? []);
                    return Array.from(grouped.entries()).map(([group, mods], gi) => (
                      <div key={group}>
                        <div className={`px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 ${gi > 0 ? "border-t border-slate-200" : ""}`}>{group}</div>
                        {mods.map(m => {
                          const checked = effective.includes(m.key);
                          const fromRole = !editUser.module_overrides && checked;
                          return (
                            <label key={m.key} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer border-t border-slate-100">
                              <input type="checkbox" checked={checked} onChange={() => toggleModule(m.key)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                              <div className="flex-1">
                                <span className="text-xs font-medium text-slate-700">{m.label}</span>
                                {fromRole && <span className="text-[8px] text-slate-400 ml-2">(from role)</span>}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Authentication */}
              {editUser.id && (
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Authentication</div>
                  <div className="border border-slate-200 rounded-lg p-3">
                    {editUser.auth_uid ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">AUTH ACTIVE</span>
                          {editUser.must_change_password && (
                            <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold ml-1.5">PWD CHANGE PENDING</span>
                          )}
                        </div>
                        <button
                          className="px-3 py-1.5 text-[10px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          onClick={() => resetPassword(editUser.id!)}
                          type="button"
                        >
                          Reset Password
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400">
                        No auth account linked. This user cannot log in.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Active Toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editUser.is_active} onChange={e => su("is_active", e.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors"></div>
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform"></div>
                </label>
                <div>
                  <span className="text-xs font-medium text-slate-700">Active</span>
                  <span className="text-[10px] text-slate-500 ml-2">{editUser.is_active ? "User can log in and access the portal" : "User is disabled and cannot access anything"}</span>
                </div>
              </div>

              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editUser.id ? (
                editUser.is_active ? (
                  <button className="px-4 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50 rounded-lg"
                    onClick={() => {
                      if (confirm(`Move ${editUser.display_name} to SNR?\n\nThis will deactivate portal access.${editUser.linked_employee_id ? "\nTheir linked employee will also be moved to SNR." : ""}`)) {
                        moveUserToSNR(editUser);
                      }
                    }}>Move to SNR</button>
                ) : (
                  <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                    onClick={() => {
                      if (confirm(`Permanently delete ${editUser.display_name}?\n\nThis action cannot be undone.`)) {
                        deleteUser(editUser.id!);
                      }
                    }}>Permanently Delete</button>
                )
              ) : <div />}
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-slate-100" onClick={() => setEditUser(null)}>Cancel</button>
                <button className="px-5 py-2 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold disabled:opacity-50"
                  onClick={saveUser} disabled={saving}>{saving ? "Saving…" : editUser.id ? "Save Changes" : "Create User"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 2: ROLES ═══════════════════ */

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("roles").select("*").order("name");
    if (data) setRoles(data as Role[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const blankRole: Role = { id: "", name: "", description: null, allowed_modules: [], data_scope: "own", is_system: false };

  const sr = (k: keyof Role, v: any) => setEditRole(p => p ? { ...p, [k]: v } : p);

  const toggleMod = (mod: string) => {
    if (!editRole) return;
    const next = editRole.allowed_modules.includes(mod)
      ? editRole.allowed_modules.filter(m => m !== mod)
      : [...editRole.allowed_modules, mod];
    sr("allowed_modules", next);
  };

  async function saveRole() {
    if (!editRole || !editRole.name) { setMsg("Role name is required."); return; }
    setSaving(true); setMsg(null);
    const payload = { name: editRole.name, description: editRole.description || null, allowed_modules: editRole.allowed_modules, data_scope: editRole.data_scope };
    if (editRole.id) {
      const { error } = await supabase.from("roles").update(payload).eq("id", editRole.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("roles").insert({ ...payload, is_system: false });
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditRole(null); setSaving(false); load();
  }

  async function deleteRole(id: string) {
    await supabase.from("roles").delete().eq("id", id);
    setEditRole(null); load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading roles…</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Role Management</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Define roles with default module access and data scopes</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={load}>↻ Refresh</button>
          <button className="px-4 py-2 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold"
            onClick={() => setEditRole({ ...blankRole })}>+ Add Role</button>
        </div>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {roles.map(r => (
          <div key={r.id} onClick={() => setEditRole({ ...r })}
            className="border rounded-xl p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-1">
              <div className="font-semibold text-sm text-slate-900">{r.name}</div>
              <div className="flex gap-1.5">
                {r.is_system && <span className="text-[8px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-semibold">SYSTEM</span>}
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${scopeColor(r.data_scope)}`}>{r.data_scope.toUpperCase()}</span>
              </div>
            </div>
            {r.description && <p className="text-[10px] text-slate-500 mb-2.5">{r.description}</p>}
            <div className="flex flex-wrap gap-1">
              {r.allowed_modules.length === 0 ? <span className="text-[9px] text-slate-300 italic">No modules assigned</span> : (
                r.allowed_modules.map(m => {
                  const mod = ALL_MODULES.find(am => am.key === m);
                  return <span key={m} className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">{mod?.label ?? m}</span>;
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Edit/Create Role Dialog ═══ */}
      {editRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditRole(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editRole.id ? "Edit Role" : "New Role"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditRole(null)}>✕</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Role Name</label>
                  <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editRole.name} onChange={e => sr("name", e.target.value)} placeholder="e.g. Team Lead" disabled={editRole.is_system} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Data Scope</label>
                  <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editRole.data_scope} onChange={e => sr("data_scope", e.target.value)}>
                    {DATA_SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <p className="text-[9px] text-slate-400 mt-0.5">{DATA_SCOPES.find(s => s.value === editRole.data_scope)?.desc}</p>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Description</label>
                <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={editRole.description ?? ""} onChange={e => sr("description", e.target.value || null)} placeholder="What this role is for…" />
              </div>

              {/* Module Checklist */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Default Module Access</div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {(() => {
                    const grouped = new Map<string, typeof ALL_MODULES>();
                    ALL_MODULES.forEach(m => { if (!grouped.has(m.group)) grouped.set(m.group, []); grouped.get(m.group)!.push(m); });
                    return Array.from(grouped.entries()).map(([group, mods], gi) => (
                      <div key={group}>
                        <div className={`px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 ${gi > 0 ? "border-t border-slate-200" : ""}`}>{group}</div>
                        {mods.map(m => (
                          <label key={m.key} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer border-t border-slate-100">
                            <input type="checkbox" checked={editRole.allowed_modules.includes(m.key)} onChange={() => toggleMod(m.key)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="text-xs font-medium text-slate-700">{m.label}</span>
                          </label>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editRole.id && !editRole.is_system ? (
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                  onClick={() => { if (confirm(`Delete role "${editRole.name}"? Users with this role will lose it.`)) deleteRole(editRole.id); }}>
                  Delete Role
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-slate-100" onClick={() => setEditRole(null)}>Cancel</button>
                <button className="px-5 py-2 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold disabled:opacity-50"
                  onClick={saveRole} disabled={saving}>{saving ? "Saving…" : editRole.id ? "Save Changes" : "Create Role"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
