import type { Metadata } from "next";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <main id="main-content" className="configuration-page" tabIndex={-1}>
      <div className="configuration-card">
        <p className="eyebrow">Access denied</p>
        <h1>This account has no office role.</h1>
        <p>Owner/admin and accountant permissions are required. Driver accounts use the iPhone application.</p>
        <form action={signOut}><button type="submit">Sign out</button></form>
      </div>
    </main>
  );
}
