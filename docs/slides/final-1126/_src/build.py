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
    return f'<div class="{cls}"><img src="assets/avatars/{name}.jpg" alt="{name}" onerror="this.remove()"></div>'

def spk(m):
    names = m.group(1).split(',')
    return ('<div class="spk"><span class="nm">' + '・'.join(names) + '</span><div class="avs">'
            + ''.join(av(n) for n in names) + '</div></div>')

# Demo 頁：左上顯示目前身分與走到第幾個節點（<!--DEMO:n-->，n 從 1 開始）
DEMO = [('中途建貓','中途'),('3D 貓','中途'),('3D 房間','領養人'),('安全檢測','領養人'),('地圖找貓','領養人'),('領養任務','領養人'),('領養移轉','雙方')]
WHO = {'中途':('home','中途視角'),'領養人':('user','領養人視角'),'雙方':('swap','領養人 → 中途')}
def demo(m):
    n = int(m.group(1)); role = DEMO[n-1][1]; ic, label = WHO[role]
    nodes = ''.join(
        f'<span class="dn {"r-mid" if r=="中途" else "r-ado" if r=="領養人" else "r-both"}{" done" if i<n else " now" if i==n else ""}">{name}</span>'
        for i,(name,r) in enumerate(DEMO,1))
    return (f'<div class="dbar"><span class="whob w-{ {"中途":"mid","領養人":"ado","雙方":"both"}[role] }"><svg class="ic"><use href="#i-{ic}"/></svg>{label}</span>'
            f'<span class="dnodes">{nodes}</span></div>')

sections = re.split(r'(?=<!-- =+\n)', body)
out, total = [], body.count('<section ')
page = 0
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
    s = s.replace('<!--PG-->', f'<div class="pg"><img src="assets/meowho-symbol.svg" alt="">{page-1:02d} / {total-1:02d}</div>')
    out.append(s)

html = head + ''.join(out) + tail
html = re.sub(r'<span id="pageNo">[^<]*</span>', f'<span id="pageNo">1 / {total}</span>', html)
out_path.write_text(html, encoding='utf-8')
print('slides', total)
