"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type Employee = {
  id: string;
  full_name: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  location: string;
  manager_id: string | null;
  avatar_url: string;
  hire_date: string | null;
  date_of_birth: string | null; // NEW
  sort_order: number | null; // NEW
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TreeNode = {
  employee: Employee;
  children: TreeNode[];
  x: number;
  y: number;
  subtreeWidth: number;
};

type LayoutNode = {
  employee: Employee;
  x: number;
  y: number;
  parentX: number | null;
  parentY: number | null;
  depth: number;
};

/* Dept config types (optional tables) */
type OrgDepartment = { id: string; name: string; sort_order: number };
type OrgRole = { id: string; department_name: string; role_name: string; sort_order: number };

/* ═══════════════════ CONSTANTS ═══════════════════ */

const CARD_W = 264;
const CARD_H = 164;
const H_GAP = 48;
const V_GAP = 96;

/* Role-based colors */
const ROLE_COLORS: Record<string, { bar: string; barText: string; accent: string }> = {
  president: { bar: "#1e3a5f", barText: "#ffffff", accent: "#1e3a5f" },
  vp: { bar: "#00aeef", barText: "#ffffff", accent: "#00aeef" },
  manager: { bar: "#b5b821", barText: "#ffffff", accent: "#b5b821" },
  default: { bar: "#6b7280", barText: "#ffffff", accent: "#6b7280" },
};

const DEPT_COLORS: Record<string, { gradient: string; border: string; badge: string; badgeText: string }> = {
  Executive: { gradient: "from-amber-50 to-orange-50", border: "border-amber-200", badge: "bg-amber-100", badgeText: "text-amber-700" },
  Finance: { gradient: "from-emerald-50 to-green-50", border: "border-emerald-200", badge: "bg-emerald-100", badgeText: "text-emerald-700" },
  Operation: { gradient: "from-blue-50 to-sky-50", border: "border-blue-200", badge: "bg-blue-100", badgeText: "text-blue-700" },
  HR: { gradient: "from-purple-50 to-violet-50", border: "border-purple-200", badge: "bg-purple-100", badgeText: "text-purple-700" },
  "Call Center": { gradient: "from-rose-50 to-pink-50", border: "border-rose-200", badge: "bg-rose-100", badgeText: "text-rose-700" },
  Sales: { gradient: "from-cyan-50 to-teal-50", border: "border-cyan-200", badge: "bg-cyan-100", badgeText: "text-cyan-700" },
  Contingencies: { gradient: "from-fuchsia-50 to-pink-50", border: "border-fuchsia-200", badge: "bg-fuchsia-100", badgeText: "text-fuchsia-700" },
};

const DEFAULT_DEPT_COLOR = { gradient: "from-slate-50 to-slate-100", border: "border-slate-200", badge: "bg-slate-100", badgeText: "text-slate-600" };
const getDeptColor = (dept: string) => DEPT_COLORS[dept] || DEFAULT_DEPT_COLOR;

function getRoleColor(position: string, depth: number) {
  const p = (position || "").toLowerCase();
  if (depth === 0 || p.includes("president") || p.includes("ceo") || p.includes("director")) return ROLE_COLORS.president;
  if (p.includes("vp") || p.includes("vice president") || p.includes("head")) return ROLE_COLORS.vp;
  if (p.includes("manager") || p.includes("lead") || p.includes("supervisor")) return ROLE_COLORS.manager;
  if (depth === 1) return ROLE_COLORS.vp;
  if (depth >= 2) return ROLE_COLORS.manager;
  return ROLE_COLORS.default;
}

/* Default departments + roles */
const DEFAULT_DEPARTMENTS: string[] = ["Executive", "Finance", "Operation", "HR", "Call Center", "Sales", "Contingencies"];
const DEFAULT_ROLES_BY_DEPT: Record<string, string[]> = {
  Executive: ["CEO", "President", "VP"],
  Finance: ["Accountant", "Finance Manager"],
  Operation: ["Operations Manager", "Project Manager", "Project Coordinator", "Project Admin"],
  HR: ["HR Manager", "Recruiter"],
  "Call Center": ["Call Center Manager", "Appointment Setter", "Solar Closer"],
  Sales: ["Sales Manager", "Sales Rep", "Sales Assistant"],
  Contingencies: ["Lead Generator", "Videographer"],
};

/* Local storage keys (fallback persistence) */
const LS_DEPT_ORDER = "orgchart_dept_order_v1";
const LS_ROLES_BY_DEPT = "orgchart_roles_by_dept_v1";

/* Optional Supabase tables */
const TABLE_DEPTS = "org_departments";
const TABLE_ROLES = "org_department_roles";

/* ═══════════════════ AVATAR COLORS ═══════════════════ */

const AVATAR_BG_COLORS = ["#e8d5b7", "#d4a574", "#c49a6c", "#f0d9b5", "#c2956a", "#deb887", "#d2a679", "#e6c9a8", "#b8926a", "#cfb997"];
const AVATAR_HAIR_COLORS = ["#3d2314", "#5c3a1e", "#8b6914", "#2c1810", "#d4a76a", "#7a3b1e", "#1a1a1a", "#4a2c17", "#c4844e", "#8b4513"];
const AVATAR_SHIRT_COLORS = ["#4a90d9", "#6c5ce7", "#e17055", "#00b894", "#fdcb6e", "#74b9ff", "#a29bfe", "#fab1a0", "#55a3e8", "#81ecec"];

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/* ═══════════════════ HELPERS ═══════════════════ */

