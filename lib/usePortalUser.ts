"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "./supabaseClient";

type DataScope = "all" | "own" | "team" | "none";

type PortalUserRow = {
  id: string;
  email: string;
  display_name: string;
  role_id: string | null;
  linked_name: string | null;
  linked_employee_id: string | null;
  module_overrides: string[] | null;
  data_scope_override: DataScope | null;
  is_active: boolean;
};

type RoleRow = {
  id: string;
  name: string;
  allowed_modules: string[];
  data_scope: DataScope;
};

export function usePortalUser() {
  const { user, loading: authLoading } = useAuth();

  const [portalUser, setPortalUser] = useState<PortalUserRow | null>(null);
  const [role, setRole] = useState<RoleRow | null>(null);
  const [effectiveScope, setEffectiveScope] = useState<DataScope>("none");
  const [effectiveModules, setEffectiveModules] = useState<string[]>([]);
  /** null = no filter (all), string[] = only these names, [] = show nothing */
  const [teamNames, setTeamNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.email) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function resolve() {
      const email = user!.email!;

      // 1. Fetch portal_user
      const { data: pu } = await supabase
        .from("portal_users")
        .select("id, email, display_name, role_id, linked_name, linked_employee_id, module_overrides, data_scope_override, is_active")
        .eq("email", email)
        .maybeSingle();

      if (cancelled) return;
      if (!pu) {
        setLoading(false);
        return;
      }
      setPortalUser(pu as PortalUserRow);

      // 2. Fetch role (if assigned)
      let roleRow: RoleRow | null = null;
      if (pu.role_id) {
        const { data: r } = await supabase
          .from("roles")
          .select("id, name, allowed_modules, data_scope")
          .eq("id", pu.role_id)
          .maybeSingle();
        if (cancelled) return;
        roleRow = (r as RoleRow) ?? null;
        setRole(roleRow);
      }

      // 3. Compute effective scope & modules
      const scope: DataScope = pu.data_scope_override ?? roleRow?.data_scope ?? "none";
      const modules: string[] = pu.module_overrides ?? roleRow?.allowed_modules ?? [];
      setEffectiveScope(scope);
      setEffectiveModules(modules);

      // 4. Resolve names for scoping
      if (scope === "all") {
        setTeamNames(null);
        setLoading(false);
        return;
      }

      if (scope === "none") {
        setTeamNames([]);
        setLoading(false);
        return;
      }

      // scope is "own" or "team" — need the user's sales name
      let ownName: string | null = null;

      if (pu.linked_employee_id) {
        const { data: emp } = await supabase
          .from("employees")
          .select("full_name")
          .eq("id", pu.linked_employee_id)
          .maybeSingle();
        if (cancelled) return;
        ownName = emp?.full_name ?? null;
      }

      // Fall back to linked_name
      if (!ownName) {
        ownName = pu.linked_name ?? null;
      }

      if (!ownName) {
        // Can't resolve a name — show nothing
        setTeamNames([]);
        setLoading(false);
        return;
      }

      if (scope === "own") {
        setTeamNames([ownName]);
        setLoading(false);
        return;
      }

      // scope === "team"
      const names: string[] = [ownName];

      if (pu.linked_employee_id) {
        const { data: reports } = await supabase
          .from("employees")
          .select("full_name")
          .eq("manager_id", pu.linked_employee_id)
          .eq("is_active", true);
        if (cancelled) return;
        if (reports) {
          for (const r of reports) {
            if (r.full_name) names.push(r.full_name);
          }
        }
      }

      setTeamNames(names);
      setLoading(false);
    }

    resolve();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return { portalUser, role, effectiveScope, effectiveModules, teamNames, loading };
}
