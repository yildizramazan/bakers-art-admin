import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="not-found" tabIndex={-1}><p className="eyebrow">Page not found</p><h1>This page is unavailable.</h1><p>The record may not exist, may belong to another organization, or may not be permitted for your role.</p><Link href="/office">Return to the office dashboard</Link></main>;
}
