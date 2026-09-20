import type { Metadata } from "next";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your account", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AccountSetupPage() {
  return <main id="main-content" className="login-page" tabIndex={-1}><section className="login-card" aria-labelledby="setup-title"><p className="eyebrow">Wholesale Delivery</p><h1 id="setup-title">Set up your account</h1><SetupForm /></section></main>;
}
