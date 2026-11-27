"""組合 11/26 成果報告：沿用 1118 簡報的樣式與控制程式（base_1118.html），換上 body.html 的投影片內容。
用法：python3 -I _src/build.py（在哪個資料夾執行都可以），輸出到上一層的 Meowho_成果報告_1126.html"""
import re, pathlib
src = pathlib.Path(__file__).resolve().parent
out_path = src.parent/'Meowho_成果報告_1126.html'
base = (src/'base_1118.html').read_text(encoding='utf-8')
extra = (src/'extra.css').read_text(encoding='utf-8')
body = (src/'body.html').read_text(encoding='utf-8')

head = base[:base.index('</style>')] + extra + '</style>\n</head>\n<body>\n<div class="deck-viewport">\n<main class="deck-stage" id="deckStage">\n'
head = head.replace('<title>Meowho喵戶 執行追蹤</title>', '<title>Meowho喵戶 成果報告</title>')
tail = base[base.index('</main>'):]
tail = tail.replace("meowho-track-1118-v1", "meowho-final-1126-v1").replace("Meowho_執行追蹤_1118.html", "Meowho_成果報告_1126.html")

def av(name, cls='av'):
    # 頭像一律 assets/avatars/<名字>.jpg（世安、清俊 11/26 換新照片）
    filename = f'{name}.jpg'
    return f'<div class="{cls}"><img src="assets/avatars/{filename}" alt="{name}" onerror="this.remove()"></div>'

def spk(m):
    names = m.group(1).split(',')
    return ('<div class="spk"><span class="nm">' + '・'.join(names) + '</span><div class="avs">'
            + ''.join(av(n) for n in names) + '</div></div>')

# Demo 頁：左上顯示目前身分與走到第幾個節點（<!--DEMO:n-->，n 從 1 開始）
# 節點名稱與第 05 頁解決方案流程一致
DEMO = [('建立貓咪','中途'),('尋找貓咪','領養人'),('拍攝居家影片','領養人'),('領養任務','領養人'),('提出領養','領養人'),('移轉','雙方')]
WHO = {'中途':('home','中途視角'),'領養人':('user','領養人視角'),'雙方':('swap','領養人 → 中途')}
def demo(m):
    n = int(m.group(1)); role = DEMO[n-1][1]; ic, label = WHO[role]
    nodes = ''.join(
        f'<span class="dn {"r-mid" if r=="中途" else "r-ado" if r=="領養人" else "r-both"}{" done" if i<n else " now" if i==n else ""}">{name}</span>'
        for i,(name,r) in enumerate(DEMO,1))
    # 身分標籤用前導影片角色頭像：中途＝阿芳、領養人＝小傑（雙方兩張都放）
    face = {'中途':['char_afang'],'領養人':['char_xiaojie'],'雙方':['char_xiaojie','char_afang']}[role]
    faces = ''.join(f'<img class="whoav" src="assets/avatars/{f}.jpg" alt="">' for f in face)
    return (f'<div class="dbar"><span class="whob w-{ {"中途":"mid","領養人":"ado","雙方":"both"}[role] }">{faces}{label}</span>'
            f'<span class="dnodes">{nodes}</span></div>')

sections = re.split(r'(?=<!-- =+\n)', body)
out, total = [], body.count('<section ')
page = 0
# 頁尾頁碼從封面後開始算：開場影片和封面都不算
skip = 2 if 'data-label="開場影片"' in body else 1
for s in sections:
    if '<section' not in s:
        out.append(s); continue
    page += 1
    m = re.search(r'<!--SPK:([^>]+)-->', s)
    duo = m and ',' in m.group(1)
    s = s.replace('<section class="slide', '<section class="slide has-spk' + (' duo' if duo else ''), 1)
    s = re.sub(r'<!--SPK:([^>]+)-->', spk, s)
    s = re.sub(r'<!--DEMO:(\d+)-->', demo, s)
    s = re.sub(r'<!--AV:([^>]+)-->', lambda mm: av(mm.group(1)), s)
    # 標題以下的內容包進 .stage，方便統一往上縮、底部留字幕空間（11/27）
    if '<!--PG-->' in s and '</h2>' in s and not re.search(r'data-label="(開場影片|封面|結尾)"', s):
        i = s.index('</h2>') + len('</h2>')
        j = s.index('<!--PG-->')
        s = s[:i] + '<div class="stage">' + s[i:j] + '</div>' + s[j:]
    s = s.replace('<!--PG-->', f'<div class="pg"><img src="assets/meowho-symbol.svg" alt="">{page-skip:02d} / {total-skip:02d}</div>')
    out.append(s)

html = head + ''.join(out) + tail
html = re.sub(r'<span id="pageNo">[^<]*</span>', f'<span id="pageNo">1 / {total}</span>', html)
out_path.write_text(html, encoding='utf-8')
print('slides', total)
