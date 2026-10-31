import CatPerch from "@/components/journey/CatPerch";
import Icon from "@/components/ui/Icon";
import styles from "./layout.module.css";

/** The end of 橘子's walk down the page: a little house with a doorstep to nap on. */
function NewHome() {
  return (
    <div className={styles.newHome} aria-hidden>
      <svg viewBox="0 0 260 150">
        <path d="M30 70 130 6l100 64v74a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6Z" fill="#fff" />
        <path d="M14 78 130 2l116 76-10 12L130 22 24 90Z" fill="var(--orange)" />
        <rect x="58" y="78" width="44" height="36" rx="6" fill="var(--yellow-soft)" />
        <path d="M80 78v36M58 96h44" stroke="#fff" strokeWidth="4" />
        <rect x="150" y="80" width="50" height="70" rx="25" fill="var(--yellow)" />
        <circle cx="188" cy="118" r="3.5" fill="var(--orange-deep)" />
      </svg>
      <span className={styles.doorstep} />
      <CatPerch action="sleep" label="到新家了，睡得好安心" className={styles.homePerch} />
    </div>
  );
}

// Photos are Unsplash License (no attribution required); sources are listed in src/lib/photos.ts.
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <NewHome />
      <div className="wrap">
        <p className={styles.footerBrand}>
          <Icon name="cat" size={22} />
          <strong>Meowho喵戶</strong>｜用 AI 支持終養不棄養
        </p>
        <p className={styles.footerMeta}>
          <a href="#">隱私權政策與服務條款</a>
        </p>
      </div>
    </footer>
  );
}
