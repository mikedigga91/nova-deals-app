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
  cardW: number;   // per-node width  (CEO is larger)
  cardH: number;   // per-node height (CEO is larger)
}

/**
 * Connector groups — one entry per parent that has children.
 * "bus"     = horizontal bar (CEO→level-1)
 * "spine"   = vertical rail + stubs (multiple children at depth ≥ 1)
 * "straight"= simple vertical drop (single-child chain at depth ≥ 1)
 */
type ConnectorGroup = {
  parentId: string;
  style: "bus" | "spine" | "straight";
  /** Parent bottom-centre */
  px: number;
  py: number;
  /** Each child's attachment point */
  children: { id: string; cx: number; cy: number; cardW: number; cardH: number }[];
};

/* Dept config types (optional tables) */
type OrgDepartment = { id: string; name: string; sort_order: number };
type OrgRole = { id: string; department_name: string; role_name: string; sort_order: number };

/* ═══════════════════ CONSTANTS ═══════════════════ */

const CARD_W = 264;               // Standard card width
const CARD_H = 164;               // Standard card height

/* ── CEO card is slightly larger ── */
const CEO_CARD_W = CARD_W + 40;   // 304px — wider for the root/CEO card
const CEO_CARD_H = CARD_H + 20;   // 184px — taller for the root/CEO card

/* ── Layout spacing (tweak these to adjust the chart) ── */
const SIBLING_GAP_X = 56;         // Horizontal gap between level-1 sibling columns
const STACK_GAP_Y   = 28;         // Vertical gap between stacked sub-cards (depth ≥ 2)
const V_GAP = 72;                 // Vertical gap between a parent and the first row of children
const SPINE_OFFSET_X = 24;        // How far left of the stacked cards the vertical spine line sits

/* Department hex colors for card styling */
type DeptHexColor = { bar: string; barText: string; cardBg: string; cardBorder: string };

