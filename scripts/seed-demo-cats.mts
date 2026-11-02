// 產生示範資料的 SQL：5 個中途喵戶、每個 2 隻待領養貓（含基本領養問卷），給雙帳號測試完整流程用。
//   npx -y tsx@4.19.2 scripts/seed-demo-cats.mts > supabase/seed/demo_cats.sql
// 產生的 SQL 由專案擁有者在 Supabase SQL Editor 執行（AGENTS.md：不碰 auth.users，所以喵戶掛在已登入過的兩個帳號下）。
// 照片沿用首頁的 Unsplash 照片（src/lib/home-photos.ts，Unsplash License），photo_paths 直接存網址。
// id 固定，重跑不會重複建立；檔案最後附清除語法。
const { photos } = await import("../src/lib/home-photos.ts");
const { baseQuestionnaire } = await import("../src/lib/adoption-form/questionnaire.ts");
const { emptyCompat, emptyMedical, healthTagsFromMedical } = await import("../src/lib/cat-profile/adoption.ts");
type Medical = ReturnType<typeof emptyMedical>;
type Compat = ReturnType<typeof emptyCompat>;

const JERRY = "jerryairiti@gmail.com";
const ZING = "zingheartkingandfate@gmail.com";

interface DemoCat {
  name: string; sex: "male" | "female"; stage: "kitten" | "adult" | "senior"; coat: string; breed: string;
  photo: { src: string }; personality: string[]; extraHealth?: string[]; medical: Partial<Medical>; compat: Partial<Compat>;
  habits: string[]; handover: string[]; description: string; timeline: [number, string][]; waitDays: number;
}
interface DemoHome {
  owner: string; name: string; type: "personal_foster" | "shelter_org"; orgName?: string; city: string; district: string; intro: string;
  terms: string[]; cats: [DemoCat, DemoCat];
}

