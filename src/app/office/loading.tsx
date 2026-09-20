export default function OfficeLoading() {
  return (
    <div className="office-page" role="status" aria-live="polite">
      <div className="loading-block"><span className="loading-pulse" aria-hidden="true" /><p>Loading organization records…</p></div>
    </div>
  );
}
