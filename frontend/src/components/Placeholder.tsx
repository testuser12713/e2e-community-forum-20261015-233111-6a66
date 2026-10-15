/**
 * Shared placeholder panel. Every page and shared component of this skeleton
 * renders this until its owning ticket fills it in — it is visibly marked
 * 'In Arbeit' and never looks like a working control (AC-43).
 */
export function Placeholder({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <section className="card empty-state" aria-label={title}>
      <span className="badge badge-progress">In Arbeit</span>
      <h1 className="empty-state__title">{title}</h1>
      <p className="empty-state__hint">
        {hint ?? "Dieser Bereich wird in einem späteren Schritt umgesetzt."}
      </p>
    </section>
  );
}

export default Placeholder;
