"use client";

import Image from "next/image";
import { useState } from "react";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { cats, type CatFilter } from "@/lib/cats";
import SectionHead from "../SectionHead";
import shared from "../section.module.css";
import styles from "./adopt.module.css";

const filters: { key: CatFilter | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "newbie", label: "新手友善" },
  { key: "active", label: "活潑好動" },
  { key: "quiet", label: "安靜陪伴" },
  { key: "special", label: "需要特別照護" },
];

function PawMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.meter}>
      <span>{label}</span>
      <span className={styles.paws} role="img" aria-label={`${label} ${value} / 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Icon key={i} name="paw" size={15} className={i < value ? styles.pawOn : styles.pawOff} />
        ))}
      </span>
    </div>
  );
}

export default function AdoptSection() {
  const [filter, setFilter] = useState<CatFilter | "all">("all");
  const [scope, setScope] = useState<"city" | "all">("city");

  const list = cats.filter((c) => filter === "all" || c.filters.includes(filter)).sort((a, b) => b.waitDays - a.waitDays);

  return (
    <section id="adopt" className={`wrap ${shared.section}`} aria-labelledby="adopt-title">
      <SectionHead
        id="adopt-title"
        icon="heart"
        kicker="帶我回家領養站"
        title={
          <>
            <span>等最久的貓，</span>
            <span>排在最前面</span>
          </>
        }
        lead="每一隻都附上中途寫下的真實日常。用一句話配對，或依個性篩選。"
      />

      <div className={styles.toolbar}>
        <div className={styles.scope} role="radiogroup" aria-label="地區">
          {(
            [
              ["city", "台中市"],
              ["all", "全台"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={scope === v} className={scope === v ? styles.on : undefined} onClick={() => setScope(v)}>
              <Icon name="pin" size={14} />
              {l}
            </button>
          ))}
        </div>
        <div className={styles.filters} role="group" aria-label="個性篩選">
          {filters.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} className={filter === f.key ? styles.on : undefined} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className={styles.count}>共 {list.length} 隻</span>
      </div>

      <div className={styles.gridWrap}>
        <CatPerch action="patrol" label="巡視等家的朋友" range={320} className={styles.perch} />
        <ul className={styles.grid}>
          {list.map((c) => (
            <li key={c.name} className={styles.card}>
              <div className={styles.photo}>
                <Image src={c.photo.src} alt={c.photo.alt} fill sizes="(max-width: 767px) 92vw, 360px" />
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
                  <span>
                    {c.sex}｜{c.age}
                  </span>
                </div>
                <p className={styles.district}>
                  <Icon name="pin" size={14} />
                  {c.district}
                </p>
                <ul className={styles.tags}>
                  {c.tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p className={styles.diary}>
                  <span>
                    <Icon name="diary" size={14} />
                    中途日記
                  </span>
                  {c.diary}
                </p>
                <PawMeter label="親人度" value={c.affinity} />
                <PawMeter label="活力值" value={c.energy} />
                <div className={styles.actions}>
                  <CatButton href="/#trial" variant="ghost" size="sm">
                    7 天虛擬飼養
                  </CatButton>
                  <CatButton href="/#adopt" size="sm">
                    認識{c.name}
                  </CatButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
