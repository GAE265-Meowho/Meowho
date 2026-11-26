"""產生 OBS 疊圖：每位 Demo 講者一張 1920x1080 透明 PNG。
中間方框是透明的（放真實操作畫面），外面是簡報底色、左上 Demo 進度條、右上講者頭像。
用法：python3 -I _src/gen_obs.py（需要 playwright 的 chrome-headless-shell），輸出到上一層的 obs/"""
import re, pathlib, subprocess, glob, os
src = pathlib.Path(__file__).resolve().parent
root = src.parent
code = (src/'build.py').read_text(encoding='utf-8')

# 疊圖順序＝Demo 出場順序：(檔名, 講者, 進度節點)
PEOPLE = [('01_子哲_建立貓咪','子哲',1),('02_Tina_建立貓咪','Tina',1),('03_清俊_尋找貓咪','清俊',2),
          ('04_珮瑜_拍攝居家影片','珮瑜',3),('05_世安_拍攝居家影片','世安',3),('06_渝茜_領養任務','渝茜',4),
          ('07_子哲_移轉','子哲',6)]
SEP = '<!-- =========================================================\n     OBS\n     ========================================================= -->\n'
body = ''.join(f'''{SEP}<section class="slide obs" data-label="OBS {name}">
  <!--SPK:{who}-->
  <div class="head"><span class="tag"><b>04</b>Demo 流程</span><!--DEMO:{n}--></div>
  <div class="obs-hole"></div>
</section>
''' for name, who, n in PEOPLE)
OBS_CSS = '''
/* OBS 疊圖：底色透明，方框外用陰影鋪滿簡報底色 */
html,body,.deck-viewport,.deck-stage,.slide.obs{background:transparent!important}
.deck-controls{display:none!important}
.slide.obs .obs-hole{position:absolute;left:96px;top:140px;width:1728px;height:850px;border-radius:24px;
  box-shadow:0 0 0 3px var(--line),0 0 0 4000px var(--slide-bg,#fff8ec);z-index:0}
.slide.obs .head,.slide.obs .spk{z-index:5}
'''
out_html = root/'_obs_overlay.html'
code = code.replace("body = (src/'body.html').read_text(encoding='utf-8')", "body = BODY")
code = code.replace("out_path = src.parent/'Meowho_成果報告_1126.html'", "out_path = OUT")
code = code.replace("extra = (src/'extra.css').read_text(encoding='utf-8')", "extra = (src/'extra.css').read_text(encoding='utf-8') + OBS_CSS")
exec(compile(code, 'build.py', 'exec'), {'__file__': str(src/'build.py'), 'BODY': body, 'OUT': out_html, 'OBS_CSS': OBS_CSS, '__name__': 'obs'})

chrome = sorted(glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell')))[-1]
outdir = root/'obs'; outdir.mkdir(exist_ok=True)
for i, (name, who, n) in enumerate(PEOPLE, 1):
    png = outdir/f'{name}.png'
    subprocess.run([chrome, '--headless', '--hide-scrollbars', '--force-device-scale-factor=1',
                    '--window-size=1920,1080', '--default-background-color=00000000',
                    '--virtual-time-budget=6000', f'--screenshot={png}', f'{out_html.as_uri()}#{i}'],
                   check=True, capture_output=True)
    print(png.name)
out_html.unlink()
