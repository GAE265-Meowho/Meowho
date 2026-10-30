/** Section edges: a pair of cat ears sticking up from a band, and a soft wave. */

type EdgeProps = { color: string; className?: string };

/** Sits directly on top of a coloured band; the ears poke up above its top edge. */
export function EarTop({ color, className }: EdgeProps) {
  return (
    <svg className={className} viewBox="0 0 260 64" width="260" height="64" aria-hidden style={{ display: "block", margin: "0 auto -1px" }}>
      <path
        fill={color}
        d="M0 64H260V64H226L205 10Q200 0 192 7L150 46Q130 40 110 46L68 7Q60 0 55 10L34 64Z"
      />
    </svg>
  );
}

/** Full-width wave; `flip` puts the wave on the band's top instead of its bottom. */
export function Wave({ color, flip = false, className }: EdgeProps & { flip?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", width: "100%", height: "clamp(36px, 6vw, 90px)", transform: flip ? "scaleY(-1)" : undefined, marginTop: flip ? 0 : -1 }}
    >
      <path fill={color} d="M0 0H1440V38C1290 86 1150 22 980 44 820 64 700 92 520 64 360 40 220 18 0 58Z" />
    </svg>
  );
}
