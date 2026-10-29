"use client";

import Image from "next/image";
import { useState } from "react";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { photos, type Photo } from "@/lib/photos";
import SectionHead from "../SectionHead";
import shared from "../section.module.css";
import styles from "./feed.module.css";

type Post = { id: string; photo: Photo; text: string; home: string; district: string; when: string; likes: number; comments: number };

const posts: Post[] = [
  {
    id: "p1",
    photo: photos.feedSleep,
    text: "橘子今天第一次自己走進外出籠，獎勵了一根肉泥。",
    home: "小晴的中途貓屋",
    district: "台中市北屯區",
    when: "2 小時前",
    likes: 24,
    comments: 5,
  },
  {
    id: "p2",
    photo: photos.feedWindow,
    text: "下午的陽光剛好照在窗邊，黑糖從一點睡到五點。",
    home: "窗邊的黑糖",
    district: "台中市西屯區",
    when: "昨天",
    likes: 41,
    comments: 8,
  },
  {
    id: "p3",
    photo: photos.feedBox,
    text: "豆花發現新紙箱，探頭探腦了整整十分鐘才敢進去。",
    home: "大里豆花家",
    district: "台中市大里區",
    when: "3 天前",
    likes: 33,
    comments: 3,
  },
  {
    id: "p4",
    photo: photos.feedStairs,
    text: "移轉到新家的第 14 天，阿虎已經會在樓梯口等下班的我。",
    home: "阿虎的新家",
    district: "新北市板橋區",
    when: "5 天前",
    likes: 52,
    comments: 11,
  },
];

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false);
  return (
    <article className={styles.post}>
      <div className={styles.postPhoto}>
        <Image src={post.photo.src} alt={post.photo.alt} fill sizes="(max-width: 767px) 92vw, 300px" />
      </div>
      <div className={styles.postBody}>
        <p className={styles.postText}>{post.text}</p>
        <p className={styles.meta}>
          <Icon name="house" size={14} />
          {post.home}｜{post.district}｜{post.when}
        </p>
        <div className={styles.reactions}>
          <button type="button" aria-pressed={liked} className={liked ? styles.liked : undefined} onClick={() => setLiked((v) => !v)}>
            <Icon name="heart" size={16} />
            {post.likes + (liked ? 1 : 0)}
          </button>
          <button type="button">
            <Icon name="comment" size={16} />
            {post.comments}
          </button>
          <button type="button" aria-label="分享">
            <Icon name="share" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Feed() {
  return (
    <section id="feed" className={`wrap ${shared.section}`} aria-labelledby="feed-title">
      <div className={styles.headRow}>
        <SectionHead
          id="feed-title"
          icon="camera"
          kicker="時光小屋"
          title={
            <>
              <span>貓咪生活</span>
              <span>即時動態牆</span>
            </>
          }
          lead="貓戶與中途之家每天記下的暖心瞬間；移轉到新家後，時間軸也繼續往下寫。"
        />
        <div className={styles.perchSpot}>
          <CatPerch action="groom" label="整理儀容準備拍照" className={styles.perch} />
        </div>
      </div>

      <div className={styles.grid}>
        <aside className={styles.report}>
          <p className={styles.reportTag}>
            <Icon name="diary" size={16} />
            AI 每週週報
          </p>
          <h3>橘子的這一週</h3>
          <p className={styles.reportRange}>10/20 – 10/26・由 6 篇日記與 3 段影片整理</p>
          <ul>
            <li>
              <strong>食慾</strong>穩定，濕食每餐吃完
            </li>
            <li>
              <strong>活動</strong>追逗貓棒 9 回合，最愛傍晚
            </li>
            <li>
              <strong>狀況</strong>週三吐了 1 次毛球，精神正常
            </li>
            <li>
              <strong>新進展</strong>第一次自己走進外出籠
            </li>
          </ul>
          <p className={styles.reportNote}>週報只整理中途寫下的文字與影片描述，健康疑慮請諮詢獸醫。</p>
          <CatButton href="/#adopt" variant="ghost" size="sm" arrow>
            看橘子的時光小屋
          </CatButton>
        </aside>
        {posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}
