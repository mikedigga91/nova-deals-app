import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-admin-secret");
  if (authHeader !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