const homes: DemoHome[] = [
  {
    owner: JERRY, name: "小晴的中途貓屋", type: "personal_foster", city: "台中市", district: "北屯區",
    intro: "個人中途，家裡有一間專門給貓的房間，每天都會寫照顧日記。",
    terms: ["年滿 20 歲或家人同意", "不放養", "門窗防護", "簽切結書", "定期追蹤回報"],
    cats: [
      {
        name: "橘子", sex: "male", stage: "adult", coat: "橘白", breed: "米克斯", photo: photos.juzi, personality: ["親人", "黏人", "貪吃"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", microchip: "yes" },
        compat: { cats: "yes", dogs: "unknown", kids: "yes" }, habits: ["會用貓砂"], handover: ["疫苗卡或病歷", "慣用飼料", "外出籠"],
        description: "橘子是在北屯市場後面撿到的，很快就對人放下戒心。最喜歡坐在腳邊等人摸頭，吃飯時間一到會準時來報到。",
        timeline: [[120, "在市場後面接回家"], [100, "打完第三劑預防針"], [60, "結紮完成，恢復得很好"]], waitDays: 118,
      },
      {
        name: "豆花", sex: "female", stage: "kitten", coat: "白色", breed: "米克斯", photo: photos.douhua, personality: ["好奇", "膽小", "愛玩"],
        medical: { neutered: "not_done", neuterNote: "滿 6 個月預約結紮", vaccineDoses: 1, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative" },
        compat: { cats: "yes", dogs: "no", kids: "unknown" }, habits: ["會用貓砂", "愛咬手"], handover: ["疫苗卡或病歷", "慣用飼料", "玩具"],
        description: "豆花剛救援回來時只有巴掌大，現在已經會追逗貓棒。還在學習信任人，要慢慢來。",
        timeline: [[40, "救援回家，體重 600 公克"], [25, "打第一劑預防針"], [5, "第一次自己走進新紙箱"]], waitDays: 38,
      },
    ],
  },
  {
    owner: ZING, name: "三花奶茶的中途日記", type: "personal_foster", city: "台中市", district: "北區",
    intro: "專收熟齡貓的中途，希望每隻老貓都能有自己的沙發。",
    terms: ["年滿 20 歲或家人同意", "不放養", "家訪", "不轉送不棄養"],
    cats: [
      {
        name: "奶茶", sex: "female", stage: "senior", coat: "三花", breed: "米克斯", photo: photos.naicha, personality: ["黏人", "安靜"], extraHealth: ["特殊飲食"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", history: "泌尿道結石，目前穩定" },
        compat: { cats: "no", dogs: "no", kids: "unknown" }, habits: ["會用貓砂"], handover: ["疫苗卡或病歷", "慣用飼料"],
        description: "奶茶要吃泌尿道處方飼料，喝水量要多留意。個性很溫柔，晚上會窩在腿上一起看電視。",
        timeline: [[300, "原飼主搬家無法帶走，轉到中途"], [200, "檢查出泌尿道結石，開始吃處方飼料"], [20, "回診結果穩定"]], waitDays: 302,
      },
      {
        name: "芝麻", sex: "male", stage: "adult", coat: "銀虎斑", breed: "米克斯", photo: photos.zhima, personality: ["怕生", "獨立"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", medication: "每天早晚點眼藥" },
        compat: { cats: "yes", dogs: "unknown", kids: "no" }, habits: ["會用貓砂", "夜間活躍"], handover: ["疫苗卡或病歷", "慣用飼料"],
        description: "芝麻慢熟，前幾天會躲起來觀察。眼睛需要長期點藥，點完給一口肉泥就不生氣了。",
        timeline: [[150, "從豐原接回中途"], [140, "確診慢性結膜炎，開始點眼藥"], [30, "第一次主動來蹭手"]], waitDays: 150,
      },
    ],
  },
  {
    owner: ZING, name: "窗邊的貓咪們", type: "personal_foster", city: "台北市", district: "大安區",
    intro: "公寓裡的小中途，兩隻貓都很愛窗邊那塊陽光。",
    terms: ["不放養", "門窗防護", "簽切結書", "租屋須房東同意"],
    cats: [
      {
        name: "黑糖", sex: "female", stage: "adult", coat: "黑色", breed: "米克斯", photo: photos.heitang, personality: ["安靜", "獨立"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative" },
        compat: { cats: "yes", dogs: "yes", kids: "yes" }, habits: ["會用貓砂", "怕吸塵器"], handover: ["疫苗卡或病歷", "貓砂"],
        description: "黑糖白天幾乎都在窗邊睡，晚上會跑來床邊陪睡。不吵不鬧，很適合第一次養貓的人。",
        timeline: [[210, "在公園被民眾通報，接回中途"], [180, "結紮完成"], [10, "胖了半公斤"]], waitDays: 210,
      },
      {
        name: "麻糬", sex: "female", stage: "adult", coat: "白棕長毛", breed: "米克斯", photo: photos.mochi, personality: ["親人", "黏人", "親其他貓"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative" },
        compat: { cats: "yes", dogs: "unknown", kids: "yes" }, habits: ["會用貓砂"], handover: ["疫苗卡或病歷", "慣用飼料", "玩具"],
        description: "麻糬是撒嬌高手，梳毛的時候呼嚕聲大到隔壁房間都聽得到。長毛需要每天梳。",
        timeline: [[90, "從多貓家庭轉來中途"], [70, "剃毛整理打結的毛"], [3, "毛長回來了"]], waitDays: 88,
      },
    ],
  },
  {
    owner: ZING, name: "高雄浪浪之家協會", type: "shelter_org", orgName: "高雄浪浪之家協會", city: "高雄市", district: "苓雅區",
    intro: "立案協會，與獸醫院合作 TNR 與送養，送養前一定會做健康檢查。",
    terms: ["年滿 20 歲或家人同意", "不放養", "門窗防護", "家訪", "簽切結書", "定期追蹤回報", "不轉送不棄養"],
    cats: [
      {
        name: "阿福", sex: "male", stage: "adult", coat: "橘虎斑", breed: "米克斯", photo: photos.record, personality: ["活潑", "愛玩", "好奇"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", microchip: "yes" },
        compat: { cats: "yes", dogs: "yes", kids: "yes" }, habits: ["會用貓砂", "抓家具", "會開門"], handover: ["疫苗卡或病歷", "慣用飼料", "外出籠"],
        description: "阿福精力旺盛，最愛追逗貓棒和跳高。會自己開門，家裡的門要裝門擋。",
        timeline: [[60, "TNR 時發現很親人，留下來送養"], [55, "完成健康檢查與晶片"], [7, "學會擊掌"]], waitDays: 58,
      },
      {
        name: "小紙箱", sex: "male", stage: "kitten", coat: "棕虎斑", breed: "米克斯", photo: photos.feedBox, personality: ["好奇", "愛玩"],
        medical: { neutered: "not_done", neuterNote: "滿 6 個月由協會安排結紮", vaccineDoses: 2, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative" },
        compat: { cats: "yes", dogs: "unknown", kids: "unknown" }, habits: ["會用貓砂", "愛咬手"], handover: ["疫苗卡或病歷", "慣用飼料"],
        description: "在紙箱裡被發現，所以叫小紙箱。現在還是最愛鑽紙箱，看到就一定要進去。",
        timeline: [[45, "在紙箱裡被發現，帶回協會"], [30, "打第一劑預防針"], [2, "打第二劑預防針"]], waitDays: 44,
      },
    ],
  },
  {
    owner: ZING, name: "新竹巷口中途", type: "personal_foster", city: "新竹市", district: "東區",
    intro: "下班後照顧巷口的浪貓，把需要醫療的帶回家中途。",
    terms: ["不放養", "門窗防護", "未結紮者須配合結紮"],
    cats: [
      {
        name: "雪球", sex: "female", stage: "senior", coat: "白灰長毛", breed: "米克斯", photo: photos.feedWindow, personality: ["安靜", "親人"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", history: "牙齒拔過幾顆，吃軟飼料" },
        compat: { cats: "unknown", dogs: "no", kids: "unknown" }, habits: ["會用貓砂"], handover: ["疫苗卡或病歷", "慣用飼料"],
        description: "雪球年紀大了，喜歡安安靜靜曬太陽。牙齒不好，要吃軟一點的飼料。",
        timeline: [[180, "在巷口被發現時很瘦，接回家照顧"], [160, "拔牙手術"], [15, "體重回到 3.5 公斤"]], waitDays: 175,
      },
      {
        name: "可可", sex: "male", stage: "adult", coat: "棕虎斑", breed: "米克斯", photo: photos.feedStairs, personality: ["獨立", "好奇"],
        medical: { neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative" },
        compat: { cats: "yes", dogs: "unknown", kids: "yes" }, habits: ["會用貓砂", "夜間活躍"], handover: ["疫苗卡或病歷", "慣用飼料"],
        description: "可可喜歡坐在樓梯上看大家走來走去，不太黏人但會跟在旁邊。",
        timeline: [[75, "巷口浪貓，TNR 後發現很穩定"], [70, "接回家中途"], [12, "第一次睡在人旁邊"]], waitDays: 72,
      },
    ],
  },
];

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const arr = (a: string[]) => (a.length ? `array[${a.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const hid = (i: number) => `d3300000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`;
const cid = (i: number, k: number) => `d3300000-0000-4000-8000-0000000001${i + 1}${k + 1}`;
const fid = (i: number, k: number) => `d3300000-0000-4000-8000-0000000002${i + 1}${k + 1}`;
const daysAgo = (n: number) => `now() - interval '${n} days'`;
const dateAgo = (n: number) => `to_char(current_date - ${n}, 'YYYY-MM-DD')`;
const form = baseQuestionnaire();

const out: string[] = [];
out.push(`-- 示範資料（自動產生，勿手改；改 scripts/seed-demo-cats.mts 後重新產生）
-- 5 個中途喵戶、每個 2 隻待領養貓，都開放基本領養問卷。
-- 「小晴的中途貓屋」掛在 ${JERRY}，其他 4 個掛在 ${ZING}。兩個帳號都要先在 Meowho 用 Google 登入過一次。
-- 在 Supabase SQL Editor 執行；id 固定，重跑不會重複建立。清除語法在最下面。

do $$
declare jerry uuid; zing uuid;
begin
  select id into jerry from public.meow_profiles where email = ${q(JERRY)};
  select id into zing from public.meow_profiles where email = ${q(ZING)};
  if jerry is null then raise exception '找不到 ${JERRY}，請先用這個帳號登入 Meowho 一次'; end if;
  if zing is null then raise exception '找不到 ${ZING}，請先用這個帳號登入 Meowho 一次'; end if;
`);
homes.forEach((h, i) => {
  const owner = h.owner === JERRY ? "jerry" : "zing";
  out.push(`
  -- ${h.name}
  insert into public.meow_households (id, owner_id, name, caretaker_type, city, district, intro, default_visibility, allow_stranger_messages, adoption_terms, org_name)
  values ('${hid(i)}', ${owner}, ${q(h.name)}, '${h.type}', ${q(h.city)}, ${q(h.district)}, ${q(h.intro)}, 'public', true, ${j({ items: h.terms, note: "" })}, ${h.orgName ? q(h.orgName) : "null"})
  on conflict (id) do nothing;`);
  h.cats.forEach((c, k) => {
    const medical = { ...emptyMedical(), ...c.medical };
    const compat = { ...emptyCompat(), ...c.compat };
    const health = [...healthTagsFromMedical(medical), ...(c.extraHealth ?? [])];
    const timeline = `jsonb_build_array(${c.timeline.map(([d, e]) => `jsonb_build_object('date', ${dateAgo(d)}, 'event', ${q(e)})`).join(", ")})`;
    out.push(`  insert into public.meow_cats (id, household_id, name, sex, life_stage, coat, breed, personality_tags, health_tags, neutered,
    description, timeline, photo_paths, photo_url, medical, compat, habits, handover, status, visibility, created_at)
  values ('${cid(i, k)}', '${hid(i)}', ${q(c.name)}, '${c.sex}', '${c.stage}', ${q(c.coat)}, ${q(c.breed)}, ${arr(c.personality)}, ${arr(health)}, ${medical.neutered === "done"},
    ${q(c.description)}, ${timeline}, ${arr([c.photo.src])}, ${q(c.photo.src)}, ${j(medical)}, ${j(compat)}, ${arr(c.habits)}, ${arr(c.handover)}, 'adoptable', 'public', ${daysAgo(c.waitDays)})
  on conflict (id) do nothing;
  insert into public.meow_adoption_forms (id, cat_id, questions, is_open) values ('${fid(i, k)}', '${cid(i, k)}', ${j(form)}, true)
  on conflict (cat_id) do nothing;`);
  });
});
out.push(`
  raise notice '示範資料建立完成：5 個喵戶、10 隻貓';
end $$;

-- 清除示範資料（貓、問卷、回覆、收藏會跟著喵戶一起刪除）：
-- delete from public.meow_households where id::text like 'd3300000-0000-4000-8000-0000000000%';
`);
console.log(out.join("\n"));
