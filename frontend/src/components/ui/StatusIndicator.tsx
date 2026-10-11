import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";

type StatusIndicatorProps = {
  visible: boolean;
  pending?: boolean;
  label?: string;
};

export function StatusIndicator({
  visible,
  pending = false,
  label,
}: StatusIndicatorProps) {
  if (pending) {
    return (
      <span className="status status-pending">
        <WarningCircle weight="fill" aria-hidden="true" />
        {label ?? "PENDING"}
      </span>
    );
  }

  return (
    <span className={`status ${visible ? "status-visible" : "status-obstructed"}`}>
      {visible ? (
        <CheckCircle weight="fill" aria-hidden="true" />
      ) : (
        <XCircle weight="fill" aria-hidden="true" />
      )}
      {label ?? (visible ? "VISIBLE" : "OBSTRUCTED")}
    </span>
  );
}
