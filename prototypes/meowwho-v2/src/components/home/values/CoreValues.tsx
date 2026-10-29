import Image from "next/image";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import { EarTop, Wave } from "@/components/ui/Edges";
import Icon, { type IconName } from "@/components/ui/Icon";
import { photos, type Photo } from "@/lib/photos";
import CountUp from "./CountUp";
import styles from "./values.module.css";

const pillars: { no: string; tag: string; icon: IconName; title: string; body: string; photo: Photo }[] = [
  {
    no: "01",
    tag: "記錄｜時光小屋",
    icon: "diary",
    title: "每隻貓，都有自己的時光小屋",
    body: "貓戶長拍照、說幾句話就能建檔；日記、相簿和 60 秒影片，AI 每週整理成週報，累積成牠完整的生活檔案。",
    photo: photos.record,
  },
  {
    no: "02",
    tag: "媒合｜帶我回家",
    icon: "match",
    title: "一句話，找到合得來的貓",
    body: "說說你的生活就好。AI 比對中途寫下的真實日記，不只看標籤，還會告訴你為什麼推薦這隻貓。",
    photo: photos.match,
  },
  {
    no: "03",
    tag: "終養｜負責任的相遇",
    icon: "house",
    title: "先準備好，再一起回家",
    body: "AR 環境報告或 7 天虛擬飼養、依年紀估算的首年花費；移轉後，紀錄跟著牠搬進新家，中途也能看見牠過得好不好。",
    photo: photos.home,
  },
];

const stats: { icon: IconName; value: number; unit: string; label: string }[] = [
  { icon: "cat", value: 128, unit: "隻", label: "貓咪正在等家" },
  { icon: "house", value: 36, unit: "隻", label: "本月移轉到新家" },
  { icon: "diary", value: 52, unit: "戶", label: "貓戶天天記錄" },
  { icon: "badge", value: 214, unit: "位", label: "完成 7 天虛擬飼養" },
];

/** Yellow cat head held by two hands, after the hand-drawn mark on ほごねこクリニック. */
function HeldCat() {
  return (
    <svg className={styles.mark} viewBox="0 0 200 130" aria-hidden>
      <path
        transform="translate(64 0) scale(3)"
        fill="var(--yellow)"
        fillRule="evenodd"
        d="M4.2 9.6 4.9 3.4 9.3 6.5Q12 5.9 14.7 6.5L19.1 3.4 19.8 9.6Q21 11.2 21 13.4C21 17.8 17 20.8 12 20.8S3 17.8 3 13.4Q3 11.2 4.2 9.6ZM7.6 13.2a1.25 1.5 0 1 0 2.5 0a1.25 1.5 0 1 0-2.5 0ZM13.9 13.2a1.25 1.5 0 1 0 2.5 0a1.25 1.5 0 1 0-2.5 0Z"
      />
      <g fill="none" stroke="var(--yellow-deep)" strokeWidth="3.5" strokeLinecap="round">
        <path d="M6 108c18 12 40 14 58 4" />
        <path d="M48 78h26M44 89h30M48 100h24" />
        <path d="M194 108c-18 12-40 14-58 4" />
        <path d="M152 78h-26M156 89h-30M152 100h-24" />
      </g>
    </svg>
  );
}

export default function CoreValues() {
  return (
    <section id="values" className={styles.section} aria-labelledby="values-title">
      {/* ---- Intro: the core value statement ---- */}
      <div className={styles.intro}>
        <div className={styles.introText}>
          <HeldCat />
          <h2 id="values-title">
            <span>讓每一隻貓</span>
            <span>從中途到新家立足，</span>
            <span>支撐最重要的一段路。</span>
          </h2>
          <p className={styles.lead}>
            台灣家貓已有 174 萬隻（2025），首度超越家犬；公立收容所裡仍有 29% 的動物沒有被認領養，民間中途的貓還不在統計內。中途的紀錄散在 FB 和
            LINE，領養人只能看照片選貓，準備不足又讓貓被退養。
          </p>
          <p className={styles.lead}>
            MeowWho 貓戶把中途寫下的每一天，接上領養人的準備度：從相遇、先試著同居，到移轉進新家，陪牠走完最重要的那一段路。
          </p>
          <p className={styles.source}>資料來源：農業部 114 年家犬貓飼養調查；農業部動保司 114 年 11 月全國公立動物收容所收容處理情形統計。</p>
          <div className={styles.perchZone}>
            <CatPerch action="sit" label="從中途出發" className={styles.introPerch} />
          </div>
        </div>
        <div className={styles.introPhoto}>
          <Image src={photos.heroIntro.src} alt={photos.heroIntro.alt} fill sizes="(max-width: 767px) 100vw, 55vw" />
        </div>
      </div>

      {/* ---- Three pillars on the yellow band ---- */}
      <EarTop color="var(--yellow)" />
      <div className={styles.band}>
        <div className="wrap">
          <header className={styles.bandHead}>
            <p className={styles.kicker}>記錄 × 媒合 × 終養</p>
            <h3>一條時間軸，串起貓的一生</h3>
          </header>

          <ol className={styles.pillars}>
            {pillars.map((p) => (
              <li key={p.no} className={styles.pillar}>
                <div className={styles.photo}>
                  <Image src={p.photo.src} alt={p.photo.alt} fill sizes="(max-width: 900px) 90vw, 360px" />
                </div>
                <p className={styles.pillarTag}>
                  <span className={styles.no}>{p.no}</span>
                  <span className={styles.tagPill}>
                    <Icon name={p.icon} size={16} />
                    {p.tag}
                  </span>
                </p>
                <h4>{p.title}</h4>
                <p className={styles.pillarBody}>{p.body}</p>
              </li>
            ))}
          </ol>

          <p className={styles.motto}>
            <span>相遇</span>｜Responsible Pet Ownership・用 AI 支持終養不棄養
          </p>
        </div>
      </div>
      <Wave color="var(--yellow)" />

      {/* ---- Stats: a white cat-head card straddling the wave ---- */}
      <div className={`wrap ${styles.statsWrap}`}>
        <EarTop color="var(--card)" className={styles.statsEars} />
        <div className={styles.stats}>
          <CatPerch action="sleep" label="在這裡等一個家" className={styles.statsPerch} />
          <ul>
            {stats.map((s) => (
              <li key={s.label}>
                <span className={styles.statIcon}>
                  <Icon name={s.icon} size={26} />
                </span>
                <strong>
                  <CountUp to={s.value} />
                  <small>{s.unit}</small>
                </strong>
                <span className={styles.statLabel}>{s.label}</span>
              </li>
            ))}
          </ul>
          <div className={styles.statsFoot}>
            <span>原型示意數據</span>
            <CatButton href="/#adopt" arrow>
              看看等家的貓
            </CatButton>
          </div>
        </div>
      </div>
    </section>
  );
}
