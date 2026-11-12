/* eslint-disable @next/next/no-img-element */
// 待領養貓的卡片：首頁「帶我回家」和中途喵戶總覽頁（/households/[id]）共用。放在 adopt.module.css 的 .grid 裡。
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import type { FeedCat } from "@/lib/adopt-feed";
import styles from "./adopt.module.css";

export default function CatCard({ cat: c, href, spotlight = false }: { cat: FeedCat; href: string; spotlight?: boolean }) {
  return (
    <li id={`cat-${c.id}`} className={`${styles.card} ${spotlight ? styles.spotlight : ""}`}>
      <div className={styles.photo}>
        {c.photo ? <img src={c.photo} alt={`${c.name}的照片`} loading="lazy" /> : <Icon name="cat" size={64} />}
        <span className={styles.wait}>等家 {c.waitDays} 天</span>
        {c.neutered && (
          <span className={styles.neutered}>
            <Icon name="check" size={13} />
            已結紮
          </span>
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.nameRow}>
          <h3>{c.name}</h3>
          <span>{[c.sex, c.stage].filter(Boolean).join("｜")}</span>
        </div>
        {c.district && (
          <p className={styles.district}>
            <Icon name="pin" size={14} />
            {c.district}
          </p>
        )}
        <ul className={styles.tags}>
          {c.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {c.diary && (
          <p className={styles.diary}>
            <span>
              <Icon name="diary" size={14} />
              中途日記
            </span>
            {c.diary}
          </p>
        )}
        <div className={styles.actions}>
          <CatButton href={href} size="sm">
            認識{c.name}
          </CatButton>
        </div>
      </div>
    </li>
  );
}
