import Link from "next/link";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { mainNav } from "./nav";
import styles from "./layout.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.headerInner}`}>
        <Link href="/" className={styles.logo} aria-label="Meowho喵戶 首頁">
          <span className={styles.logoMark}>
            <Icon name="cat" size={26} />
          </span>
          <span>
            <strong>Meowho</strong>
            <small>喵戶・讓每隻貓都找到好的家</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="主選單">
          {mainNav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <CatButton href="/me" size="sm" className={styles.login}>
          <span className={styles.ctaFull}>登入／建立喵戶</span>
          <span className={styles.ctaShort}>登入</span>
        </CatButton>
      </div>
    </header>
  );
}