function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const next = arr.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function getInitials(name: string): string {
  return (name || "")
    .split(" ")
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getAncestorIds(empId: string, employees: Employee[]): string[] {
  const empMap = new Map(employees.map(e => [e.id, e]));
  const ids: string[] = [];
  let current = empMap.get(empId);
  while (current?.manager_id) {
    ids.push(current.manager_id);
    current = empMap.get(current.manager_id);
  }
  return ids;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // keep it clean and consistent (yyyy-mm-dd input)
  return iso.slice(0, 10);
}

/* ═══════════════════ AVATAR SVG ═══════════════════ */

function AvatarIllustration({ name, size = 52 }: { name: string; size?: number }) {
  const h = hashStr(name);
  const skinColor = AVATAR_BG_COLORS[h % AVATAR_BG_COLORS.length];
  const hairColor = AVATAR_HAIR_COLORS[(h >> 4) % AVATAR_HAIR_COLORS.length];
  const shirtColor = AVATAR_SHIRT_COLORS[(h >> 8) % AVATAR_SHIRT_COLORS.length];
  const isLongHair = h % 3 !== 0;
  const hasGlasses = h % 5 === 0;
  const hasBeard = !isLongHair && h % 4 === 0;

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
      <rect width="80" height="80" fill="#f2f4f7" />
      <rect x="30" y="46" width="20" height="12" fill={skinColor} />
      <ellipse cx="40" cy="78" rx="30" ry="22" fill={shirtColor} />
      <ellipse cx="40" cy="34" rx="18" ry="20" fill={skinColor} />

      {isLongHair ? (
        <>
          <ellipse cx="40" cy="24" rx="19" ry="14" fill={hairColor} />
          <rect x="21" y="24" width="7" height="28" rx="3" fill={hairColor} />
          <rect x="52" y="24" width="7" height="28" rx="3" fill={hairColor} />
        </>
      ) : (
        <>
          <ellipse cx="40" cy="22" rx="19" ry="12" fill={hairColor} />
          <rect x="22" y="18" width="36" height="8" rx="4" fill={hairColor} />
        </>
      )}

      <ellipse cx="33" cy="35" rx="2.5" ry="3" fill="#2d2d2d" />
      <ellipse cx="47" cy="35" rx="2.5" ry="3" fill="#2d2d2d" />

      {hasGlasses && (
        <>
          <circle cx="33" cy="35" r="6" stroke="#333" strokeWidth="1.5" fill="none" opacity={0.5} />
          <circle cx="47" cy="35" r="6" stroke="#333" strokeWidth="1.5" fill="none" opacity={0.5} />
          <line x1="39" y1="35" x2="41" y2="35" stroke="#333" strokeWidth="1.5" opacity={0.5} />
        </>
      )}

      <path d="M 36 43 Q 40 46 44 43" stroke="#c4846e" strokeWidth="1.2" fill="none" />

      {hasBeard && <path d="M 30 40 Q 32 52 40 54 Q 48 52 50 40" fill={hairColor} opacity={0.7} />}

      <ellipse cx="22" cy="35" rx="3" ry="5" fill={skinColor} />
      <ellipse cx="58" cy="35" rx="3" ry="5" fill={skinColor} />
    </svg>
  );
}

/* ═══════════════════ TREE LAYOUT (order-aware) ═══════════════════ */

