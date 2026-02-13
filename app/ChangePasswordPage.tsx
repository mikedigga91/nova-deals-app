"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  userEmail: string;
  portalUserId: string;
  onPasswordChanged: () => void;
};

export default function ChangePasswordPage({ userEmail, portalUserId, onPasswordChanged }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    // Update password via client-side (uses own session)
    const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
    if (pwErr) {
      setError(pwErr.message);
      setSubmitting(false);
      return;
    }

    // Clear must_change_password flag
    const { error: dbErr } = await supabase
      .from("portal_users")
      .update({ must_change_password: false })
      .eq("id", portalUserId);

    if (dbErr) {
      setError(`Password updated but flag clear failed: ${dbErr.message}`);
      setSubmitting(false);
      return;
    }

    onPasswordChanged();
  };

  return (
    <div className="h-screen w-screen bg-[#070d18] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="flex flex-col items-center mb-10">
          <Image
            src="/logo.png"
            alt="Nova NRG"
            width={64}
            height={64}
            className="rounded-xl mb-4"
            unoptimized
            priority
          />
          <h1 className="text-2xl font-bold tracking-wide text-white/95">
            NOVA NRG PORTAL
          </h1>
          <p className="text-xs text-white/40 font-medium tracking-wider uppercase mt-1">
            Password Change Required
          </p>
        </div>

        <div className="text-center mb-6">
          <p className="text-sm text-white/60">
            Signed in as <span className="text-white/80 font-semibold">{userEmail}</span>
          </p>
          <p className="text-xs text-white/30 mt-1">
            You must set a new password before continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
              placeholder="Minimum 8 characters"
              className="w-full h-11 px-3.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter your new password"
              className="w-full h-11 px-3.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors"
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wide transition-colors"
          >
            {submitting ? "Updating..." : "Set New Password"}
          </button>
        </form>

        <p className="text-center text-[10px] text-white/20 mt-8">
          Contact an administrator if you need help.
        </p>
      </div>
    </div>
  );
}
