import React from 'react';

// Custom lightweight accessible SVG charts for crisp data analytics

export interface BarChartItem {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  tooltip?: string;
}

export const SimpleBarChart: React.FC<{
  items: BarChartItem[];
  height?: number;
  valueFormatter?: (val: number) => string;
  maxValue?: number;
  title?: string;
}> = ({ items, height = 200, valueFormatter = v => v.toFixed(3), maxValue, title }) => {
  const max = maxValue ?? Math.max(...items.map(i => Math.max(i.value, i.secondaryValue || 0)), 1e-4);

  return (
    <div className="w-full">
      {title && <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{title}</h4>}
      <div className="flex items-end gap-3 w-full" style={{ height: `${height}px` }}>
        {items.map((item, idx) => {
          const pct = Math.min(100, (item.value / max) * 100);
          const secPct = item.secondaryValue !== undefined ? Math.min(100, (item.secondaryValue / max) * 100) : undefined;

          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-700 text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-10 whitespace-nowrap text-slate-200">
                {item.tooltip || `${item.label}: ${valueFormatter(item.value)}`}
              </div>

              <div className="w-full flex items-end justify-center gap-1 h-full pb-1">
                <div
                  className={`w-full max-w-[28px] rounded-t transition-all duration-300 ${item.color || 'bg-indigo-500 group-hover:bg-indigo-400'}`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
                {secPct !== undefined && (
                  <div
                    className="w-full max-w-[28px] rounded-t transition-all duration-300 bg-amber-500/80 group-hover:bg-amber-400"
                    style={{ height: `${Math.max(4, secPct)}%` }}
                  />
                )}
              </div>

              <div className="text-[11px] font-medium text-slate-300 truncate max-w-full text-center mt-1">
                {valueFormatter(item.value)}
              </div>
              <div className="text-[10px] text-slate-400 truncate max-w-full text-center" title={item.label}>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const DistributionBar: React.FC<{
  segments: { label: string; count: number; pct: number; color: string }[];
  title?: string;
}> = ({ segments, title }) => {
  return (
    <div className="w-full">
      {title && <div className="text-xs font-medium text-slate-400 mb-2">{title}</div>}
      <div className="h-4 w-full flex rounded-full overflow-hidden bg-slate-800 border border-slate-700/60 p-0.5">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className={`h-full ${seg.color} transition-all duration-300 first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${Math.max(1, seg.pct)}%` }}
            title={`${seg.label}: ${seg.pct}% (${seg.count})`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-2.5">
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
            <span className="font-medium text-slate-200">{seg.label}:</span>
            <span className="text-slate-400">{seg.pct}% ({seg.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
};
