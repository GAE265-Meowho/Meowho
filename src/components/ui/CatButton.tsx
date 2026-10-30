import Link from "next/link";
import { useId } from "react";
import styles from "./catButton.module.css";

type Common = {
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  /** Two cat ears on top of the pill. */
  ears?: boolean;
  /** A thick striped tail hooking down off the right end; wags on hover. */
  tail?: boolean;
  arrow?: boolean;
  className?: string;
};

type Props = Common &
  ({ href: string; type?: never; onClick?: never } | { href?: never; type?: "button" | "submit"; onClick?: () => void });

const TAIL =
  "M0 0C60 6 112 30 118 90 122 130 104 170 88 186 74 202 46 216 22 212 4 209-4 196 8 182 22 166 44 150 50 122 56 92 40 66 0 50Z";

function Tail() {
  const id = useId();
  return (
    <svg className={styles.tail} viewBox="-4 -4 130 222" aria-hidden>
      <clipPath id={`${id}-tail`}>
        <path d={TAIL} />
      </clipPath>
      <path className={styles.tailBody} d={TAIL} />
      <g clipPath={`url(#${id}-tail)`} className={styles.stripes}>
        <path d="M50 114 130 128" />
        <path d="M24 156 110 178" />
      </g>
    </svg>
  );
}

function Ears() {
  return (
    <svg className={styles.ears} viewBox="0 0 64 22" aria-hidden>
      <path d="M2 24 9.5 5.2Q11 2.4 13.2 4.6L26 24Z" />
      <path d="M38 24 50.8 4.6Q53 2.4 54.5 5.2L62 24Z" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 16 16" aria-hidden>
      <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Pill button shaped like a cat: ears on top, a striped tail hooking down off
 * the right end. Ears and tail sit beneath the pill so their joins are hidden.
 */
export default function CatButton({ children, variant = "primary", size = "md", ears = true, tail = true, arrow = false, className, ...rest }: Props) {
  const cls = [styles.btn, styles[variant], styles[size], ears && styles.withEars, tail && styles.withTail, className].filter(Boolean).join(" ");
  const inner = (
    <>
      {ears && <Ears />}
      {tail && <Tail />}
      <span className={styles.label}>{children}</span>
      {arrow && <Arrow />}
    </>
  );

  if ("href" in rest && rest.href) {
    return (
      <Link href={rest.href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={rest.type ?? "button"} onClick={rest.onClick} className={cls}>
      {inner}
    </button>
  );
}
