export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">正在加载评测数据</span>
      <div className="loading-view" aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-caption" />
        <div className="panel skeleton-panel">
          <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
        </div>
      </div>
    </div>
  );
}
