// 體型預覽「貓咪資訊」（#302）：體型說明、套用規則、規格；大貓另附原始參考模型的照片與 CC-BY 來源標註。
import { baseInfo, type PreviewBody } from "@/lib/hq/cat-models/bases";

export function BaseInfoPanel({ body }: { body: PreviewBody }) {
  const info = baseInfo(body);
  return (
    <div className="hq-baseinfo">
      <p className="hq-row">
        {info.tags.map(t => <span key={t} className="hq-tag">{t}</span>)}
        <span className={`hq-tag${info.autoApply ? "" : " warn"}`}>{info.autoApply ? "系統依年齡自動套用" : "尚未用於貓咪製作"}</span>
      </p>
      <p>{info.desc}</p>
      <dl className="hq-dl">
        {info.facts.map(f => [<dt key={`${f.label}-t`}>{f.label}</dt>, <dd key={`${f.label}-d`}>{f.value}</dd>])}
      </dl>
      {info.photos.length > 0 && (
        <figure className="hq-baseinfo-photos" aria-label="原始參考模型">
          {info.photos.map(p => (
            <a key={p.src} href={p.src} target="_blank" rel="noreferrer">
              {/* 靜態小圖（約 60 KB），不需要 next/image 最佳化 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.alt} loading="lazy" />
            </a>
          ))}
          <figcaption className="hq-hint">原始參考模型（未綁骨架），點圖看大圖。</figcaption>
        </figure>
      )}
      {info.source && (
        <p className="hq-hint">
          來源：<a href={info.source.url} target="_blank" rel="noreferrer">{info.source.title}</a>
          ，作者 {info.source.author}，授權 {info.source.license}（使用時須標註作者與來源）
        </p>
      )}
    </div>
  );
}
