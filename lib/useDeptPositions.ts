"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ─── Default seed data ─── */

const DEFAULT_DEPARTMENTS: string[] = [
  "Executive", "Sales", "Call Center", "Operations", "Finance", "Contingencies",
];

const DEFAULT_POSITIONS_BY_DEPT: Record<string, string[]> = {
  Executive: ["CEO", "VP of Sales", "VP of Operations"],
  Sales: ["Sales Manager", "Sales Rep", "Appointment Setter (US)", "Sales Associate"],
  "Call Center": ["CC Manager", "Appointment Setter", "CC Customer Support"],
  Operations: ["Operations Manager", "Project Manager", "Accounts Manager", "Project Coordinator", "Project Admin", "Project Associate"],
  Finance: ["Chief Accountant", "Accountant", "Payroll Accountant", "Auditor", "Bookkeeper"],
  Contingencies: ["Videographer", "Editor", "Lead Gen"],
};

/* ─── Supabase table names (shared with OrgChart) ─── */
const TABLE_DEPTS = "org_departments";
const TABLE_ROLES = "org_department_roles";

/* ─── Hook ─── */

export function useDeptPositions() {
  const [departments, setDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [positionsByDept, setPositionsByDept] = useState<Record<string, string[]>>(DEFAULT_POSITIONS_BY_DEPT);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: deptData, error: deptErr }, { data: roleData, error: roleErr }] = await Promise.all([
        supabase.from(TABLE_DEPTS).select("id,name,sort_order").order("sort_order", { ascending: true }),
        supabase.from(TABLE_ROLES).select("id,department_name,role_name,sort_order").order("sort_order", { ascending: true }),
      ]);

      if (!deptErr && deptData && deptData.length > 0) {
        setDepartments(deptData.map((d: any) => d.name));
      } else {
        setDepartments(DEFAULT_DEPARTMENTS);
      }

      if (!roleErr && roleData && roleData.length > 0) {
        const byDept: Record<string, string[]> = {};
        for (const r of roleData as any[]) {
          if (!byDept[r.department_name]) byDept[r.department_name] = [];
          byDept[r.department_name].push(r.role_name);
        }
        setPositionsByDept({ ...DEFAULT_POSITIONS_BY_DEPT, ...byDept });
      } else {
        setPositionsByDept(DEFAULT_POSITIONS_BY_DEPT);
      }
    } catch {
      setDepartments(DEFAULT_DEPARTMENTS);
      setPositionsByDept(DEFAULT_POSITIONS_BY_DEPT);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Add a new position to a department (persists to DB) */
  const addPosition = useCallback(async (dept: string, position: string) => {
    const trimmed = position.trim();
    if (!trimmed) return;

    // Optimistic update
    setPositionsByDept(prev => {
      const list = prev[dept] ? [...prev[dept]] : [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [dept]: [...list, trimmed] };
    });

    // Persist to DB
    try {
      const currentList = positionsByDept[dept] || [];
      await supabase.from(TABLE_ROLES).insert({
        department_name: dept,
        role_name: trimmed,
        sort_order: currentList.length,
      });
    } catch { /* ignore — will still be in local state */ }
  }, [positionsByDept]);

  /** Rename a position within a department */
  const renamePosition = useCallback(async (dept: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    setPositionsByDept(prev => {
      const list = prev[dept] ? [...prev[dept]] : [];
      const idx = list.indexOf(oldName);
      if (idx < 0) return prev;
      list[idx] = trimmed;
      return { ...prev, [dept]: list };
    });

    try {
      await supabase.from(TABLE_ROLES)
        .update({ role_name: trimmed })
        .eq("department_name", dept)
        .eq("role_name", oldName);
    } catch { /* ignore */ }
  }, []);

  /** Delete a position from a department */
  const deletePosition = useCallback(async (dept: string, position: string) => {
    setPositionsByDept(prev => {
      const list = prev[dept] ? prev[dept].filter(r => r !== position) : [];
      return { ...prev, [dept]: list };
    });

    try {
      await supabase.from(TABLE_ROLES)
        .delete()
        .eq("department_name", dept)
        .eq("role_name", position);
    } catch { /* ignore */ }
  }, []);

  return {
    departments,
    positionsByDept,
    loading,
    reload: load,
    addPosition,
    renamePosition,
    deletePosition,
  };
}
