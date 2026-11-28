import { useState } from "react";

export default function AuthField({
  id,
  label,
  hint,
  problem,
  type = "text",
  required = true,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);
  const input = (
    <input
      {...inputProps}
      id={id}
      type={type === "password" && visible ? "text" : type}
      required={required}
      aria-invalid={Boolean(problem)}
      aria-describedby={
        [hint && `${id}-hint`, problem && `${id}-error`]
          .filter(Boolean)
          .join(" ") || undefined
      }
    />
  );
  return (
    <div className="auth-field">
      <div className="auth-label">
        <label htmlFor={id}>{label}</label>
        {required && (
          <span className="auth-required" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {type === "password" ? (
        <div className="auth-password">
          {input}
          <button
            type="button"
            disabled={inputProps.disabled}
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      ) : (
        input
      )}
      {hint && (
        <p className="auth-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {problem && (
        <p className="auth-field-error" id={`${id}-error`}>
          {problem}
        </p>
      )}
    </div>
  );
}
