import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy & Terms · The Baker's Art",
  description: "Privacy Policy, Terms of Service and Support for The Baker's Art Wholesale Delivery application.",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main id="main-content" style={{ minHeight: "100vh", background: "#0a0a0b", color: "#e8e6e3", padding: "40px 24px 80px", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #2a2a30", paddingBottom: "20px", marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "36px", height: "36px", borderRadius: "8px", background: "linear-gradient(135deg, #c8956c, #a07050)", display: "grid", placeItems: "center", fontWeight: "bold", color: "#fff", fontSize: "18px" }}>B</span>
            <span style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>The Baker&apos;s Art <span style={{ color: "#9a9a9e", fontWeight: "normal" }}>· Legal</span></span>
          </div>
          <nav style={{ display: "flex", gap: "16px", fontSize: "14px" }}>
            <a href="#privacy" style={{ color: "#c8956c", textDecoration: "none" }}>Privacy</a>
            <a href="#terms" style={{ color: "#c8956c", textDecoration: "none" }}>Terms</a>
            <a href="#support" style={{ color: "#c8956c", textDecoration: "none" }}>Support</a>
          </nav>
        </header>

        <div style={{ textAlign: "center", marginBottom: "50px" }}>
          <p style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#c8956c", fontWeight: "600", margin: "0 0 10px" }}>The Baker&apos;s Art</p>
          <h1 style={{ fontSize: "36px", fontWeight: "700", color: "#ffffff", letterSpacing: "-1px", margin: "0 0 15px" }}>Privacy, Terms &amp; Support</h1>
          <p style={{ color: "#9a9a9e", fontSize: "15px", margin: 0 }}>Wholesale Delivery Operations &amp; Driver Portal</p>
        </div>

        {/* Privacy Policy */}
        <section id="privacy" style={{ marginBottom: "60px", scrollMarginTop: "40px" }}>
          <h2 style={{ fontSize: "24px", color: "#fff", borderBottom: "1px solid #2a2a30", paddingBottom: "10px", marginBottom: "15px" }}>Privacy Policy</h2>
          <span style={{ display: "inline-block", fontSize: "12px", background: "rgba(200, 149, 108, 0.15)", color: "#c8956c", padding: "4px 10px", borderRadius: "6px", marginBottom: "20px" }}>Effective 22 September 2026</span>

          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            The Baker&apos;s Art (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the <strong>Wholesale Delivery</strong> mobile application and administrative portal. This Privacy Policy explains our collection, use and protection of business records and personal data.
          </p>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>1. Nature of the Application</h3>
          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            The application is an internal, closed-distribution workplace tool designed exclusively for authorized drivers, wholesale managers, and accounting staff of The Baker&apos;s Art. It is not open to general public registration.
          </p>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>2. Information Collected</h3>
          <div style={{ overflowX: "auto", margin: "20px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2a30", color: "#9a9a9e" }}>
                  <th style={{ padding: "10px 8px" }}>Category</th>
                  <th style={{ padding: "10px 8px" }}>Examples</th>
                  <th style={{ padding: "10px 8px" }}>Operational Purpose</th>
                </tr>
              </thead>
              <tbody style={{ color: "#d0d0d5" }}>
                <tr style={{ borderBottom: "1px solid #1c1c20" }}>
                  <td style={{ padding: "10px 8px", fontWeight: "600" }}>Account Credentials</td>
                  <td style={{ padding: "10px 8px" }}>Work email, session tokens</td>
                  <td style={{ padding: "10px 8px" }}>Authentication and role-based access control</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #1c1c20" }}>
                  <td style={{ padding: "10px 8px", fontWeight: "600" }}>Delivery Records</td>
                  <td style={{ padding: "10px 8px" }}>Orders, invoices, quantities, delivery timestamps</td>
                  <td style={{ padding: "10px 8px" }}>Order fulfillment and statutory accounting</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #1c1c20" }}>
                  <td style={{ padding: "10px 8px", fontWeight: "600" }}>Proof of Delivery (POD)</td>
                  <td style={{ padding: "10px 8px" }}>Recipient signatures, delivery photos</td>
                  <td style={{ padding: "10px 8px" }}>Confirmation of commercial wholesale receipt</td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 8px", fontWeight: "600" }}>Device &amp; Diagnostics</td>
                  <td style={{ padding: "10px 8px" }}>Installation identifier, sync sequence</td>
                  <td style={{ padding: "10px 8px" }}>Offline reconciliation and data integrity</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>3. What We Do NOT Collect</h3>
          <ul style={{ paddingLeft: "20px", color: "#d0d0d5", lineHeight: 1.8 }}>
            <li>We do <strong>not</strong> track background GPS locations.</li>
            <li>We do <strong>not</strong> utilize third-party advertising, trackers, or behavioral analytics.</li>
            <li>We do <strong>not</strong> sell or disclose personal data to third parties.</li>
          </ul>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>4. Data Protection &amp; Storage</h3>
          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            Data is stored in isolated PostgreSQL instances managed with enterprise Row-Level Security (RLS) hosted in the European Union on Supabase infrastructure. All network traffic is encrypted via TLS 1.3. Local device secrets are secured by the iOS hardware Keychain.
          </p>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>5. Contact &amp; Rights</h3>
          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            Under UK GDPR, authorized staff have the right to request review or correction of their personal employee profile by contacting the administration office.
          </p>
        </section>

        {/* Terms of Service */}
        <section id="terms" style={{ marginBottom: "60px", scrollMarginTop: "40px" }}>
          <h2 style={{ fontSize: "24px", color: "#fff", borderBottom: "1px solid #2a2a30", paddingBottom: "10px", marginBottom: "15px" }}>Terms of Service</h2>
          <span style={{ display: "inline-block", fontSize: "12px", background: "rgba(200, 149, 108, 0.15)", color: "#c8956c", padding: "4px 10px", borderRadius: "6px", marginBottom: "20px" }}>Effective 22 September 2026</span>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>1. Authorization</h3>
          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            Access to this system is restricted to employees and vetted contractors of The Baker&apos;s Art. Unauthorized access attempts are prohibited.
          </p>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>2. Operational Responsibilities</h3>
          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            Drivers must accurately record deliveries, customer signatures, and discrepancy reports. Credentials must remain confidential and cannot be shared across multiple individuals.
          </p>

          <h3 style={{ fontSize: "17px", color: "#fff", marginTop: "25px", marginBottom: "10px" }}>3. Governing Law</h3>
          <p style={{ lineHeight: 1.7, color: "#d0d0d5" }}>
            These terms are governed in accordance with the laws of England and Wales.
          </p>
        </section>

        {/* Support */}
        <section id="support" style={{ marginBottom: "60px", scrollMarginTop: "40px" }}>
          <h2 style={{ fontSize: "24px", color: "#fff", borderBottom: "1px solid #2a2a30", paddingBottom: "10px", marginBottom: "15px" }}>Support &amp; Inquiries</h2>
          <div style={{ background: "#141416", border: "1px solid #2a2a30", borderRadius: "10px", padding: "24px", marginTop: "20px" }}>
            <p style={{ margin: "0 0 8px", color: "#fff", fontWeight: "600", fontSize: "16px" }}>The Baker&apos;s Art Wholesale Team</p>
            <p style={{ margin: "0 0 6px", color: "#d0d0d5" }}>London, United Kingdom</p>
            <p style={{ margin: "0 0 16px", color: "#d0d0d5" }}>Technical Support: <a href="mailto:support@sterkbyte.com" style={{ color: "#c8956c" }}>support@sterkbyte.com</a></p>
            <p style={{ margin: 0, fontSize: "13px", color: "#9a9a9e" }}>Inquiries regarding driver onboarding, password recovery, or bug reports are handled within 1 business day.</p>
          </div>
        </section>

        <footer style={{ borderTop: "1px solid #2a2a30", paddingTop: "20px", textAlign: "center", color: "#9a9a9e", fontSize: "13px" }}>
          <p>&copy; 2026 The Baker&apos;s Art. All rights reserved.</p>
          <div style={{ marginTop: "10px" }}>
            <Link href="/login" style={{ color: "#c8956c", textDecoration: "none", fontSize: "12px" }}>Sign in to Wholesale Office &rarr;</Link>
          </div>
        </footer>

      </div>
    </main>
  );
}
