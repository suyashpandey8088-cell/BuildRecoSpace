import React from 'react';
import { HelpCircle, AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'outline';
  className?: string;
  size?: 'sm' | 'md';
}> = ({ children, variant = 'primary', className = '', size = 'md' }) => {
  const styles = {
    primary: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700',
    outline: 'bg-transparent text-slate-400 border border-slate-700',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md tracking-wide ${styles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
};

export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'success' | 'warning' | 'danger' | 'neutral';
  icon?: React.ReactNode;
  tooltip?: string;
}> = ({ title, value, subtitle, badge, badgeVariant = 'neutral', icon, tooltip }) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4.5 flex flex-col justify-between hover:border-slate-700/80 transition-all shadow-sm">
      <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1.5">
        <div className="flex items-center gap-1.5">
          <span>{title}</span>
          {tooltip && (
            <span className="text-slate-500 hover:text-slate-300 cursor-help" title={tooltip}>
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
        {icon && <div className="text-slate-500">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2 my-1">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {badge && (
          <Badge variant={badgeVariant} size="sm">
            {badge}
          </Badge>
        )}
      </div>
      {subtitle && <div className="text-xs text-slate-400 truncate">{subtitle}</div>}
    </div>
  );
};

export const AlertBanner: React.FC<{
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string | React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ type = 'info', title, message, action, className = '' }) => {
  const configs = {
    info: {
      bg: 'bg-sky-950/40 border-sky-800/60 text-sky-200',
      icon: <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />,
    },
    success: {
      bg: 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
    },
    warning: {
      bg: 'bg-amber-950/40 border-amber-800/60 text-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
    },
    error: {
      bg: 'bg-rose-950/40 border-rose-800/60 text-rose-200',
      icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
    },
  };

  const current = configs[type];

  return (
    <div className={`border rounded-lg p-3.5 flex items-start gap-3 text-sm ${current.bg} ${className}`}>
      {current.icon}
      <div className="flex-1 min-w-0">
        {title && <h5 className="font-semibold mb-0.5 text-slate-100">{title}</h5>}
        <div className="text-xs leading-relaxed text-slate-300">{message}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-2xl' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className={`bg-slate-900 border border-slate-800 rounded-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col shadow-2xl overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
