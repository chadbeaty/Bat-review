/** The ink-roughening filter used by Bat Passport stamps (filter:url(#rough)). Rendered once in the root layout. */
export function RoughFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="rough">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.5" />
        <feComposite in="SourceGraphic" operator="in" />
      </filter>
    </svg>
  );
}
