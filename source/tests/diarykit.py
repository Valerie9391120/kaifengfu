# 闲笔集那一页怎么走（见 src/panels/DiaryPage.jsx、diaryDeck.js），几份端到端测试共用：
#   进来是月历那一页，今天已经选中；点一天是选中，选中的那一天再点一下翻到“这一天”那一页；
#   在“这一天”那一页按 Esc 回月历（手机上是在最顶上往下拉）；月历上按左右键换月（手机上是左右划）。
import re, time

DIARY_PAGE = "(() => { const d = document.querySelector('.kfs-diary'); return d ? d.dataset.page : null; })()"
DIARY_TITLE = "(() => { const t = document.querySelector('.kfs-diary-title'); return t ? t.getAttribute('aria-label') : ''; })()"

def _wait(page, js, timeout=8000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        if page.evaluate(js):
            return True
        time.sleep(0.1)
    return False

# 眼前是哪一页：0 月历，1 这一天
def diary_page(page):
    return page.evaluate(DIARY_PAGE)

# 回到月历那一页
def diary_cal(page):
    if diary_page(page) == "1":
        page.keyboard.press("Escape")
        _wait(page, DIARY_PAGE + " === '0'")
        time.sleep(0.3)

# 月历翻到某一天所在的那个月（day：'YYYY-MM-DD'）
def diary_month(page, day):
    want = (int(day[:4]), int(day[5:7]))
    for _ in range(40):
        m = re.match(r"(\d+)年(\d+)月", page.evaluate(DIARY_TITLE) or "")
        cur = (int(m.group(1)), int(m.group(2))) if m else None
        if cur == want:
            return True
        page.keyboard.press("ArrowLeft" if (cur is None or want < cur) else "ArrowRight")
        time.sleep(0.9)
    return False

# 翻到某一天的“这一天”那一页（不给 day 就是眼下选中的那一天，刚进来是今天）
def diary_day(page, day=None):
    diary_cal(page)
    if day:
        diary_month(page, day)
        cell = page.locator(f".kfs-diary-mon:not([inert]) button[data-day='{day}']")
    else:
        cell = page.locator(".kfs-diary-mon:not([inert]) button[aria-pressed='true']")
    cell.wait_for(timeout=8000)
    if cell.get_attribute("aria-pressed") != "true":
        cell.click(); time.sleep(0.3)      # 头一下：选中
    cell.click()                           # 选中的再点一下：翻过去
    ok = _wait(page, DIARY_PAGE + " === '1'")
    time.sleep(0.4)
    return ok
