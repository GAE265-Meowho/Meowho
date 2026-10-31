export type CatAction = "roam" | "sit" | "sleep" | "patrol" | "eat" | "groom" | "think";

type Props = {
  action: CatAction;
  /** Name-tag text shown above 橘子 while it is here. */
  label: string;
  /** How far (px) 橘子 may wander left/right of this spot for roam / patrol. */
  range?: number;
  className?: string;
};

/**
 * An invisible spot where 橘子 stops while the visitor scrolls past this section.
 * The bottom-centre of the element is where the cat's paws touch the ground;
 * position it with CSS (per breakpoint) in the section that owns it.
 */
export default function CatPerch({ action, label, range = 0, className }: Props) {
  return <div aria-hidden className={className} data-cat-perch={action} data-cat-label={label} data-cat-range={range} />;
}
