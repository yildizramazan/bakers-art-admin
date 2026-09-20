"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setupToken } from "@/domain/account-setup";

export interface SetupState { readonly message?: string; readonly userID?: string; readonly email?: string; readonly role?: string; readonly complete?: boolean }

export async function verifySetupLink(fragment: string): Promise<SetupState> {
  const token = typeof fragment === "string" ? setupToken(fragment) : undefined;
  if (!token) return { message: "This setup link is incomplete. Ask the owner for a new link." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp(token);
  if (error || !data.user?.email || !data.user.app_metadata["wholesale_provisioning"]) return { message: "This setup link has expired or was already used. Ask the owner to resume your account setup and share a fresh link." };
  return { userID: data.user.id, email: data.user.email };
}

export async function finishAccountSetup(_previous: SetupState, form: FormData): Promise<SetupState> {
  const password = form.get("password");
  const confirmation = form.get("confirmation");
  const expectedUserID = form.get("user_id");
  if (typeof password !== "string" || password.length < 12 || password !== confirmation) return { message: "Use at least 12 characters and enter the same password twice." };
  if (new TextEncoder().encode(password).length > 72) return { message: "That password is too long for the sign-in service. Try a shorter passphrase." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email || data.user.id !== expectedUserID || !data.user.email_confirmed_at || !data.user.app_metadata["wholesale_provisioning"]) return { message: "Your setup session could not be confirmed. Open a fresh setup link from the owner." };
  const updated = await supabase.auth.updateUser({ password });
  if (updated.error) return { message: "The password could not be saved. Try a stronger password, or retry shortly." };
  const result = await supabase.rpc("complete_own_account_setup");
  if (result.error || result.data?.contract !== "wholesale.account-setup" || result.data?.user_id !== data.user.id || result.data?.status !== "active" || !["owner_admin", "accountant", "driver"].includes(result.data?.role)) return { message: "Your password was saved, but account activation could not be confirmed. Retry, or ask the owner to check your access." };
  return { complete: true, email: data.user.email, role: result.data.role };
}