const DEPT_HEX_COLORS: Record<string, DeptHexColor> = {
  Executive: { bar: "#1e293b", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#334155" },
  Finance: { bar: "#334155", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#475569" },
  Operation: { bar: "#475569", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#64748b" },
  HR: { bar: "#374151", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#4b5563" },
  "Call Center": { bar: "#3f3f46", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#52525b" },
  Sales: { bar: "#27272a", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#3f3f46" },
  Contingencies: { bar: "#44403c", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#57534e" },
};
const DEFAULT_DEPT_HEX: DeptHexColor = { bar: "#475569", barText: "#ffffff", cardBg: "#ffffff", cardBorder: "#94a3b8" };

/* Tailwind-based badge colors for dept tabs (kept for tab styling) */
const DEPT_COLORS: Record<string, { badge: string; badgeText: string }> = {
  Executive: { badge: "bg-slate-100", badgeText: "text-slate-800" },
  Finance: { badge: "bg-gray-100", badgeText: "text-gray-700" },
  Operation: { badge: "bg-zinc-100", badgeText: "text-zinc-700" },
  HR: { badge: "bg-stone-100", badgeText: "text-stone-700" },
  "Call Center": { badge: "bg-neutral-100", badgeText: "text-neutral-700" },
  Sales: { badge: "bg-slate-100", badgeText: "text-slate-700" },
  Contingencies: { badge: "bg-gray-100", badgeText: "text-gray-700" },
};
const DEFAULT_DEPT_COLOR = { badge: "bg-slate-100", badgeText: "text-slate-600" };
const getDeptColor = (dept: string) => DEPT_COLORS[dept] || DEFAULT_DEPT_COLOR;

/* Depth-based visual intensity */
function getDepthStyle(depth: number): { shadow: string; borderWidth: number } {
  if (depth === 0) return { shadow: "0 4px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)", borderWidth: 5 };
  if (depth === 1) return { shadow: "0 3px 16px rgba(0,0,0,0.08), 0 1px 6px rgba(0,0,0,0.05)", borderWidth: 4 };
  if (depth === 2) return { shadow: "0 2px 10px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)", borderWidth: 3 };
  return { shadow: "0 1px 6px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)", borderWidth: 3 };
}

/* Color palette for custom department / employee colors
   Organized: grayscale row + 7 hues × 3 shades (light → base → dark) */
const COLOR_PALETTE = [
  /* Grayscale */
  { name: "White", hex: "#ffffff" },
  { name: "Light Gray", hex: "#d1d5db" },
  { name: "Gray", hex: "#6b7280" },
  { name: "Dark Gray", hex: "#374151" },
  { name: "Black", hex: "#111827" },
  /* Amber */
  { name: "Amber Light", hex: "#fcd34d" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Amber Dark", hex: "#b45309" },
  /* Rose */
  { name: "Rose Light", hex: "#fda4af" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Rose Dark", hex: "#be123c" },
  /* Fuchsia */
  { name: "Fuchsia Light", hex: "#f0abfc" },
  { name: "Fuchsia", hex: "#d946ef" },
  { name: "Fuchsia Dark", hex: "#a21caf" },
  /* Purple */
  { name: "Purple Light", hex: "#c4b5fd" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Purple Dark", hex: "#7e22ce" },
  /* Blue */
  { name: "Blue Light", hex: "#93c5fd" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Blue Dark", hex: "#1d4ed8" },
  /* Cyan */
  { name: "Cyan Light", hex: "#67e8f9" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Cyan Dark", hex: "#0e7490" },
  /* Emerald */
  { name: "Emerald Light", hex: "#6ee7b7" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Emerald Dark", hex: "#047857" },
];

function deriveDeptColorFromHex(hex: string): DeptHexColor {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darken = (v: number) => Math.round(v * 0.65);
  const bar = `#${darken(r).toString(16).padStart(2, "0")}${darken(g).toString(16).padStart(2, "0")}${darken(b).toString(16).padStart(2, "0")}`;
  const tint = (v: number) => Math.round(255 - (255 - v) * 0.20);
  const cardBg = `#${tint(r).toString(16).padStart(2, "0")}${tint(g).toString(16).padStart(2, "0")}${tint(b).toString(16).padStart(2, "0")}`;
  return { bar, barText: "#ffffff", cardBg, cardBorder: hex };
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
const LS_CUSTOM_COLORS = "orgchart_dept_colors_v1";
const LS_EMP_COLORS = "orgchart_emp_colors_v1";

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

async function adminAuthAction(action: string, payload: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return; // silently skip if not authenticated
  try {
    await fetch("/api/admin/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    // Fire-and-forget — don't block OrgChart operations
  }
}

function getAncestorIds(empId: string, employees: Employee[]): string[] {
  const empMap = new Map(employees.map(e => [e.id, e]));
  const ids: string[] = [];
  const visited = new Set<string>();
  let current = empMap.get(empId);
  while (current?.manager_id) {
    if (visited.has(current.manager_id)) break;
    visited.add(current.manager_id);
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
        const visited = new Set<string>();
        let current: Employee | undefined = emp;
        while (current) {
          if (visited.has(current.id)) break;
          visited.add(current.id);
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

/*
 * ══════════════════════════════════════════════════════════════════════
 *  LAYOUT ALGORITHM — "Horizontal level-1, vertical stacks deeper"
 *
 *  Matches the reference org-chart image exactly:
 *
 *    ┌─────────┐                          ← depth 0: CEO (big card)
 *    └────┬────┘
 *    ─────┼─────────────────── bus line    ← horizontal bar across level-1
 *    ┌────┴───┐  ┌────┴───┐  ┌────┴───┐
 *    │Employee1│  │Employee2│  │Employee3│  ← depth 1: horizontal siblings
 *    └────┬───┘  └────┬───┘  └────┬───┘
 *         │           │           │        ← each owns a VERTICAL column
 *      ┌──┤        ┌──┤        ┌──┤
 *      │Sub1│      │Sub1│      │Sub1│      ← depth ≥ 2: stacked vertically
 *      ├──┤        ├──┤        ├──┤          with a left-side spine line
 *      │Sub2│      │Sub2│      │Sub2│
 *      └──┘        └──┘        ├──┤
 *                              │Sub3│
 *                              └──┘
 *
 *  Connector styles:
 *    • "bus"  — CEO to level-1 children: horizontal bar + vertical drops
 *    • "spine"— level-1+ to deeper children: vertical rail on the left
 *              with short horizontal stubs to each card
 * ══════════════════════════════════════════════════════════════════════
 */

/** Card dimensions for a given depth (CEO = depth 0 gets the big card) */
function cardSize(depth: number): { w: number; h: number } {
  return depth === 0
    ? { w: CEO_CARD_W, h: CEO_CARD_H }
    : { w: CARD_W, h: CARD_H };
}

/**
 * Compute the width each column/subtree needs.
 *  - depth 0 (CEO): children are horizontal → sum of children widths + gaps
 *  - depth ≥ 1: children stacked vertically → parent card width/2 + gap + widest child subtree
 *
 * For vertical stacks the spine drops straight from parent centre, so
 * children sit to the right: parentW/2 + SPINE_OFFSET_X + childSubtreeW
 */
function computeSubtreeWidths(node: TreeNode, depth: number = 0): number {
  const { w } = cardSize(depth);

  if (node.children.length === 0) {
    node.subtreeWidth = w;
    return w;
  }

  if (depth === 0) {
    // CEO's children lay out horizontally
    let total = 0;
    for (const child of node.children) total += computeSubtreeWidths(child, depth + 1);
    total += (node.children.length - 1) * SIBLING_GAP_X;
    node.subtreeWidth = Math.max(w, total);
    return node.subtreeWidth;
  }

  // depth ≥ 1 → vertical stack
  let maxChildW = 0;
  for (const child of node.children) {
    maxChildW = Math.max(maxChildW, computeSubtreeWidths(child, depth + 1));
  }

  if (node.children.length === 1) {
    // Single child → placed directly below parent (no indent).
    // Column width = max of parent card and child subtree
    node.subtreeWidth = Math.max(w, maxChildW);
  } else {
    // Multiple children → spine + stubs, children sit to right of parent centre
    const rightSide = SPINE_OFFSET_X + maxChildW;
    node.subtreeWidth = Math.max(w, w / 2 + rightSide);
  }
  return node.subtreeWidth;
}

/**
 * Position every node.
 *  - depth 0: centred in its subtree
 *  - depth 0→children: spread horizontally (each centred in its column)
 *  - depth ≥ 1→children: stacked vertically, left-aligned with spine offset
 */
function positionNodes(node: TreeNode, x: number, y: number, depth: number = 0): void {
  const { w, h } = cardSize(depth);

  // Centre this node within its subtree band
  node.x = x + node.subtreeWidth / 2 - w / 2;
  node.y = y;

  if (node.children.length === 0) return;

  if (depth === 0) {
    // Horizontal layout for level-1 children
    let childX = x;
    for (const child of node.children) {
      positionNodes(child, childX, y + h + V_GAP, depth + 1);
      childX += child.subtreeWidth + SIBLING_GAP_X;
    }
  } else if (node.children.length === 1) {
    // Single child → place directly below parent, centered in same column
    // No indent — keeps linear chains compact
    const child = node.children[0];
    positionNodes(child, x, y + h + V_GAP, depth + 1);
  } else {
    // Multiple children → spine layout, children to the RIGHT of parent centre
    const spineX = node.x + w / 2;
    const childStartX = spineX + SPINE_OFFSET_X;
    let childY = y + h + V_GAP;
    for (const child of node.children) {
      positionNodes(child, childStartX, childY, depth + 1);
      const subtreeH = getSubtreeHeight(child, depth + 1);
      childY += subtreeH + STACK_GAP_Y;
    }
  }
}

/** Total pixel height of a node's subtree (for vertical stack spacing) */
function getSubtreeHeight(node: TreeNode, depth: number): number {
  const { h } = cardSize(depth);
  if (node.children.length === 0) return h;

  let childrenH = 0;
  for (let i = 0; i < node.children.length; i++) {
    childrenH += getSubtreeHeight(node.children[i], depth + 1);
    if (i < node.children.length - 1) childrenH += STACK_GAP_Y;
  }
  return h + V_GAP + childrenH;
}

/**
 * Flatten tree → flat LayoutNode[] for rendering.
 * parentX/parentY point to the parent's bottom-centre.
 */
function flattenTree(node: TreeNode, parentX: number | null, parentY: number | null, depth: number): LayoutNode[] {
  const { w, h } = cardSize(depth);
  const result: LayoutNode[] = [{
    employee: node.employee,
    x: node.x,
    y: node.y,
    parentX,
    parentY,
    depth,
    cardW: w,
    cardH: h,
  }];
  for (const child of node.children) {
    result.push(...flattenTree(child, node.x + w / 2, node.y + h, depth + 1));
  }
  return result;
}

/**
 * Build connector groups — one group per parent.
 *  "bus"  = CEO→level-1 (horizontal bar + vertical drops)
 *  "spine"= depth≥1→children (vertical rail on left + horizontal stubs)
 */
function buildConnectors(node: TreeNode, depth: number = 0): ConnectorGroup[] {
  const groups: ConnectorGroup[] = [];
  const { w, h } = cardSize(depth);

  if (node.children.length > 0) {
    const childSize = cardSize(depth + 1);
    let style: ConnectorGroup["style"];
    if (depth === 0) style = "bus";
    else if (node.children.length === 1) style = "straight";
    else style = "spine";

    const group: ConnectorGroup = {
      parentId: node.employee.id,
      style,
      px: node.x + w / 2,
      py: node.y + h,
      children: node.children.map(child => ({
        id: child.employee.id,
        cx: child.x + childSize.w / 2,
        cy: child.y,
        cardW: childSize.w,
        cardH: childSize.h,
      })),
    };
    groups.push(group);

    for (const child of node.children) {
      groups.push(...buildConnectors(child, depth + 1));
    }
  }

  return groups;
}

function layoutTree(employees: Employee[], collapsedSet: Set<string>, filterDept: string | null): {
  nodes: LayoutNode[];
  connectors: ConnectorGroup[];
  width: number;
  height: number;
} {
  const root = buildTree(employees, collapsedSet, filterDept);
  if (!root) return { nodes: [], connectors: [], width: 0, height: 0 };
  computeSubtreeWidths(root, 0);
  positionNodes(root, 80, 80, 0);
  const nodes = flattenTree(root, null, null, 0);
  const connectors = buildConnectors(root, 0);

  let maxX = 0, maxY = 0;
  for (const n of nodes) {
    if (n.x + n.cardW > maxX) maxX = n.x + n.cardW;
    if (n.y + n.cardH > maxY) maxY = n.y + n.cardH;
  }
  return { nodes, connectors, width: maxX + 80, height: maxY + 80 };
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function OrgChart() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set());
  const [filterDept, setFilterDept] = useState<string | null>(null);

  const [linkedEmployeeIds, setLinkedEmployeeIds] = useState<Set<string>>(new Set());

  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(0.85);
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

  /* Custom department colors (persisted to localStorage) */
  const [customDeptColors, setCustomDeptColors] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(LS_CUSTOM_COLORS);
      if (saved) { const parsed = JSON.parse(saved); if (parsed && typeof parsed === "object") return parsed; }
    } catch { /* ignore */ }
    return {};
  });

  /* Custom per-employee colors (persisted to localStorage) */
  const [customEmpColors, setCustomEmpColors] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(LS_EMP_COLORS);
      if (saved) { const parsed = JSON.parse(saved); if (parsed && typeof parsed === "object") return parsed; }
    } catch { /* ignore */ }
    return {};
  });

  /* Color being edited in the modal (null = use department color) */
  const [editEmpColor, setEditEmpColor] = useState<string | null>(null);

  const getCardColor = useCallback((dept: string, empId?: string): DeptHexColor => {
    if (empId && customEmpColors[empId]) return deriveDeptColorFromHex(customEmpColors[empId]);
    const custom = customDeptColors[dept];
    if (custom) return deriveDeptColorFromHex(custom);
    return DEPT_HEX_COLORS[dept] || DEFAULT_DEPT_HEX;
  }, [customDeptColors, customEmpColors]);

  /* Card drag/drop for ordering and re-parenting */
  const cardDragRef = useRef<{ id: string } | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; zone: "left" | "right" | "child" } | null>(null);

  /* ── Data Loading ── */
  const load = useCallback(async () => {
    setLoading(true);

    const [{ data }, { data: linkedData }] = await Promise.all([
      supabase.from("employees").select("*"),
      supabase.from("portal_users").select("linked_employee_id").not("linked_employee_id", "is", null),
    ]);
    if (data) setEmployees(data as Employee[]);
    if (linkedData) {
      setLinkedEmployeeIds(new Set(linkedData.map((r: any) => r.linked_employee_id).filter(Boolean)));
    }
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

  useEffect(() => {
    try { localStorage.setItem(LS_CUSTOM_COLORS, JSON.stringify(customDeptColors)); } catch { /* ignore */ }
  }, [customDeptColors]);

  useEffect(() => {
    try { localStorage.setItem(LS_EMP_COLORS, JSON.stringify(customEmpColors)); } catch { /* ignore */ }
  }, [customEmpColors]);

  /* ── Layout ── */
  const { nodes, connectors, width: treeWidth, height: treeHeight } = useMemo(
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
        const scrollX = (target.x + target.cardW / 2) * zoom - rect.width / 2;
        const scrollY = (target.y + target.cardH / 2) * zoom - rect.height / 2;
        containerRef.current.scrollTo({ left: Math.max(0, scrollX), top: Math.max(0, scrollY), behavior: "smooth" });
      }
    }, 50);

    setSearchOpen(false);
    setSearchQuery("");
  }, [employees, collapsedSet, zoom]);

  /* ── Zoom Controls (CTRL/CMD + wheel only) ── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // only zoom with CTRL/CMD held
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
    // Reset scroll position — scrollbars handle navigation now
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  }, [nodes.length, treeWidth, treeHeight]);

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
      // Updating existing employee
      const { error } = await supabase.from("employees").update(payload).eq("id", editEmp.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }

      // Save or remove per-employee color
      setCustomEmpColors(prev => {
        const next = { ...prev };
        if (editEmpColor) next[editEmp.id] = editEmpColor; else delete next[editEmp.id];
        return next;
      });

      // Sync is_active toggle to linked portal_user
      const oldEmp = employees.find(e => e.id === editEmp.id);
      if (oldEmp && oldEmp.is_active !== editEmp.is_active) {
        if (!editEmp.is_active) {
          // Deactivating employee → deactivate linked portal user + ban auth
          const { data: deactivatedPU } = await supabase.from("portal_users")
            .update({ is_active: false, deactivation_source: "orgchart_deactivated" })
            .eq("linked_employee_id", editEmp.id)
            .select("id, auth_uid");
          if (deactivatedPU) {
            for (const pu of deactivatedPU) {
              if (pu.auth_uid) adminAuthAction("ban", { portal_user_id: pu.id });
            }
          }
        } else {
          // Reactivating employee → reactivate portal user + unban auth
          const { data: reactivatedPU } = await supabase.from("portal_users")
            .update({ is_active: true, deactivation_source: null })
            .eq("linked_employee_id", editEmp.id)
            .eq("deactivation_source", "orgchart_deactivated")
            .select("id, auth_uid");
          if (reactivatedPU) {
            for (const pu of reactivatedPU) {
              if (pu.auth_uid) adminAuthAction("unban", { portal_user_id: pu.id });
            }
          }
        }
      }
    } else {
      // Creating new employee — get back the inserted row
      const { data: inserted, error } = await supabase.from("employees").insert(payload).select("id, email, full_name").single();
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }

      // Save per-employee color for the newly created employee
      if (inserted && editEmpColor) {
        setCustomEmpColors(prev => ({ ...prev, [inserted.id]: editEmpColor }));
      }

      // Auto-create or link portal_user if employee has an email
      if (inserted && inserted.email) {
        const { data: existingUser } = await supabase.from("portal_users")
          .select("id")
          .eq("email", inserted.email)
          .maybeSingle();

        if (existingUser) {
          // Link existing portal user to this employee
          await supabase.from("portal_users")
            .update({ linked_employee_id: inserted.id })
            .eq("id", existingUser.id);
        } else {
          // Create new portal user linked to this employee
          await supabase.from("portal_users").insert({
            display_name: inserted.full_name,
            email: inserted.email,
            linked_employee_id: inserted.id,
            is_active: true,
            role_id: null,
          });
        }
      }
    }

    setEditEmp(null);
    setEditEmpColor(null);
    setSaving(false);
    load();
  }

  async function deleteEmployee(id: string) {
    const hasReports = employees.some(e => e.manager_id === id && e.is_active);
    if (hasReports) {
      setMsg("Cannot delete: this employee has direct reports. Reassign them first.");
      return;
    }
    // Deactivate linked portal user BEFORE deleting (ON DELETE SET NULL clears the FK after)
    const { data: removedPU } = await supabase.from("portal_users")
      .update({ is_active: false, deactivation_source: "orgchart_removed" })
      .eq("linked_employee_id", id)
      .select("id, auth_uid");
    if (removedPU) {
      for (const pu of removedPU) {
        if (pu.auth_uid) adminAuthAction("ban", { portal_user_id: pu.id });
      }
    }

    await supabase.from("employees").delete().eq("id", id);

    // Clean up per-employee color
    setCustomEmpColors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    setEditEmp(null);
    setEditEmpColor(null);
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
    setEditEmpColor(null);
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
    setEditEmpColor(null);
    setMsg(null);
  };

  /* ── Card Drag & Drop (reorder + reparent) ── */
  const onCardDragStart = (id: string) => (e: React.DragEvent) => {
    cardDragRef.current = { id };
    setIsDraggingCard(true);
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
    setIsDraggingCard(false);
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

    // Clean white background
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, treeWidth, treeHeight);

    // Draw connectors — solid lines matching SVG renderer
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    for (const group of connectors) {
      if (group.style === "bus") {
        const firstChild = group.children[0];
        const lastChild = group.children[group.children.length - 1];
        const midY = group.py + (firstChild.cy - group.py) / 2;
        ctx.beginPath(); ctx.moveTo(group.px, group.py); ctx.lineTo(group.px, midY); ctx.stroke();
        if (group.children.length > 1) {
          ctx.beginPath(); ctx.moveTo(firstChild.cx, midY); ctx.lineTo(lastChild.cx, midY); ctx.stroke();
        }
        for (const child of group.children) {
          ctx.beginPath(); ctx.moveTo(child.cx, midY); ctx.lineTo(child.cx, child.cy); ctx.stroke();
        }
      } else if (group.style === "straight") {
        // Straight: single child directly below
        const child = group.children[0];
        ctx.beginPath(); ctx.moveTo(group.px, group.py); ctx.lineTo(child.cx, child.cy); ctx.stroke();
      } else {
        // Spine: vertical rail + horizontal stubs to children
        const spineX = group.px;
        const lastChild = group.children[group.children.length - 1];
        const lastStubY = lastChild.cy + lastChild.cardH / 2;
        ctx.beginPath(); ctx.moveTo(spineX, group.py); ctx.lineTo(spineX, lastStubY); ctx.stroke();
        for (const child of group.children) {
          const stubY = child.cy + child.cardH / 2;
          const cardLeft = child.cx - child.cardW / 2;
          ctx.beginPath(); ctx.moveTo(spineX, stubY); ctx.lineTo(cardLeft, stubY); ctx.stroke();
        }
      }
    }

    for (const node of nodes) {
      const { x, y, employee: emp, depth, cardW: cw, cardH: ch } = node;
      const dc = getCardColor(emp.department, emp.id);
      const ds = getDepthStyle(depth);

      ctx.fillStyle = "rgba(0,0,0,0.06)";
      roundRect(ctx, x + 2, y + 2, cw, ch, 8);
      ctx.fill();

      ctx.fillStyle = dc.cardBg;
      ctx.strokeStyle = dc.cardBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, cw, ch, 8);
      ctx.fill();
      ctx.stroke();

      // Left accent border
      ctx.fillStyle = dc.cardBorder;
      ctx.fillRect(x, y + 8, ds.borderWidth, ch - 16);

      ctx.fillStyle = dc.bar;
      roundRect(ctx, x, y, cw, 30, 8);
      ctx.fill();
      ctx.fillRect(x, y + 20, cw, 10);

      ctx.fillStyle = dc.barText;
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emp.position || emp.department, x + cw / 2, y + 15);

      ctx.fillStyle = "#1f2937";
      ctx.font = "italic 12px system-ui, sans-serif";
      ctx.fillText(emp.full_name, x + cw / 2, y + 56, cw - 70);

      ctx.fillStyle = "#6b7280";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(emp.phone || "", x + cw / 2, y + 76, cw - 70);

      ctx.fillStyle = "#6b7280";
      ctx.fillText(emp.email || "", x + cw / 2, y + 96, cw - 70);

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
    <div className="min-h-screen bg-slate-50 flex flex-col p-4" style={{ height: "calc(100vh - 64px)" }}>
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* ═══ Toolbar ═══ */}
      <div className="flex-shrink-0 border-b border-slate-200">
        <div className="px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Nova NRG Organizational Chart</h2>
                <p className="text-xs text-slate-400">{employees.filter(e => e.is_active).length} active members</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Search */}
              <div className="relative" ref={searchRef}>
                <input
                  className="w-60 border border-slate-200 rounded-lg px-3.5 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 pl-9 transition-all"
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
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors"
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
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 shadow-sm transition-all flex items-center gap-1.5"
                onClick={() => { setEditEmp({ ...blankEmployee }); setEditEmpColor(null); }}
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
                const deptBadge = getDeptColor(dept);
                const deptHex = getCardColor(dept);
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
                        active ? "shadow-sm border-transparent" : "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200"
                      }`}
                      style={active ? { backgroundColor: deptHex.cardBg, color: deptHex.bar, borderColor: deptHex.cardBorder + "66" } : undefined}
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: deptHex.cardBorder }} />
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
                  <button className="text-[11px] font-semibold text-slate-700 hover:text-slate-900" onClick={addDepartment}>Add</button>
                  <button className="text-[11px] font-semibold text-slate-400 hover:text-slate-600" onClick={() => { setDeptAddOpen(false); setDeptAddValue(""); }}>Cancel</button>
                </div>
              )}
            </div>
          </div>

          {/* Roles panel with Input Area + Color Picker */}
          {activeDept && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{activeDept} Roles</div>

                <div className="flex items-center gap-2">
                  <input
                    className="w-72 border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                    placeholder="Input Area: add role to this department"
                    value={roleInput[activeDept] || ""}
                    onChange={(e) => setRoleInput(prev => ({ ...prev, [activeDept]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addRoleToDept(activeDept); }}
                  />
                  <button className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[12px] font-semibold hover:bg-slate-900 transition-all" onClick={() => addRoleToDept(activeDept)}>
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

              {/* Color Picker */}
              <div className="mt-2.5 pt-2.5 border-t border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PALETTE.map(c => {
                      const isSelected = customDeptColors[activeDept] === c.hex
                        || (!customDeptColors[activeDept] && DEPT_HEX_COLORS[activeDept]?.cardBorder === c.hex);
                      return (
                        <button
                          key={c.hex}
                          className={`w-6 h-6 rounded-full border border-slate-200 transition-all duration-150 ${isSelected ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-110"}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                          onClick={() => setCustomDeptColors(prev => ({ ...prev, [activeDept]: c.hex }))}
                        />
                      );
                    })}
                  </div>
                  {customDeptColors[activeDept] && (
                    <button
                      className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-md hover:bg-white"
                      onClick={() => setCustomDeptColors(prev => {
                        const next = { ...prev };
                        delete next[activeDept];
                        return next;
                      })}
                    >
                      Reset
                    </button>
                  )}
                </div>
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
              className="mt-4 px-5 py-2.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 shadow-sm transition-all"
              onClick={() => { setEditEmp({ ...blankEmployee }); setEditEmpColor(null); }}
            >
              + Add Employee
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative select-none"
          style={{
            /* Clean white background with subtle dot grid */
            backgroundColor: "#fafafa",
            backgroundImage: "radial-gradient(circle, #e2e2e2 0.6px, transparent 0.6px)",
            backgroundSize: "28px 28px",
          }}
          onWheel={handleWheel}
        >
          {/* Sizing wrapper — sets scrollable area to scaled tree dimensions */}
          <div
            style={{
              width: treeWidth * zoom,
              height: treeHeight * zoom,
              position: "relative",
              minWidth: "100%",
              minHeight: "100%",
            }}
          >
          {/* Scaled content layer */}
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              width: treeWidth,
              height: treeHeight,
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {/* Connector lines — solid, visible */}
            <svg style={{ position: "absolute", top: 0, left: 0, width: treeWidth, height: treeHeight, pointerEvents: "none" }}>
              {connectors.map(group => {
                const lnProps = { fill: "none", stroke: "#94a3b8", strokeWidth: 2 };

                if (group.style === "bus") {
                  /* Bus connector (CEO → level-1): horizontal bar + vertical drops */
                  const firstChild = group.children[0];
                  const lastChild = group.children[group.children.length - 1];
                  const midY = group.py + (firstChild.cy - group.py) / 2;
                  return (
                    <g key={`bus-${group.parentId}`}>
                      <line x1={group.px} y1={group.py} x2={group.px} y2={midY} {...lnProps} />
                      {group.children.length > 1 && (
                        <line x1={firstChild.cx} y1={midY} x2={lastChild.cx} y2={midY} {...lnProps} />
                      )}
                      {group.children.map(child => (
                        <line key={`drop-${child.id}`} x1={child.cx} y1={midY} x2={child.cx} y2={child.cy} {...lnProps} />
                      ))}
                    </g>
                  );
                }

                if (group.style === "straight") {
                  /* Straight connector: single child directly below parent */
                  const child = group.children[0];
                  return (
                    <g key={`straight-${group.parentId}`}>
                      <line x1={group.px} y1={group.py} x2={child.cx} y2={child.cy} {...lnProps} />
                    </g>
                  );
                }

                /* Spine connector: vertical rail + horizontal stubs to each child */
                const spineX = group.px;
                const lastChild = group.children[group.children.length - 1];
                const lastStubY = lastChild.cy + lastChild.cardH / 2;

                return (
                  <g key={`spine-${group.parentId}`}>
                    <line x1={spineX} y1={group.py} x2={spineX} y2={lastStubY} {...lnProps} />
                    {group.children.map(child => {
                      const stubY = child.cy + child.cardH / 2;
                      const cardLeft = child.cx - child.cardW / 2;
                      return (
                        <line key={`stub-${child.id}`} x1={spineX} y1={stubY} x2={cardLeft} y2={stubY} {...lnProps} />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Cards */}
            {nodes.map(node => {
              const emp = node.employee;
              const dc = getCardColor(emp.department, emp.id);
              const ds = getDepthStyle(node.depth);
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
                    width: node.cardW,
                    height: node.cardH,
                  }}
                  className={`group transition-all duration-200 hover:-translate-y-0.5 ${isDragging ? "opacity-40" : ""}`}
                >
                  {/* ── Drop zone indicators (pointer-events only during drag) ── */}

                  {/* Left reorder zone */}
                  <div
                    className={`absolute -left-3 top-2 bottom-2 w-8 z-30 rounded-l-lg ${isDraggingCard ? "" : "pointer-events-none"}`}
                    onDragOver={allowDrop}
                    onDragEnter={onZoneDragEnter(emp.id, "left")}
                    onDragLeave={onZoneDragLeave}
                    onDrop={onDropReorderSibling(emp, "left")}
                  >
                    <div className={`h-full w-1 rounded-full mx-auto transition-all duration-150 ${isDropLeft ? "bg-slate-500 scale-x-150" : "bg-transparent"}`} />
                  </div>

                  {/* Right reorder zone */}
                  <div
                    className={`absolute -right-3 top-2 bottom-2 w-8 z-30 rounded-r-lg ${isDraggingCard ? "" : "pointer-events-none"}`}
                    onDragOver={allowDrop}
                    onDragEnter={onZoneDragEnter(emp.id, "right")}
                    onDragLeave={onZoneDragLeave}
                    onDrop={onDropReorderSibling(emp, "right")}
                  >
                    <div className={`h-full w-1 rounded-full mx-auto transition-all duration-150 ${isDropRight ? "bg-slate-500 scale-x-150" : "bg-transparent"}`} />
                  </div>

                  {/* Bottom re-parent zone */}
                  <div
                    className={`absolute left-4 right-4 -bottom-5 h-10 z-30 rounded-b-lg transition-all duration-150 ${isDraggingCard ? "" : "pointer-events-none"} ${isDropChild ? "bg-slate-500/10 border-2 border-dashed border-slate-400 rounded-lg" : ""}`}
                    onDragOver={allowDrop}
                    onDragEnter={onZoneDragEnter(emp.id, "child")}
                    onDragLeave={onZoneDragLeave}
                    onDrop={onDropMakeChild(emp)}
                  />

                  {/* ── Card visual ── */}
                  <div
                    className={`
                      w-full h-full rounded-xl overflow-hidden
                      transition-all duration-200
                      ${isHighlighted ? "ring-2 ring-slate-500 ring-offset-2" : ""}
                      ${isDropChild ? "ring-2 ring-slate-400 ring-offset-1" : ""}
                    `}
                    style={{
                      backgroundColor: dc.cardBg,
                      borderTop: `1px solid ${dc.cardBorder}66`,
                      borderRight: `1px solid ${dc.cardBorder}66`,
                      borderBottom: `1px solid ${dc.cardBorder}66`,
                      borderLeft: `${ds.borderWidth}px solid ${dc.cardBorder}`,
                      boxShadow: ds.shadow,
                    }}
                    onClick={() => { setEditEmp({ ...emp }); setEditEmpColor(customEmpColors[emp.id] || null); }}
                  >
                    {/* Title bar */}
                    <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: dc.bar }}>
                      <span className="text-[11px] font-bold tracking-wide" style={{ color: dc.barText }}>
                        {emp.position || emp.department || "Employee"}
                      </span>
                      {linkedEmployeeIds.has(emp.id) && (
                        <span className="text-[8px] font-bold bg-slate-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                          Portal User
                        </span>
                      )}
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
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border-2 border-slate-200
                      flex items-center justify-center text-slate-400
                      hover:bg-slate-50 hover:border-slate-400 hover:text-slate-700
                      shadow-sm transition-all duration-200 z-40
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
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border-2 border-slate-200
                      flex items-center justify-center text-slate-400
                      hover:bg-slate-50 hover:border-slate-400 hover:text-slate-700
                      shadow-sm transition-all duration-200 z-40
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
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                      className="absolute -bottom-3.5 right-4 w-7 h-7 rounded-full bg-white border-2 border-slate-300
                        flex items-center justify-center text-slate-500
                        hover:bg-slate-100 hover:border-slate-400 hover:text-slate-700
                        shadow-sm transition-all duration-200 z-40
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
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-white/80 backdrop-blur border border-slate-200
                      flex items-center justify-center text-slate-400
                      hover:text-red-500 hover:border-red-200 hover:bg-red-50
                      transition-all duration-200 z-40
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
          </div>{/* end inner absolute layer */}
          </div>{/* end sizing wrapper */}

          {/* Zoom Controls — sticky over scroll area */}
          <div className="sticky bottom-5 right-5 float-right mr-5 flex flex-col gap-1 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg p-1.5 z-20" style={{ marginTop: -180 }}>
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
        </div>
      )}

      </div>{/* end rounded card wrapper */}

      {/* ═══ Edit/Create Employee Modal ═══ */}
      {editEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setEditEmp(null); setEditEmpColor(null); setMsg(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border border-slate-200" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <span className="text-sm font-bold text-slate-800">{editEmp.id ? "Edit Employee" : "New Employee"}</span>
              </div>
              <button className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors" onClick={() => { setEditEmp(null); setEditEmpColor(null); setMsg(null); }}>
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
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.full_name}
                      onChange={e => se("full_name", e.target.value)}
                      placeholder="e.g. John Smith"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Department</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
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
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
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
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.position}
                      onChange={e => se("position", e.target.value)}
                      placeholder="e.g. Senior Developer"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.email}
                      onChange={e => se("email", e.target.value)}
                      placeholder="user@company.com"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Phone</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.phone}
                      onChange={e => se("phone", e.target.value)}
                      placeholder="555-3010"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Location</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.location}
                      onChange={e => se("location", e.target.value)}
                      placeholder="e.g. Miami, FL"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Date of Birth</label>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.date_of_birth ?? ""}
                      onChange={e => se("date_of_birth", e.target.value || null)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Hire Date</label>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
                      value={editEmp.hire_date ?? ""}
                      onChange={e => se("hire_date", e.target.value || null)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">Reports To</label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all"
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

              {/* Card Color Picker */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Card Color</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PALETTE.map(c => {
                      const isSelected = editEmpColor === c.hex;
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          className={`w-6 h-6 rounded-full border border-slate-200 transition-all duration-150 ${isSelected ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-110"}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                          onClick={() => setEditEmpColor(c.hex)}
                        />
                      );
                    })}
                  </div>
                  {editEmpColor && (
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-md hover:bg-white"
                      onClick={() => setEditEmpColor(null)}
                    >
                      Use department color
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editEmp.is_active} onChange={e => se("is_active", e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5.5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-slate-200 rounded-full peer peer-checked:bg-slate-700 transition-colors" style={{ width: 40, height: 22 }} />
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
                <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => { setEditEmp(null); setEditEmpColor(null); setMsg(null); }}>
                  Cancel
                </button>
                <button
                  className="px-5 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 hover:bg-slate-900 shadow-sm transition-all"
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
