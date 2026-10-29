import Link from "next/link";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { mainNav } from "./nav";
import styles from "./layout.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.headerInner}`}>
        <Link href="/" className={styles.logo} aria-label="MeowWho 貓戶 首頁">
          <span className={styles.logoMark}>
            <Icon name="cat" size={26} />
          </span>
          <span>
            <strong>MeowWho</strong>
            <small>貓戶・讓每隻貓都找到好的家</small>
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
          登入／建立貓戶
        </CatButton>
      </div>
    </header>
  );
}
