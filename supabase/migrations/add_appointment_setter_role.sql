-- Ensure "Appointment Setter" position exists for Call Center department
INSERT INTO org_department_roles (department_name, role_name, sort_order)
VALUES ('Call Center', 'Appointment Setter', 1)
ON CONFLICT (department_name, role_name) DO NOTHING;