function buildTree(employees: Employee[], collapsedSet: Set<string>, filterDept: string | null): TreeNode | null {
  const byManager = new Map<string | null, Employee[]>();

  // include only active first
  const active = employees.filter(e => e.is_active);

  // build buckets
  for (const emp of active) {
    const key = emp.manager_id ?? "__root__";
    if (!byManager.has(key)) byManager.set(key, []);
    byManager.get(key)!.push(emp);
  }

  // sort children within each manager by sort_order then name
  for (const [k, list] of byManager.entries()) {
    list.sort((a, b) => {
      const ao = a.sort_order ?? 999999;
      const bo = b.sort_order ?? 999999;
      if (ao !== bo) return ao - bo;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
    byManager.set(k, list);
  }

  let includedIds: Set<string> | null = null;
  if (filterDept) {
    includedIds = new Set<string>();
    const empMap = new Map(active.map(e => [e.id, e]));
    for (const emp of active) {
      if (emp.department === filterDept) {
        let current: Employee | undefined = emp;
        while (current) {
          includedIds.add(current.id);
          current = current.manager_id ? empMap.get(current.manager_id) : undefined;
        }
      }
    }
  }

  function build(parentId: string | null): TreeNode[] {
    const key = parentId ?? "__root__";
    const kids = byManager.get(key) ?? [];
    return kids
      .filter(e => !includedIds || includedIds.has(e.id))
      .map(emp => ({
        employee: emp,
        children: collapsedSet.has(emp.id) ? [] : build(emp.id),
        x: 0,
        y: 0,
        subtreeWidth: 0,
      }));
  }

  const roots = build(null);
  if (roots.length === 0) return null;
  return roots[0];
}

function computeSubtreeWidths(node: TreeNode): number {
  if (node.children.length === 0) {
    node.subtreeWidth = CARD_W;
    return CARD_W;
  }
  let total = 0;
  for (const child of node.children) total += computeSubtreeWidths(child);
  total += (node.children.length - 1) * H_GAP;
  node.subtreeWidth = Math.max(CARD_W, total);
  return node.subtreeWidth;
}

function positionNodes(node: TreeNode, x: number, y: number): void {
  node.x = x + node.subtreeWidth / 2 - CARD_W / 2;
  node.y = y;
  let childX = x;
  for (const child of node.children) {
    positionNodes(child, childX, y + CARD_H + V_GAP);
    childX += child.subtreeWidth + H_GAP;
  }
}

function flattenTree(node: TreeNode, parentX: number | null, parentY: number | null, depth: number): LayoutNode[] {
  const result: LayoutNode[] = [{
    employee: node.employee,
    x: node.x,
    y: node.y,
    parentX,
    parentY,
    depth,
  }];
  for (const child of node.children) {
    result.push(...flattenTree(child, node.x + CARD_W / 2, node.y + CARD_H, depth + 1));
  }
  return result;
}

function layoutTree(employees: Employee[], collapsedSet: Set<string>, filterDept: string | null): { nodes: LayoutNode[]; width: number; height: number } {
  const root = buildTree(employees, collapsedSet, filterDept);
  if (!root) return { nodes: [], width: 0, height: 0 };
  computeSubtreeWidths(root);
  positionNodes(root, 80, 80);
  const nodes = flattenTree(root, null, null, 0);

  let maxX = 0, maxY = 0;
  for (const n of nodes) {
    if (n.x + CARD_W > maxX) maxX = n.x + CARD_W;
    if (n.y + CARD_H > maxY) maxY = n.y + CARD_H;
  }
  return { nodes, width: maxX + 80, height: maxY + 80 };
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function OrgChart() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set());
  const [filterDept, setFilterDept] = useState<string | null>(null);

  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(0.85);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  /* Dept tabs + roles (same as your latest) */
  const [deptOrder, setDeptOrder] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [activeDeptTab, setActiveDeptTab] = useState<string | null>(null);
  const deptDragRef = useRef<string | null>(null);
  const [rolesByDept, setRolesByDept] = useState<Record<string, string[]>>(DEFAULT_ROLES_BY_DEPT);
  const roleDragRef = useRef<{ dept: string; role: string } | null>(null);
  const [deptAddOpen, setDeptAddOpen] = useState(false);
  const [deptAddValue, setDeptAddValue] = useState("");
  const [roleInput, setRoleInput] = useState<Record<string, string>>({});

  /* Card drag/drop for ordering and re-parenting */
  const cardDragRef = useRef<{ id: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; zone: "left" | "right" | "child" } | null>(null);

  /* ── Data Loading ── */
  const load = useCallback(async () => {
    setLoading(true);

    // Pull employees. Ordering handled in buildTree sorting.
    const { data } = await supabase.from("employees").select("*");
    if (data) setEmployees(data as Employee[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Load Dept/Role config (DB if present, else localStorage) ── */
  useEffect(() => {
    let mounted = true;

    const loadLocal = () => {
      try {
        const savedOrder = localStorage.getItem(LS_DEPT_ORDER);
        const savedRoles = localStorage.getItem(LS_ROLES_BY_DEPT);
        if (savedOrder) {
          const parsed = JSON.parse(savedOrder);
          if (Array.isArray(parsed) && parsed.length) setDeptOrder(parsed);
        }
        if (savedRoles) {
          const parsed = JSON.parse(savedRoles);
          if (parsed && typeof parsed === "object") setRolesByDept(prev => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore
      }
    };

    const loadFromDb = async () => {
      try {
        const { data: deptData, error: deptErr } = await supabase.from(TABLE_DEPTS).select("id,name,sort_order").order("sort_order", { ascending: true });
        if (!deptErr && deptData && deptData.length) {
          const names = (deptData as OrgDepartment[]).map(d => d.name);
          if (mounted) setDeptOrder(names);
        }

        const { data: roleData, error: roleErr } = await supabase.from(TABLE_ROLES).select("id,department_name,role_name,sort_order").order("sort_order", { ascending: true });
        if (!roleErr && roleData) {
          const next: Record<string, string[]> = {};
          for (const r of roleData as OrgRole[]) {
            if (!next[r.department_name]) next[r.department_name] = [];
            next[r.department_name].push(r.role_name);
          }
          if (mounted) setRolesByDept(prev => ({ ...prev, ...next }));
        }

        loadLocal();
      } catch {
        loadLocal();
      }
    };

    loadFromDb();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_DEPT_ORDER, JSON.stringify(deptOrder)); } catch { /* ignore */ }
  }, [deptOrder]);

  useEffect(() => {
    try { localStorage.setItem(LS_ROLES_BY_DEPT, JSON.stringify(rolesByDept)); } catch { /* ignore */ }
  }, [rolesByDept]);

  /* ── Layout ── */
  const { nodes, width: treeWidth, height: treeHeight } = useMemo(
    () => layoutTree(employees, collapsedSet, filterDept),
    [employees, collapsedSet, filterDept]
  );

  /* ── Search Results ── */
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return employees
      .filter(e => e.is_active && (
        (e.full_name || "").toLowerCase().includes(q) ||
        (e.position || "").toLowerCase().includes(q) ||
        (e.department || "").toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }, [searchQuery, employees]);

  /* ── Toggle Collapse ── */
  const toggleCollapse = (id: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const hasChildren = (id: string) => employees.some(e => e.manager_id === id && e.is_active);

  /* ── Navigate to Node ── */
  const navigateToNode = useCallback((empId: string) => {
    const ancestors = getAncestorIds(empId, employees);
    setCollapsedSet(prev => {
      const next = new Set(prev);
      for (const aid of ancestors) next.delete(aid);
      return next;
    });
    setFilterDept(null);
    setActiveDeptTab(null);

    setHighlightId(empId);
    setTimeout(() => setHighlightId(null), 3000);

    setTimeout(() => {
      const recalc = layoutTree(employees, new Set([...collapsedSet].filter(id => !ancestors.includes(id))), null);
      const target = recalc.nodes.find(n => n.employee.id === empId);
      if (target && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPanX(rect.width / 2 - (target.x + CARD_W / 2) * zoom);
        setPanY(rect.height / 2 - (target.y + CARD_H / 2) * zoom);
      }
    }, 50);

    setSearchOpen(false);
    setSearchQuery("");
  }, [employees, collapsedSet, zoom]);

  /* ── Zoom Controls ── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => Math.min(2, Math.max(0.2, z + delta)));
  }, []);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || nodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 80) / treeWidth;
    const scaleY = (rect.height - 80) / treeHeight;
    const newZoom = Math.min(1, Math.max(0.2, Math.min(scaleX, scaleY)));
    setZoom(newZoom);
    setPanX((rect.width - treeWidth * newZoom) / 2);
    setPanY((rect.height - treeHeight * newZoom) / 2);
  }, [nodes.length, treeWidth, treeHeight]);

  /* ── Pan Controls ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-card]")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanX(panStart.current.panX + (e.clientX - panStart.current.x));
    setPanY(panStart.current.panY + (e.clientY - panStart.current.y));
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  /* ── Department Tabs Drag & Drop ── */
  const onDeptDragStart = (dept: string) => (e: React.DragEvent) => {
    deptDragRef.current = dept;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDeptDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDeptDrop = (targetDept: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = deptDragRef.current;
    deptDragRef.current = null;
    if (!dragged || dragged === targetDept) return;

    setDeptOrder(prev => {
      const from = prev.indexOf(dragged);
      const to = prev.indexOf(targetDept);
      if (from < 0 || to < 0) return prev;
      return reorderArray(prev, from, to);
    });

    try {
      const current = deptOrder.slice();
      const nextOrder = reorderArray(current, current.indexOf(dragged), current.indexOf(targetDept));
      const payload = nextOrder.map((name, idx) => ({ name, sort_order: idx }));
      await supabase.from(TABLE_DEPTS).upsert(payload, { onConflict: "name" });
    } catch { /* ignore */ }
  };

  const selectDept = (dept: string | null) => {
    setActiveDeptTab(dept);
    setFilterDept(dept);
  };

  const addDepartment = async () => {
    const name = deptAddValue.trim();
    if (!name) return;
    if (deptOrder.includes(name)) {
      setDeptAddOpen(false);
      setDeptAddValue("");
      setMsg("Department already exists.");
      return;
    }
    setDeptOrder(prev => [...prev, name]);
    setRolesByDept(prev => ({ ...prev, [name]: prev[name] || [] }));
    setDeptAddOpen(false);
    setDeptAddValue("");
    setMsg(null);

    try { await supabase.from(TABLE_DEPTS).insert({ name, sort_order: deptOrder.length }); } catch { /* ignore */ }
  };

  const removeDepartment = async (dept: string) => {
    setDeptOrder(prev => prev.filter(d => d !== dept));
    setRolesByDept(prev => {
      const next = { ...prev };
      delete next[dept];
      return next;
    });
    if (activeDeptTab === dept) {
      setActiveDeptTab(null);
      setFilterDept(null);
    }
    try {
      await supabase.from(TABLE_DEPTS).delete().eq("name", dept);
      await supabase.from(TABLE_ROLES).delete().eq("department_name", dept);
    } catch { /* ignore */ }
  };

  /* ── Roles Drag & Drop ── */
  const onRoleDragStart = (dept: string, role: string) => (e: React.DragEvent) => {
    roleDragRef.current = { dept, role };
    e.dataTransfer.effectAllowed = "move";
  };

  const onRoleDrop = (dept: string, targetRole: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = roleDragRef.current;
    roleDragRef.current = null;
    if (!dragged) return;
    if (dragged.dept !== dept) return;
    if (dragged.role === targetRole) return;

    setRolesByDept(prev => {
      const list = prev[dept] ? prev[dept].slice() : [];
      const from = list.indexOf(dragged.role);
      const to = list.indexOf(targetRole);
      if (from < 0 || to < 0) return prev;
      const nextList = reorderArray(list, from, to);
      return { ...prev, [dept]: nextList };
    });

    try {
      const list = rolesByDept[dept] ? rolesByDept[dept].slice() : [];
      const from = list.indexOf(dragged.role);
      const to = list.indexOf(targetRole);
      if (from < 0 || to < 0) return;
      const nextList = reorderArray(list, from, to);
      const payload = nextList.map((role_name, idx) => ({ department_name: dept, role_name, sort_order: idx }));
      await supabase.from(TABLE_ROLES).upsert(payload, { onConflict: "department_name,role_name" });
    } catch { /* ignore */ }
  };

  const addRoleToDept = async (dept: string) => {
    const role = (roleInput[dept] || "").trim();
    if (!role) return;

    setRolesByDept(prev => {
      const list = prev[dept] ? prev[dept].slice() : [];
      if (list.includes(role)) return prev;
      return { ...prev, [dept]: [...list, role] };
    });
    setRoleInput(prev => ({ ...prev, [dept]: "" }));

    try {
      const current = rolesByDept[dept] || [];
      await supabase.from(TABLE_ROLES).insert({ department_name: dept, role_name: role, sort_order: current.length });
    } catch { /* ignore */ }
  };

  const removeRoleFromDept = async (dept: string, role: string) => {
    setRolesByDept(prev => {
      const list = prev[dept] ? prev[dept].slice() : [];
      return { ...prev, [dept]: list.filter(r => r !== role) };
    });
    try { await supabase.from(TABLE_ROLES).delete().eq("department_name", dept).eq("role_name", role); } catch { /* ignore */ }
  };

  /* ── CRUD Operations ── */
  const blankEmployee: Employee = {
    id: "",
    full_name: "",
    position: "",
    department: "",
    email: "",
    phone: "",
    location: "",
    manager_id: null,
    avatar_url: "",
    hire_date: null,
    date_of_birth: null,
    sort_order: null,
    is_active: true,
    created_at: "",
    updated_at: "",
  };

  const se = (k: keyof Employee, v: any) => setEditEmp(p => p ? { ...p, [k]: v } : p);

  function nextSortForManager(managerId: string | null): number {
    const sibs = employees.filter(e => e.is_active && (e.manager_id ?? null) === (managerId ?? null));
    const max = sibs.reduce((m, e) => Math.max(m, e.sort_order ?? -1), -1);
    return max + 1;
  }

  async function saveEmployee() {
    if (!editEmp) return;
    if (!editEmp.full_name.trim()) { setMsg("Name is required."); return; }
    setSaving(true); setMsg(null);

    const payload: Partial<Employee> = {
      full_name: editEmp.full_name,
      position: editEmp.position,
      department: editEmp.department,
      email: editEmp.email,
      phone: editEmp.phone,
      location: editEmp.location,
      manager_id: editEmp.manager_id || null,
      avatar_url: editEmp.avatar_url,
      hire_date: editEmp.hire_date || null,
      date_of_birth: editEmp.date_of_birth || null,
      is_active: editEmp.is_active,
    };

    // If creating and sort_order not set, set to end of siblings
    if (!editEmp.id) {
      payload.sort_order = editEmp.sort_order ?? nextSortForManager(editEmp.manager_id || null);
    } else {
      payload.sort_order = editEmp.sort_order ?? null;
    }

    if (editEmp.id) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editEmp.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }

    setEditEmp(null);
    setSaving(false);
    load();
  }

  async function deleteEmployee(id: string) {
    const hasReports = employees.some(e => e.manager_id === id && e.is_active);
    if (hasReports) {
      setMsg("Cannot delete: this employee has direct reports. Reassign them first.");
      return;
    }
    await supabase.from("employees").delete().eq("id", id);
    setEditEmp(null);
    load();
  }

  /* ── Photo Upload ── */
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMsg("Image must be under 2MB."); return; }
    if (!file.type.startsWith("image/")) { setMsg("Only image files are allowed."); return; }
    const ext = file.name.split(".").pop() ?? "png";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(filename, file, { contentType: file.type });
    if (error) { setMsg(`Upload error: ${error.message}`); return; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filename);
    se("avatar_url", urlData.publicUrl);
  }

  /* ── Miro-style card + buttons (sibling/child add) ── */
  const openAddSibling = (base: Employee) => {
    const managerId = base.manager_id ?? null;
    const dept = base.department || "";
    setEditEmp({
      ...blankEmployee,
      department: dept,
      manager_id: managerId,
      sort_order: nextSortForManager(managerId),
    });
    setMsg(null);
  };

  const openAddChild = (base: Employee) => {
    const dept = base.department || "";
    setEditEmp({
      ...blankEmployee,
      department: dept,
      manager_id: base.id,
      sort_order: nextSortForManager(base.id),
    });
    setMsg(null);
  };

  /* ── Card Drag & Drop (reorder + reparent) ── */
  const onCardDragStart = (id: string) => (e: React.DragEvent) => {
    cardDragRef.current = { id };
    e.dataTransfer.effectAllowed = "move";
    // Use a semi-transparent clone as the drag image
    const el = e.currentTarget as HTMLElement;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.opacity = "0.85";
    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    clone.style.width = `${CARD_W}px`;
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, CARD_W / 2, 20);
    requestAnimationFrame(() => document.body.removeChild(clone));
  };

  const onCardDragEnd = () => {
    cardDragRef.current = null;
    setDragOverTarget(null);
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onZoneDragEnter = (id: string, zone: "left" | "right" | "child") => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cardDragRef.current && cardDragRef.current.id !== id) {
      setDragOverTarget({ id, zone });
    }
  };

  const onZoneDragLeave = (e: React.DragEvent) => {
    // Only clear if we're truly leaving (not entering a child element)
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverTarget(null);
    }
  };

  async function setManagerAndSort(empId: string, managerId: string | null, sortOrder: number) {
    await supabase.from("employees").update({ manager_id: managerId, sort_order: sortOrder }).eq("id", empId);
  }

  async function reindexSiblings(managerId: string | null) {
    // ensure clean sort_order values: 0..n-1 among siblings
    const sibs = employees
      .filter(e => e.is_active && (e.manager_id ?? null) === (managerId ?? null))
      .sort((a, b) => {
        const ao = a.sort_order ?? 999999;
        const bo = b.sort_order ?? 999999;
        if (ao !== bo) return ao - bo;
        return (a.full_name || "").localeCompare(b.full_name || "");
      });

    const payload = sibs.map((e, idx) => ({ id: e.id, sort_order: idx }));
    if (payload.length) {
      await supabase.from("employees").upsert(payload, { onConflict: "id" });
    }
  }

  const onDropReorderSibling = (target: Employee, side: "left" | "right") => async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(null);
    const dragged = cardDragRef.current?.id;
    cardDragRef.current = null;
    if (!dragged || dragged === target.id) return;

    const draggedEmp = employees.find(x => x.id === dragged);
    if (!draggedEmp) return;

    // Only reorder within the same manager level as target
    const managerId = target.manager_id ?? null;

    // move dragged into that manager if not already
    const siblings = employees
      .filter(x => x.is_active && (x.manager_id ?? null) === (managerId ?? null) && x.id !== dragged)
      .sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999));

    const insertIndex = (() => {
      const idx = siblings.findIndex(x => x.id === target.id);
      if (idx < 0) return siblings.length;
      return side === "left" ? idx : idx + 1;
    })();

    const newList = siblings.slice();
    newList.splice(insertIndex, 0, { ...draggedEmp, manager_id: managerId } as Employee);

    // Persist: set dragged manager_id + temp sort_order, then reindex all
    try {
      await setManagerAndSort(draggedEmp.id, managerId, insertIndex);
      await reindexSiblings(managerId);
      await load();
    } catch {
      setMsg("Could not reorder. Please check that employees.sort_order exists.");
    }
  };

  const onDropMakeChild = (target: Employee) => async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(null);
    const dragged = cardDragRef.current?.id;
    cardDragRef.current = null;
    if (!dragged || dragged === target.id) return;

    const draggedEmp = employees.find(x => x.id === dragged);
    if (!draggedEmp) return;

    try {
      const newSort = nextSortForManager(target.id);
      await setManagerAndSort(draggedEmp.id, target.id, newSort);
      await reindexSiblings(target.id);
      await load();
    } catch {
      setMsg("Could not move employee under target. Please check that employees.sort_order exists.");
    }
  };

  /* ── Search close / click-out already handled above ── */

  /* ── Modal Role Picker options ── */
  const modalRoleOptions = useMemo(() => {
    const dept = editEmp?.department || "";
    if (!dept) return [];
    return rolesByDept[dept] || [];
  }, [rolesByDept, editEmp?.department]);

  const activeDept = activeDeptTab ?? null;
  const activeRoles = useMemo(() => {
    if (!activeDept) return [];
    return rolesByDept[activeDept] || [];
  }, [activeDept, rolesByDept]);

  /* ── Expand/Collapse ── */
  const toggleCollapseClick = (id: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── PNG Export (kept, not updated to include extra lines to avoid layout changes) ── */
  function exportPNG() {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = treeWidth * scale;
    canvas.height = treeHeight * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, treeWidth, treeHeight);

    for (const node of nodes) {
      if (node.parentX != null && node.parentY != null) {
        ctx.beginPath();
        ctx.strokeStyle = "#9ca3af";
        ctx.lineWidth = 1.5;
        const sx = node.parentX;
        const sy = node.parentY;
        const ex = node.x + CARD_W / 2;
        const ey = node.y;
        const midY = sy + (ey - sy) / 2;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, midY);
        ctx.lineTo(ex, midY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    for (const node of nodes) {
      const { x, y, employee: emp, depth } = node;
      const rc = getRoleColor(emp.position, depth);

      ctx.fillStyle = "rgba(0,0,0,0.06)";
      roundRect(ctx, x + 2, y + 2, CARD_W, CARD_H, 8);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#d1d5db";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, CARD_W, CARD_H, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = rc.bar;
      roundRect(ctx, x, y, CARD_W, 30, 8);
      ctx.fill();
      ctx.fillRect(x, y + 20, CARD_W, 10);

      ctx.fillStyle = rc.barText;
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emp.position || emp.department, x + CARD_W / 2, y + 15);

      ctx.fillStyle = "#1f2937";
      ctx.font = "italic 12px system-ui, sans-serif";
      ctx.fillText(emp.full_name, x + CARD_W / 2, y + 56, CARD_W - 70);

      ctx.fillStyle = "#6b7280";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(emp.phone || "", x + CARD_W / 2, y + 76, CARD_W - 70);

      ctx.fillStyle = "#6b7280";
      ctx.fillText(emp.email || "", x + CARD_W / 2, y + 96, CARD_W - 70);

      const avatarX = x + 38;
      const avatarY = y + 88;
      ctx.beginPath();
      ctx.fillStyle = "#e5e7eb";
      ctx.arc(avatarX, avatarY, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText(getInitials(emp.full_name), avatarX, avatarY);
    }

    const link = document.createElement("a");
    link.download = "org-chart.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading org chart…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* ═══ Toolbar ═══ */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Organization Chart</h2>
                <p className="text-xs text-slate-400">{employees.filter(e => e.is_active).length} active members</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Search */}
              <div className="relative" ref={searchRef}>
                <input
                  className="w-60 border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 pl-9 transition-all"
                  placeholder="Search employees…"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => { if (searchQuery) setSearchOpen(true); }}
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>

                {searchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Results</span>
                    </div>
                    {searchResults.map(emp => (
                      <button
                        key={emp.id}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors"
                        onClick={() => navigateToNode(emp.id)}
                      >
                        <div className="flex-shrink-0">
                          <AvatarIllustration name={emp.full_name} size={32} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{emp.full_name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{emp.position} · {emp.department}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-7 bg-slate-200" />

              <button className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-200/70 transition-all flex items-center gap-1.5" onClick={load}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
                Refresh
              </button>

              <button className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-200/70 transition-all flex items-center gap-1.5" onClick={exportPNG}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm transition-all flex items-center gap-1.5"
                onClick={() => setEditEmp({ ...blankEmployee })}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Employee
              </button>
            </div>
          </div>

          {/* Department Tabs */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => { selectDept(null); }}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${!filterDept ? "bg-slate-800 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              title="Show all departments"
            >
              All
            </button>

            <div className="flex items-center gap-1.5 flex-wrap">
              {deptOrder.map(dept => {
                const dc = getDeptColor(dept);
                const active = filterDept === dept;

                return (
                  <div
                    key={dept}
                    draggable
                    onDragStart={onDeptDragStart(dept)}
                    onDragOver={onDeptDragOver}
                    onDrop={onDeptDrop(dept)}
                    className="relative group"
                    title="Drag to reorder"
                  >
                    <button
                      onClick={() => selectDept(active ? null : dept)}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                        active ? `${dc.badge} ${dc.badgeText} shadow-sm border-transparent` : "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200"
                      }`}
                    >
                      {dept}
                    </button>

                    <button
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-200 text-[10px] text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDepartment(dept); }}
                      title="Remove department"
                    >
                      −
                    </button>
                  </div>
                );
              })}

              {!deptAddOpen ? (
                <button
                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-200/70 transition-all"
                  onClick={() => { setDeptAddOpen(true); setDeptAddValue(""); setMsg(null); }}
                  title="Add department"
                >
                  +
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-2 py-1.5">
                  <input
                    className="w-40 text-[11px] bg-transparent outline-none"
                    placeholder="New department name"
                    value={deptAddValue}
                    onChange={(e) => setDeptAddValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addDepartment(); if (e.key === "Escape") { setDeptAddOpen(false); setDeptAddValue(""); } }}
                  />
                  <button className="text-[11px] font-semibold text-blue-600 hover:text-blue-700" onClick={addDepartment}>Add</button>
                  <button className="text-[11px] font-semibold text-slate-400 hover:text-slate-600" onClick={() => { setDeptAddOpen(false); setDeptAddValue(""); }}>Cancel</button>
                </div>
              )}
            </div>
          </div>

          {/* Roles panel with Input Area */}
          {activeDept && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{activeDept} Roles</div>

                <div className="flex items-center gap-2">
                  <input
                    className="w-72 border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                    placeholder="Input Area: add role to this department"
                    value={roleInput[activeDept] || ""}
                    onChange={(e) => setRoleInput(prev => ({ ...prev, [activeDept]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addRoleToDept(activeDept); }}
                  />
                  <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 transition-all" onClick={() => addRoleToDept(activeDept)}>
                    Add
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeRoles.length === 0 ? (
                  <div className="text-[12px] text-slate-400 py-1">No roles yet. Use the input area to add one.</div>
                ) : (
                  activeRoles.map(role => (
                    <div
                      key={role}
                      draggable
                      onDragStart={onRoleDragStart(activeDept, role)}
                      onDragOver={onDeptDragOver}
                      onDrop={onRoleDrop(activeDept, role)}
                      className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[12px] text-slate-600 shadow-sm hover:border-slate-200/70 cursor-move"
                      title="Drag to reorder roles"
                    >
                      <span className="font-semibold">{role}</span>
                      <button
                        className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => removeRoleFromDept(activeDept, role)}
                        title="Remove role"
                      >
                        −
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {msg && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {msg}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Chart Canvas ═══ */}
      {nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm text-slate-500 font-medium">No employees found</div>
            <div className="text-xs text-slate-400 mt-1">Add your first employee to build the org chart</div>
            <button
              className="mt-4 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm transition-all"
              onClick={() => setEditEmp({ ...blankEmployee })}
            >
              + Add Employee
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative select-none"
          style={{
            cursor: isPanning ? "grabbing" : "grab",
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Subtle grid */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.3,
            backgroundImage: "radial-gradient(circle, #cbd5e1 0.8px, transparent 0.8px)",
            backgroundSize: "28px 28px",
          }} />

          <div
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "absolute",
              top: 0,
              left: 0,
              width: treeWidth,
              height: treeHeight,
            }}
          >
            {/* Connector lines */}
            <svg style={{ position: "absolute", top: 0, left: 0, width: treeWidth, height: treeHeight, pointerEvents: "none" }}>
              {nodes.map(node => {
                if (node.parentX == null || node.parentY == null) return null;
                const sx = node.parentX;
                const sy = node.parentY;
                const ex = node.x + CARD_W / 2;
                const ey = node.y;
                const midY = sy + (ey - sy) / 2;
                return (
                  <g key={`line-${node.employee.id}`}>
                    <path d={`M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${ey}`} fill="none" stroke="#b0b8c4" strokeWidth={1.5} />
                    <circle cx={sx} cy={midY} r="2" fill="#b0b8c4" />
                  </g>
                );
              })}
            </svg>

            {/* Cards */}
            {nodes.map(node => {
              const emp = node.employee;
              const rc = getRoleColor(emp.position, node.depth);
              const isHighlighted = emp.id === highlightId;
              const isCollapsed = collapsedSet.has(emp.id);
              const expandable = hasChildren(emp.id);
              const isDragging = cardDragRef.current?.id === emp.id;
              const isDropLeft = dragOverTarget?.id === emp.id && dragOverTarget.zone === "left";
              const isDropRight = dragOverTarget?.id === emp.id && dragOverTarget.zone === "right";
              const isDropChild = dragOverTarget?.id === emp.id && dragOverTarget.zone === "child";

              return (
                <div
                  key={emp.id}
                  data-card
                  draggable
                  onDragStart={onCardDragStart(emp.id)}
                  onDragEnd={onCardDragEnd}
                  style={{
                    position: "absolute",
                    left: node.x,
                    top: node.y,
                    width: CARD_W,
                    height: CARD_H,
                  }}
                  className={`group transition-all duration-200 hover:-translate-y-0.5 ${isDragging ? "opacity-40" : ""}`}
                >
                  {/* ── Drop zone indicators (visible during drag) ── */}

                  {/* Left reorder zone */}
                  <div
                    className="absolute -left-3 top-2 bottom-2 w-8 z-30 rounded-l-lg"
                    onDragOver={allowDrop}
                    onDragEnter={onZoneDragEnter(emp.id, "left")}
                    onDragLeave={onZoneDragLeave}
                    onDrop={onDropReorderSibling(emp, "left")}
                  >
                    <div className={`h-full w-1 rounded-full mx-auto transition-all duration-150 ${isDropLeft ? "bg-blue-500 scale-x-150" : "bg-transparent"}`} />
                  </div>

                  {/* Right reorder zone */}
                  <div
                    className="absolute -right-3 top-2 bottom-2 w-8 z-30 rounded-r-lg"
                    onDragOver={allowDrop}
                    onDragEnter={onZoneDragEnter(emp.id, "right")}
                    onDragLeave={onZoneDragLeave}
                    onDrop={onDropReorderSibling(emp, "right")}
                  >
                    <div className={`h-full w-1 rounded-full mx-auto transition-all duration-150 ${isDropRight ? "bg-blue-500 scale-x-150" : "bg-transparent"}`} />
                  </div>

                  {/* Bottom re-parent zone */}
                  <div
                    className={`absolute left-4 right-4 -bottom-5 h-10 z-30 rounded-b-lg transition-all duration-150 ${isDropChild ? "bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-lg" : ""}`}
                    onDragOver={allowDrop}
                    onDragEnter={onZoneDragEnter(emp.id, "child")}
                    onDragLeave={onZoneDragLeave}
                    onDrop={onDropMakeChild(emp)}
                  />

                  {/* ── Card visual ── */}
                  <div
                    className={`
                      w-full h-full rounded-xl overflow-hidden bg-white
                      border border-slate-200/80
                      shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]
                      group-hover:shadow-[0_10px_32px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]
                      transition-all duration-200
                      ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2" : ""}
                      ${isDropChild ? "ring-2 ring-blue-400 ring-offset-1" : ""}
                    `}
                    style={{ borderLeft: `4px solid ${rc.bar}` }}
                    onClick={() => setEditEmp({ ...emp })}
                  >
                    {/* Title bar */}
                    <div className="px-3 py-2 flex items-center" style={{ backgroundColor: rc.bar }}>
                      <span className="text-[11px] font-bold tracking-wide" style={{ color: rc.barText }}>
                        {emp.position || emp.department || "Employee"}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="flex items-start gap-3 px-3 pt-3 pb-2">
                      {/* Avatar – larger */}
                      <div className="flex-shrink-0 rounded-lg overflow-hidden shadow-sm border border-slate-100">
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} alt={emp.full_name} className="w-[60px] h-[60px] object-cover" />
                        ) : (
                          <AvatarIllustration name={emp.full_name} size={60} />
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="text-[13px] font-bold text-slate-900 truncate leading-tight">
                          {emp.full_name}
                        </div>

                        <div className="mt-1.5 space-y-0.5">
                          {emp.email && (
                            <div className="text-[10.5px] text-slate-500 truncate leading-tight">{emp.email}</div>
                          )}
                          {emp.phone && (
                            <div className="text-[11px] text-slate-500 truncate leading-tight">{emp.phone}</div>
                          )}
                        </div>

                        <div className="mt-1.5 space-y-0.5">
                          {emp.location && (
                            <div className="text-[10px] text-slate-400 truncate leading-tight">
                              <span className="font-semibold text-slate-500">Loc:</span> {emp.location}
                            </div>
                          )}
                          {(emp.date_of_birth || emp.hire_date) && (
                            <div className="text-[10px] text-slate-400 truncate leading-tight">
                              {emp.date_of_birth ? <><span className="font-semibold text-slate-500">DOB:</span> {fmtDate(emp.date_of_birth)}</> : null}
                              {emp.date_of_birth && emp.hire_date ? <span className="mx-1 text-slate-300">·</span> : null}
                              {emp.hire_date ? <><span className="font-semibold text-slate-500">Hired:</span> {fmtDate(emp.hire_date)}</> : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Hover-only controls (hidden by default, fade in on hover) ── */}

                  {/* Add sibling — right edge */}
                  <button
                    className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border-2 border-slate-200
                      flex items-center justify-center text-slate-400
                      hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600
                      shadow-sm transition-all duration-200 z-20
                      opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); openAddSibling(emp); }}
                    title="Add sibling (same level)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>

                  {/* Add child — bottom center */}
                  <button
                    className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border-2 border-slate-200
                      flex items-center justify-center text-slate-400
                      hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600
                      shadow-sm transition-all duration-200 z-20
                      opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); openAddChild(emp); }}
                    title="Add direct report (child)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>

                  {/* Expand / Collapse — bottom right */}
                  {expandable && (
                    <button
                      className="absolute -bottom-3.5 right-4 w-7 h-7 rounded-full bg-white border-2 border-slate-200
                        flex items-center justify-center text-slate-400
                        hover:bg-slate-100 hover:border-slate-400 hover:text-slate-700
                        shadow-sm transition-all duration-200 z-20
                        opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); toggleCollapseClick(emp.id); }}
                      title={isCollapsed ? "Expand children" : "Collapse children"}
                    >
                      {isCollapsed ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
                      )}
                    </button>
                  )}

                  {/* Quick delete — top right */}
                  <button
                    className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-white/80 backdrop-blur border border-slate-200
                      flex items-center justify-center text-slate-400
                      hover:text-red-500 hover:border-red-200 hover:bg-red-50
                      transition-all duration-200 z-20
                      opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${emp.full_name}?\n\nIf they have direct reports, you must reassign first.`)) {
                        deleteEmployee(emp.id);
                      }
                    }}
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-5 right-5 flex flex-col gap-1 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg p-1.5 z-20">
            <button className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-base font-bold text-slate-500 transition-colors"
              onClick={() => setZoom(z => Math.min(2, z + 0.15))}>+</button>
            <button className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 transition-colors"
              onClick={() => setZoom(1)}>1:1</button>
            <button className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-base font-bold text-slate-500 transition-colors"
              onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}>−</button>
            <div className="border-t border-slate-200 my-0.5" />
            <button className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors" onClick={fitToScreen} title="Fit to screen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          </div>

          <div className="absolute bottom-5 left-5 text-[11px] text-slate-400 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200 font-medium shadow-sm">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      )}

      {/* ═══ Edit/Create Employee Modal ═══ */}
      {editEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setEditEmp(null); setMsg(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border border-slate-200" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <span className="text-sm font-bold text-slate-800">{editEmp.id ? "Edit Employee" : "New Employee"}</span>
              </div>
              <button className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors" onClick={() => { setEditEmp(null); setMsg(null); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="flex items-center gap-4">
                {editEmp.avatar_url ? (
                  <img src={editEmp.avatar_url} alt="Avatar" className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200 shadow-sm" />
                ) : (
                  <div className="rounded-xl overflow-hidden border-2 border-slate-200 shadow-sm">
                    <AvatarIllustration name={editEmp.full_name || "?"} size={64} />
                  </div>
                )}
                <div>
                  <label className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <path d="m21 15-5-5L5 21"/>
                    </svg>
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                  {editEmp.avatar_url && (
                    <button className="ml-2 text-xs text-red-500 hover:underline" onClick={() => se("avatar_url", "")}>Remove</button>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1.5">Max 2MB · JPG, PNG, or GIF</p>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Basic Information</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Full Name *</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.full_name}
                      onChange={e => se("full_name", e.target.value)}
                      placeholder="e.g. John Smith"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Department</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.department}
                      onChange={e => se("department", e.target.value)}
                    >
                      <option value="">Select department…</option>
                      {deptOrder.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Role Picker</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={modalRoleOptions.includes(editEmp.position) ? editEmp.position : ""}
                      onChange={(e) => se("position", e.target.value)}
                      disabled={!editEmp.department}
                    >
                      <option value="">{editEmp.department ? "Select role…" : "Select department first…"}</option>
                      {modalRoleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Position (custom)</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.position}
                      onChange={e => se("position", e.target.value)}
                      placeholder="e.g. Senior Developer"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.email}
                      onChange={e => se("email", e.target.value)}
                      placeholder="user@company.com"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Phone</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.phone}
                      onChange={e => se("phone", e.target.value)}
                      placeholder="555-3010"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Location</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.location}
                      onChange={e => se("location", e.target.value)}
                      placeholder="e.g. Miami, FL"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Date of Birth</label>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.date_of_birth ?? ""}
                      onChange={e => se("date_of_birth", e.target.value || null)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Hire Date</label>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.hire_date ?? ""}
                      onChange={e => se("hire_date", e.target.value || null)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Reports To</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-blue-300 transition-all"
                      value={editEmp.manager_id ?? ""}
                      onChange={e => se("manager_id", e.target.value || null)}
                    >
                      <option value="">None (top level)</option>
                      {employees.filter(e => e.id !== editEmp.id && e.is_active).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name} — {e.position}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editEmp.is_active} onChange={e => se("is_active", e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5.5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors" style={{ width: 40, height: 22 }} />
                  <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm peer-checked:translate-x-[18px] transition-transform" style={{ width: 18, height: 18 }} />
                </label>
                <div>
                  <span className="text-xs font-semibold text-slate-700">Active Employee</span>
                  <span className="text-[10px] text-slate-400 ml-2">{editEmp.is_active ? "Visible in org chart" : "Hidden from org chart"}</span>
                </div>
              </div>

              {msg && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                  {msg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              {editEmp.id ? (
                <button
                  className="px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${editEmp.full_name}?\n\nDirect reports will need to be reassigned.`)) {
                      deleteEmployee(editEmp.id);
                    }
                  }}
                >
                  Delete Employee
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => { setEditEmp(null); setMsg(null); }}>
                  Cancel
                </button>
                <button
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50 hover:bg-blue-700 shadow-sm transition-all"
                  onClick={saveEmployee}
                  disabled={saving}
                >
                  {saving ? "Saving…" : editEmp.id ? "Save Changes" : "Create Employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ CANVAS HELPER ═══════════════════ */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
