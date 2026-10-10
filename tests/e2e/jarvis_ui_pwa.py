from playwright.sync_api import sync_playwright
import subprocess, json
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
U="(select id from users where email='lucifer@example.com')"
sql(f"insert into tasks(user_id,title,due_date) select {U},'UI delete me',current_date where not exists (select 1 from tasks where title='UI delete me')")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:80]))
    pg.goto(B+"/login"); pg.screenshot(path="/tmp/login_logo.png"); pg.fill("input[name=email]","lucifer@example.com"); pg.fill("input[name=password]","lucifer123"); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
    pg.goto(B+"/dashboard"); pg.wait_for_timeout(1500)
    j=pg.locator("#jarvis").bounding_box(); first=pg.locator(".grid-cards").bounding_box(); print("JARVIS above widgets:", j["y"]<first["y"], "| input height px:", round(j["height"]), "| response panel hidden initially:", pg.locator("#jarvis [role=status]").count()==0)
    pg.fill("input[aria-label='Ask JARVIS']","I spent ₹20 on coffee"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
    r=pg.locator("#jarvis [role=status]"); print("response below input:", pg.locator("#jarvis [role=status]").bounding_box()["y"]>j["y"]+j["height"]-1, "|", r.inner_text().replace("\n"," | ")[:150])
    print("expense card links:", r.locator("a.btn").all_inner_texts(), "| compact height:", round(r.bounding_box()["height"]))
    pg.screenshot(path="/tmp/jarvis_desktop.png")
    pg.click("button[aria-label='Dismiss response']"); print("dismiss collapses:", pg.locator("#jarvis [role=status]").count()==0)
    # clarification flow in the UI
    pg.fill("input[aria-label='Ask JARVIS']","add it to my project"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2000); print("clarify:", pg.locator("#jarvis [role=status]").inner_text().replace("\n"," | ")[:80], "| placeholder:", pg.get_attribute("input[aria-label='Ask JARVIS']","placeholder"))
    pg.fill("input[aria-label='Ask JARVIS']","HisaabKitaab"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2500); print("follow-up result:", pg.locator("#jarvis [role=status]").inner_text().replace("\n"," | ")[:110])
    # confirmation flow
    pg.fill("input[aria-label='Ask JARVIS']","delete my task UI delete me"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2500); print("confirm UI:", pg.locator("#jarvis [role=status]").inner_text().replace("\n"," | ")[:100], "| exists:", sql("select count(*) from tasks where title='UI delete me'"))
    pg.click("#jarvis button:has-text('Confirm')"); pg.wait_for_timeout(2000); print("after confirm → exists:", sql("select count(*) from tasks where title='UI delete me'"), "|", pg.locator("#jarvis [role=status]").inner_text().replace("\n"," | ")[:80])
    pg.fill("input[aria-label='Ask JARVIS']","quota check"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2500); print("quota error UI:", pg.locator("#jarvis [role=status]").inner_text().replace("\n"," | ")[:140])
    pg.fill("input[aria-label='Ask JARVIS']","start 30 minute focus"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2000); print("focus started from JARVIS:", pg.evaluate("JSON.parse(localStorage.getItem('focus-timer-v1')||'null')?.total"), "(expect 1800)"); pg.evaluate("localStorage.removeItem('focus-timer-v1')")
    # double submit guard
    pg.reload(); pg.wait_for_timeout(1200); n0=sql(f"select count(*) from expenses where user_id={U} and description='dbl'"); pg.fill("input[aria-label='Ask JARVIS']","add expense 7 dbl"); pg.evaluate("(()=>{const f=document.querySelector('#jarvis form'); f.requestSubmit(); f.requestSubmit();})()"); pg.wait_for_timeout(2500); print("double submit created:", int(sql(f"select count(*) from expenses where user_id={U} and description='dbl'"))-int(n0), "expense(s)")
    sql(f"delete from expenses where user_id={U} and description='dbl'")
    # mobile
    mc=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); mp=mc.new_page()
    mp.goto(B+"/login"); mp.fill("input[name=email]","lucifer@example.com"); mp.fill("input[name=password]","lucifer123"); mp.tap("button.btn-primary"); mp.wait_for_timeout(3500); mp.goto(B+"/dashboard"); mp.wait_for_timeout(1500)
    mp.fill("input[aria-label='Ask JARVIS']","how much have i spent this month"); mp.keyboard.press("Enter"); mp.wait_for_timeout(2500); print("mobile overflowX:", mp.evaluate("document.documentElement.scrollWidth>innerWidth+1"), "| response:", mp.locator("#jarvis [role=status]").inner_text().replace("\n"," | ")[:70]); mp.screenshot(path="/tmp/jarvis_mobile.png")
    # PWA + branding + version
    m=ctx.request.get(B+"/manifest.webmanifest").json(); sw=ctx.request.get(B+"/sw.js").text(); print("manifest:", m["name"], m["short_name"], m["version"], m["display"], m["theme_color"], "| sw version:", "3.1.21" in sw.split("\n")[4], "| icons:", [ctx.request.get(B+u).status for u in ["/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/icons/apple-touch-icon.png","/icons/icon.svg"]])
    pg.goto(B+"/settings"); pg.wait_for_timeout(1200); print("settings About:", pg.locator("section:has-text('About') p").inner_text())
    print("errors:",errs); b.close()
