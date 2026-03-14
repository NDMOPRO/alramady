interface MaterialIconProps {
  icon: string;
  size?: number;
  className?: string;
  filled?: boolean;
  style?: React.CSSProperties;
}

export default function MaterialIcon({ icon, size = 24, className = '', filled = false, style }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontSize: size,
        fontFamily: '"Google Symbols"',
        fontVariationSettings: filled
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        lineHeight: 1,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {icon}
    </span>
  );
}
