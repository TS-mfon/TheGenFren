export function SectionHeader(props: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="section-header">
      <div>
        <div className="eyebrow">{props.eyebrow}</div>
        <h1>{props.title}</h1>
        <div className="muted section-detail">{props.detail}</div>
      </div>
    </div>
  );
}
