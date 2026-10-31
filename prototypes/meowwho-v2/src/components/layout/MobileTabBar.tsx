import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { tabNav } from "./nav";
import styles from "./layout.module.css";

export default function MobileTabBar() {
  return (
    <nav className={styles.tabbar} aria-label="手機選單">
      {tabNav.map((item) => (
        <Link key={item.href} href={item.href} className={item.href === "/onboarding" ? styles.tabMain : undefined}>
          <span className={styles.tabIcon}>
            <Icon name={item.icon} size={22} />
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
