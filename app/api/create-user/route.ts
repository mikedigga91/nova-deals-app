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

  const { email, password, display_name } = await req.json();

  if (!email || !password || !display_name) {
    return NextResponse.json(
      { error: "Missing required fields: email, password, display_name" },
      { status: 400 }
    );
  }

  // Create the Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Ensure a matching portal_users entry exists
  const { error: portalError } = await supabaseAdmin
    .from("portal_users")
    .upsert(
      {
        id: authData.user.id,
        email,
        display_name,
        is_active: true,
      },
      { onConflict: "id" }
    );

  if (portalError) {
    return NextResponse.json(
      { error: `Auth user created but portal_users insert failed: ${portalError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "User created successfully",
    user_id: authData.user.id,
    email,
  });
}
