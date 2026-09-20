"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { availableOfficeOrganizations } from "@/lib/office/identity";

const canonicalUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function selectOfficeOrganization(formData: FormData): Promise<void> {
  const value = formData.get("organization");
  if (typeof value !== "string" || !canonicalUUID.test(value)) redirect("/access-denied");
  const choices = await availableOfficeOrganizations();
  if (!choices.some((choice) => choice.id === value)) redirect("/access-denied");
  const store = await cookies();
  store.set("office_organization", value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["APP_ENV"] !== "development",
    path: "/office",
    maxAge: 60 * 60 * 12,
  });
  redirect("/office");
}
