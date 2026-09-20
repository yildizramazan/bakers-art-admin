import { redirect } from "next/navigation";
import {
  EnvironmentConfigurationError,
  validateSupabasePublicConfiguration,
} from "@/config/environment";

export const dynamic = "force-dynamic";

export default function HomePage() {
  try {
    validateSupabasePublicConfiguration(process.env);
  } catch (error) {
    if (!(error instanceof EnvironmentConfigurationError)) throw error;
    return (
      <main id="main-content" className="configuration-page" tabIndex={-1}>
        <div className="configuration-card">
          <span className="brand-mark" aria-hidden="true">W</span>
          <p className="eyebrow">Wholesale Office</p>
          <h1>Connection required.</h1>
          <p>
            This deployment has no valid public Supabase endpoint. Add the documented
            public URL and publishable key; privileged service credentials are never
            accepted by the browser application.
          </p>
        </div>
      </main>
    );
  }
  redirect("/office");
}
