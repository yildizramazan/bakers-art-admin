"use server";

import { redirect } from "next/navigation";
import { safeOfficeDestination } from "@/domain/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginActionState {
  readonly message?: string;
}

export async function signIn(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") {
    return { message: "Enter your email address and password." };
  }
  const normalizedEmail = email.trim().toLowerCase();
  const destination = safeOfficeDestination(formData.get("next"));
  if (normalizedEmail.length > 254 || !normalizedEmail.includes("@") || password.length < 8) {
    return { message: "The sign-in details are not valid." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) return { message: "Sign-in was unsuccessful. Check your details and try again." };
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
