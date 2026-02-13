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
  { key: "sales", label: "Sales", group: "Operations" },
  { key: "speed", label: "Speed", group: "Operations" },
  { key: "spp", label: "SPP Dashboard", group: "Dashboards" },
  { key: "cc_commissions", label: "CC Commissions Overview", group: "Dashboards" },
  { key: "payfile", label: "Pay File Generation", group: "Finance" },
  { key: "advances", label: "Advances", group: "Finance" },
  { key: "user_management", label: "User Management", group: "Admin" },
];

const DATA_SCOPES: { value: string; label: string; desc: string }[] = [
  { value: "all", label: "All Data", desc: "Can see all records across all reps and companies" },
  { value: "own", label: "Own Data Only", desc: "Can only see records matching their linked name" },
  { value: "team", label: "Team Data", desc: "Can see records for their assigned team (future)" },
  { value: "none", label: "No Data", desc: "Cannot see any data unless explicitly overridden" },
];

/* ═══════════════════ HELPERS ═══════════════════ */

const scopeColor = (s: string) =>
  s === "all" ? "bg-emerald-100 text-emerald-700" :
  s === "own" ? "bg-blue-100 text-blue-700" :
  s === "team" ? "bg-purple-100 text-purple-700" :
  "bg-slate-100 text-slate-500";

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function UserManagement() {
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

  useEffect(() => { load(); }, [load]);

  const blankUser: PortalUser = {
    email: "", display_name: "", role_id: null, linked_name: null,
    module_overrides: null, data_scope_override: null, is_active: true, last_login: null,
    linked_employee_id: null, deactivation_source: null,
  };

  const getRoleForUser = (u: PortalUser): Role | undefined => roles.find(r => r.id === u.role_id);

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
      const { error } = await supabase.from("portal_users").update(payload).eq("id", editUser.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("portal_users").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditUser(null); setSaving(false); load();
  }

  async function deleteUser(id: string) {
    await supabase.from("portal_users").delete().eq("id", id);
    setEditUser(null); load();
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
        <div>
          <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Manage portal users, assign roles, and control module access</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={load}>↻ Refresh</button>
          <button className="px-4 py-2 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold"
            onClick={() => setEditUser({ ...blankUser })}>+ Add User</button>
        </div>
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {users.map(u => {
          const role = getRoleForUser(u);
          const mods = getEffectiveModules(u);
          const scope = getEffectiveScope(u);
          const linkedEmp = u.linked_employee_id ? employeeMap.get(u.linked_employee_id) : undefined;
          return (
            <div key={u.id} onClick={() => setEditUser({ ...u })}
              className={`border rounded-xl p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow ${!u.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-sm text-slate-900">{u.display_name}</div>
                  <div className="text-[10px] text-slate-500">{u.email}</div>
                </div>
                <div className="flex gap-1.5 items-center flex-wrap justify-end">
                  {u.deactivation_source === "orgchart_removed" && (
                    <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">SNR - Removed</span>
                  )}
                  {u.deactivation_source === "orgchart_deactivated" && (
                    <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">SNR - Deactivated</span>
                  )}
                  {!u.is_active && !u.deactivation_source && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">INACTIVE</span>}
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
        {users.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400 text-sm">No users yet. Click "+ Add User" to create one.</div>
        )}
      </div>

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
                      : "This user was automatically deactivated because their employee was marked inactive in the Org Chart."}
                    {" "}You can manually reactivate them by toggling the Active switch below.
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
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${editUser.display_name}?\n\nThis action cannot be undone.`)) {
                      deleteUser(editUser.id!);
                    }
                  }}>Delete User</button>
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
