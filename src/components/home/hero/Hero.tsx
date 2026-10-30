import Link from "next/link";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import TypeSearch from "./TypeSearch";
import styles from "./hero.module.css";

const intents = [
  {
    icon: "house",
    title: "我是喵戶長，建立喵戶",
    desc: "飼主或中途都可以：取個喵戶名、設定縣市，就能把每一隻貓放進來",
    href: "/onboarding",
    tone: "orange",
  },
  {
    icon: "camera",
    title: "到喵戶建檔處，新貓入戶",
    desc: "拍張照、說幾句話，AI 幫新來的貓整理成一張名片",
    href: "/onboarding?cat=1",
    tone: "mint",
  },
  {
    icon: "heart",
    title: "我想領養，帶我回家",
    desc: "到帶我回家領養站，用一句話找到合得來的貓",
    href: "#adopt",
    tone: "pink",
  },
] as const;

/** Flat illustrated room the cat roams in: window, plant, rug and its cushion. */
function Room() {
  return (
    <div className={styles.room} aria-hidden>
      <svg className={styles.window} viewBox="0 0 200 240">
        <path d="M10 236V100a90 90 0 0 1 180 0v136Z" fill="#fff" />
        <path d="M24 226V102a76 76 0 0 1 152 0v124Z" fill="#fff6dc" />
        <path d="M24 226V102a76 76 0 0 1 76-76v200Z" fill="#fff1cc" />
        <rect x="96" y="26" width="8" height="200" fill="#fff" />
        <rect x="24" y="128" width="152" height="8" fill="#fff" />
        <rect x="0" y="226" width="200" height="14" rx="7" fill="#f3e2c6" />
      </svg>
      <svg className={styles.plant} viewBox="0 0 120 200">
        <path d="M60 120C40 96 22 70 30 34c20 16 32 44 30 86Z" fill="#9cc79a" />
        <path d="M62 120c6-36 24-62 52-74-2 34-22 60-52 74Z" fill="#b6d8a8" />
        <path d="M58 122C42 110 16 104 4 86c26-4 46 8 54 36Z" fill="#88b98a" />
        <path d="M30 120h60l-8 74a6 6 0 0 1-6 6H44a6 6 0 0 1-6-6Z" fill="#e8913a" />
        <rect x="26" y="114" width="68" height="14" rx="7" fill="#c9701f" />
      </svg>
      <div className={styles.floor} />
      <div className={styles.sun} />
      <div className={styles.cushion}>
        <svg viewBox="0 0 240 90">
          <ellipse cx="120" cy="54" rx="118" ry="34" fill="#eeaa9c" />
          <ellipse cx="120" cy="44" rx="112" ry="30" fill="#f6c3b8" />
          <ellipse cx="120" cy="44" rx="80" ry="18" fill="#f9d3ca" />
        </svg>
        <CatPerch action="roam" label="在中途貓屋" range={260} className={styles.perch} />
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <Room />

        <div className={`wrap ${styles.content}`}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>
              領養前，先跟牠的虛擬分身同居 7 天 <span className="chip">7 天虛擬飼養</span>
            </p>
            <h1 id="hero-title">
              <span>讓貓貓找到你，</span>
              <span>
                <em>先試著同居</em>，
              </span>
              <span>再帶牠回家！</span>
            </h1>
            <p className={styles.lead}>中途之家、愛貓人士和想領養的人，在 Meowho喵戶記錄貓咪的日常，也讓好的相遇發生。</p>

            <TypeSearch />

            <div className={styles.secondary}>
              <CatButton href="/#trial" variant="ghost">
                認識 7 天虛擬飼養
              </CatButton>
              <Link href="/#adopt" className={styles.textLink}>
                逛逛帶我回家領養站 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`wrap ${styles.intent}`} aria-labelledby="intent-title">
        <h2 id="intent-title">喵～你今天想做什麼呢？</h2>
        <div className={styles.intentGrid}>
          {intents.map((item) => (
            <Link key={item.title} href={item.href} className={`${styles.intentCard} ${styles[item.tone]}`}>
              <span className={styles.intentIcon}>
                <Icon name={item.icon} size={26} />
              </span>
              <span className={styles.intentText}>
                <strong>{item.title}</strong>
                <small>{item.desc}</small>
              </span>
              <svg className={styles.intentArrow} viewBox="0 0 16 16" aria-hidden>
                <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
