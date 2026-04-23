import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  className,
  action,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={clsx(
        "bg-white border border-ink-200 rounded-lg shadow-soft p-5",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between mb-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
