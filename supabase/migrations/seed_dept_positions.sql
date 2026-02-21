-- Seed org_departments and org_department_roles with defaults (if tables are empty)
-- Tables are created by OrgChart module; this just ensures seed data exists.

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS org_departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_department_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  department_name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  UNIQUE(department_name, role_name)
);

-- Seed departments only if table is empty
INSERT INTO org_departments (name, sort_order)
SELECT name, sort_order FROM (VALUES
  ('Executive', 0),
  ('Sales', 1),
  ('Call Center', 2),
  ('Operations', 3),
  ('Finance', 4),
  ('Contingencies', 5)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM org_departments LIMIT 1)
ON CONFLICT (name) DO NOTHING;

-- Seed positions only if table is empty
INSERT INTO org_department_roles (department_name, role_name, sort_order)
SELECT department_name, role_name, sort_order FROM (VALUES
  ('Executive', 'CEO', 0),
  ('Executive', 'VP of Sales', 1),
  ('Executive', 'VP of Operations', 2),
  ('Sales', 'Sales Manager', 0),
  ('Sales', 'Sales Rep', 1),
  ('Sales', 'Appointment Setter (US)', 2),
  ('Sales', 'Sales Associate', 3),
  ('Call Center', 'CC Manager', 0),
  ('Call Center', 'Appointment Setter', 1),
  ('Call Center', 'CC Customer Support', 2),
  ('Operations', 'Operations Manager', 0),
  ('Operations', 'Project Manager', 1),
  ('Operations', 'Accounts Manager', 2),
  ('Operations', 'Project Coordinator', 3),
  ('Operations', 'Project Admin', 4),
  ('Operations', 'Project Associate', 5),
  ('Finance', 'Chief Accountant', 0),
  ('Finance', 'Accountant', 1),
  ('Finance', 'Payroll Accountant', 2),
  ('Finance', 'Auditor', 3),
  ('Finance', 'Bookkeeper', 4),
  ('Contingencies', 'Videographer', 0),
  ('Contingencies', 'Editor', 1),
  ('Contingencies', 'Lead Gen', 2)
) AS v(department_name, role_name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM org_department_roles LIMIT 1)
ON CONFLICT (department_name, role_name) DO NOTHING;
