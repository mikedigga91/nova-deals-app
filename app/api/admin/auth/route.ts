import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  // Verify caller's Supabase access token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !caller) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Check caller has user_management module access
  const { data: callerPortal } = await supabaseAdmin
    .from("portal_users")
    .select("id, role_id, module_overrides, is_active")
    .eq("email", caller.email)
    .single();

  if (!callerPortal || !callerPortal.is_active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let hasAccess = false;
  if (callerPortal.module_overrides && callerPortal.module_overrides.includes("user_management")) {
    hasAccess = true;
  } else if (callerPortal.role_id) {
    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("allowed_modules")
      .eq("id", callerPortal.role_id)
      .single();
    if (role?.allowed_modules?.includes("user_management")) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden: user_management access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action, portal_user_id, email, password } = body;

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  // Helper: look up portal user and its auth_uid
  async function getPortalUser(id: string) {
    const { data, error } = await supabaseAdmin
      .from("portal_users")
      .select("id, email, auth_uid")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return data;
  }

  switch (action) {
    case "create": {
      if (!portal_user_id || !email || !password) {
        return NextResponse.json({ error: "Missing portal_user_id, email, or password" }, { status: 400 });
      }

      // Create Supabase Auth user
      const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }

      // Store auth_uid and set must_change_password
      const { error: updateErr } = await supabaseAdmin
        .from("portal_users")
        .update({ auth_uid: authData.user.id, must_change_password: true })
        .eq("id", portal_user_id);

      if (updateErr) {
        return NextResponse.json({ error: `Auth user created but portal update failed: ${updateErr.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, auth_uid: authData.user.id });
    }

    case "reset-password": {
      if (!portal_user_id || !password) {
        return NextResponse.json({ error: "Missing portal_user_id or password" }, { status: 400 });
      }

      const pu = await getPortalUser(portal_user_id);
      if (!pu) {
        return NextResponse.json({ error: "Portal user not found" }, { status: 404 });
      }
      if (!pu.auth_uid) {
        return NextResponse.json({ error: "User has no auth account" }, { status: 404 });
      }

      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(pu.auth_uid, {
        password,
      });

      if (pwErr) {
        return NextResponse.json({ error: pwErr.message }, { status: 400 });
      }

      await supabaseAdmin
        .from("portal_users")
        .update({ must_change_password: true })
        .eq("id", portal_user_id);

      return NextResponse.json({ success: true });
    }

    case "ban": {
      if (!portal_user_id) {
        return NextResponse.json({ error: "Missing portal_user_id" }, { status: 400 });
      }

      const pu = await getPortalUser(portal_user_id);
      if (!pu || !pu.auth_uid) {
        // Graceful 404 — user has no auth account
        return NextResponse.json({ success: true, skipped: true });
      }

      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(pu.auth_uid, {
        ban_duration: "876600h",
      });

      if (banErr) {
        return NextResponse.json({ error: banErr.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    case "unban": {
      if (!portal_user_id) {
        return NextResponse.json({ error: "Missing portal_user_id" }, { status: 400 });
      }

      const pu = await getPortalUser(portal_user_id);
      if (!pu || !pu.auth_uid) {
        return NextResponse.json({ success: true, skipped: true });
      }

      const { error: unbanErr } = await supabaseAdmin.auth.admin.updateUserById(pu.auth_uid, {
        ban_duration: "none",
      });

      if (unbanErr) {
        return NextResponse.json({ error: unbanErr.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
