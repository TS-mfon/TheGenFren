export function MetricCard(props: { label: string; value: string; meta: string }) {
  return (
    <div className="panel metric-card">
      <div className="metric-label">{props.label}</div>
      <div className="metric-value">{props.value}</div>
      <div className="muted">{props.meta}</div>
    </div>
  );
}
