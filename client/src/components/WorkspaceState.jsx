export default function WorkspaceState({
  title,
  children,
  action,
  loading = false,
  headingLevel = 2,
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="workspace-state" aria-busy={loading}>
      <div className="workspace-state-symbol" aria-hidden="true">
        {loading ? "…" : "—"}
      </div>
      <div role={loading ? "status" : undefined}>
        <Heading>{title}</Heading>
        {children && <p>{children}</p>}
      </div>
      {action}
    </section>
  );
}
