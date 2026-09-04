/**
 * Material Symbols, self-hosted via the `material-symbols` package so the app
 * works on a LAN with no internet access. Names are the Google icon names,
 * e.g. <Icon name="dashboard" />.
 */
export default function Icon({ name, size, filled = false, className = '', ...rest }) {
  return (
    <span
      className={`icon material-symbols-outlined ${className}`}
      style={{
        fontSize: size ? `${size}px` : undefined,
        fontVariationSettings: filled ? "'FILL' 1" : undefined,
      }}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  );
}
