import type { Metadata } from "next";
import { safeOfficeDestination } from "@/domain/navigation";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<{ next?: string | readonly string[] }> }>) {
  const rawDestination = (await searchParams).next;
  const destination = Array.isArray(rawDestination) ? "/office" : safeOfficeDestination(rawDestination);
  return (
    <main id="main-content" className="login-page" tabIndex={-1}>
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Wholesale <strong>Office</strong></span></div>
        <p className="eyebrow">Secure organization access</p>
        <h1 id="login-title">Welcome back.</h1>
        <p className="login-copy" id="login-instructions">Sign in with your individual owner/admin or accountant account.</p>
        <LoginForm destination={destination} />
      </section>
    </main>
  );
}
