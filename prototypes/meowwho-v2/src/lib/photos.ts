/**
 * Real cat photos from Unsplash, all under the Unsplash License (free to use,
 * Unsplash+ excluded). `page` is the photo's Unsplash page, kept for credit.
 */
export type Photo = { src: string; alt: string; page: string };

const u = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const page = (slug: string) => `https://unsplash.com/photos/${slug}`;

export const photos = {
  heroIntro: {
    src: u("1765714714461-174be7eaad85", 1400),
    alt: "坐在木頭露台上的橘貓",
    page: page("an-orange-cat-sitting-on-a-wooden-deck-4Qg_HQ8NCEI"),
  },
  record: {
    src: u("1596854407944-bf87f6fdd49e"),
    alt: "站在黃色背景前的橘色虎斑貓",
    page: page("orange-tabby-cat-on-yellow-surface-p6yH8VmGqxo"),
  },
  match: {
    src: u("1415369629372-26f2fe60c467"),
    alt: "虎斑貓伸出前掌碰觸人的手心",
    page: page("tabby-cat-touching-persons-palm-xulIYVIbYIc"),
  },
  home: {
    src: u("1555590684-90fdbf46b657"),
    alt: "在客廳裡抱著貓的人",
    page: page("woman-carrying-cat-inside-living-room-Fst4SmneRU4"),
  },
  naicha: {
    src: u("1503777119540-ce54b422baff", 700),
    alt: "三花貓",
    page: page("calico-cat-xadzcCQZ_Xc"),
  },
  heitang: {
    src: u("1787404200329-78b2aaee13c1", 700),
    alt: "胸口有白斑的黑貓趴在室內休息",
    page: page("black-cat-with-white-chest-patch-BxyJvHbb4TA"),
  },
  juzi: {
    src: u("1573865526739-10659fec78a5", 700),
    alt: "趴在木桌上的橘白貓",
    page: page("selective-focus-photography-of-orange-and-white-cat-on-brown-table-75715CVEJhI"),
  },
  mochi: {
    src: u("1592194996308-7b43878e84a6", 700),
    alt: "白棕色長毛貓",
    page: page("white-and-brown-long-fur-cat-ZCHj_2lJP00"),
  },
  douhua: {
    src: u("1561948955-570b270e7c36", 700),
    alt: "白色小貓",
    page: page("white-kitten-Tn8DLxwuDMA"),
  },
  zhima: {
    src: u("1574158622682-e40e69881006", 700),
    alt: "銀色虎斑貓",
    page: page("silver-tabby-cat-IuJc2qh2TcA"),
  },
  feedSleep: {
    src: u("1759588032622-1388cf9505ad", 800),
    alt: "在床上熟睡的橘貓",
    page: page("an-orange-cat-sleeps-peacefully-on-a-bed-f6ZQIQ6wAmE"),
  },
  feedWindow: {
    src: u("1764708844823-00d2188dafd8", 800),
    alt: "坐在灑滿陽光的窗邊的長毛貓",
    page: page("a-fluffy-cat-sits-near-a-sunlit-window-UxWy8Un2Mjc"),
  },
  feedBox: {
    src: u("1774876267601-501fa7d17ac7", 800),
    alt: "從紙箱洞口探頭的貓",
    page: page("a-curious-cat-peeks-through-a-hole-in-cardboard-lMjRzppANHY"),
  },
  feedStairs: {
    src: u("1495360010541-f48722b34f7d", 800),
    alt: "坐在白色樓梯上的棕色虎斑貓",
    page: page("brown-tabby-cat-on-white-stairs-mJaD10XeD7w"),
  },
} satisfies Record<string, Photo>;
