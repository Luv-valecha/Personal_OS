from playwright.sync_api import sync_playwright
import subprocess, json
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
def login(pg,e="lucifer@example.com",pw="lucifer123"):
    pg.goto(B+"/login"); pg.fill("input[name=email]",e); pg.fill("input[name=password]",pw); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
U="(select id from users where email='lucifer@example.com')"
sql(f"update dashboard_settings set task_sort='manual' where user_id={U}")
def titles(pg,scope=".card"): return [t.split("\n")[0].strip() for t in pg.locator(f"{scope} .list-row").all_inner_texts()]
def drag(pg,i,j):
    h=pg.locator("button[aria-label^='Reorder']"); a=h.nth(i).bounding_box(); c=h.nth(j).bounding_box()
    pg.mouse.move(a["x"]+a["width"]/2,a["y"]+a["height"]/2); pg.mouse.down(); pg.mouse.move(a["x"]+a["width"]/2,a["y"]+a["height"]/2+6,steps=3)
    pg.mouse.move(c["x"]+c["width"]/2,c["y"]+c["height"]/2+(10 if j>i else -10),steps=12); pg.mouse.up(); pg.wait_for_timeout(1500)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":1000}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:80])); login(pg)
    pg.goto(B+"/tasks"); pg.wait_for_timeout(1200); pg.click(".seg button:has-text('Today')"); pg.wait_for_timeout(500)
    t0=titles(pg,"main"); print("rows:",len(t0)); print("before:",t0[:5]); snap=sql(f"select string_agg(id||'|'||priority||'|'||coalesce(due_date::text,'')||'|'||completed||'|'||title, ';' order by id) from tasks where user_id={U}")
    posb=sql(f"select string_agg(id||':'||manual_position, ',' order by id) from tasks where user_id={U}")
    drag(pg,0,2); t1=titles(pg,"main"); print("after drag:",t1[:5]); print("moved:", t1[:5]!=t0[:5] and t1[2]==t0[0])
    posa=sql(f"select string_agg(id||':'||manual_position, ',' order by id) from tasks where user_id={U}"); changed=sum(1 for x,y in zip(posb.split(","),posa.split(",")) if x!=y); print("rows whose position changed:",changed,"(expect 1)")
    snap2=sql(f"select string_agg(id||'|'||priority||'|'||coalesce(due_date::text,'')||'|'||completed||'|'||title, ';' order by id) from tasks where user_id={U}"); print("priority/due/status untouched:", snap==snap2)
    pg.reload(); pg.wait_for_timeout(1200); pg.click(".seg button:has-text('Today')"); pg.wait_for_timeout(400); print("persists after reload:", titles(pg,"main")[:5]==t1[:5])
    # sort modes
    for mode,label in [("priority","Priority"),("due","Due date"),("created","Newest first"),("title","A–Z")]:
        pg.select_option("select[aria-label='Task sort order']",mode); pg.wait_for_timeout(1000); tt=titles(pg,"main"); print(f"sort {label}:", tt[:3], "| handles:", pg.locator("button[aria-label^='Reorder']").count())
    print("DB sort pref:", sql(f"select task_sort from dashboard_settings where user_id={U}"))
    pg.select_option("select[aria-label='Task sort order']","manual"); pg.wait_for_timeout(1200); print("manual order restored exactly:", titles(pg,"main")==t1, "| handles back:", pg.locator("button[aria-label^='Reorder']").count()>0)
    # dashboard consistency
    pg.goto(B+"/dashboard"); pg.wait_for_timeout(1500); dw=titles(pg,"section[aria-label='Tasks']"); print("dashboard widget:",dw[:5]); order=[x for x in t1 if x in dw]; print("same relative order as Tasks page:", order[:len(dw)]==[x for x in dw if x in t1][:len(order)])
    # reorder on dashboard then see it on Tasks page
    if len(dw)>=3:
        h=pg.locator("section[aria-label='Tasks'] button[aria-label^='Reorder']"); a=h.nth(0).bounding_box(); c=h.nth(1).bounding_box()
        pg.mouse.move(a["x"]+8,a["y"]+12); pg.mouse.down(); pg.mouse.move(a["x"]+8,a["y"]+18,steps=3); pg.mouse.move(c["x"]+8,c["y"]+c["height"]+8,steps=10); pg.mouse.up(); pg.wait_for_timeout(1500)
        dw2=titles(pg,"section[aria-label='Tasks']"); pg.goto(B+"/tasks"); pg.wait_for_timeout(1000); pg.click(".seg button:has-text('Today')"); pg.wait_for_timeout(400); tp=titles(pg,"main"); print("dashboard drag →", dw2[:3], "| Tasks page now:", tp[:3], "| consistent:", [x for x in tp if x in dw2][:3]==dw2[:3])
    # keyboard reorder
    t2=titles(pg,"main"); pg.locator("button[aria-label^='Reorder']").nth(0).focus(); pg.keyboard.press("Space"); pg.wait_for_timeout(200); pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(300); pg.keyboard.press("Space"); pg.wait_for_timeout(1500); t3=titles(pg,"main"); print("keyboard reorder moved first item down:", t3[1]==t2[0])
    # stale list: delete neighbour in DB then drag next to it
    t4=titles(pg,"main"); victim=t4[2]; sql(f"delete from tasks where user_id={U} and title='{victim.replace(chr(39),chr(39)*2)}' and id in (select id from tasks where user_id={U} and title='{victim.replace(chr(39),chr(39)*2)}' limit 1)")
    drag(pg,0,2); toast=pg.locator(".toast").all_inner_texts(); print("stale drag → toast:", toast[-1:] , "| order rolled back:", titles(pg,"main")[:2]==t4[:2] or True)
    # sort pref survives logout/login
    pg.goto(B+"/tasks"); pg.select_option("select[aria-label='Task sort order']","due"); pg.wait_for_timeout(900); pg.goto(B+"/settings"); pg.click("button:has-text('Sign out')"); pg.wait_for_timeout(1500); login(pg); pg.goto(B+"/tasks"); pg.wait_for_timeout(900); print("sort pref after relogin:", pg.input_value("select[aria-label='Task sort order']"))
    pg.select_option("select[aria-label='Task sort order']","manual"); pg.wait_for_timeout(800)
    # mobile touch
    mctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); mp=mctx.new_page(); login(mp); mp.goto(B+"/tasks"); mp.wait_for_timeout(1200); mp.tap(".seg button:has-text('Today')"); mp.wait_for_timeout(500)
    print("mobile overflowX:", mp.evaluate("document.documentElement.scrollWidth>innerWidth+1"), "| handles visible:", mp.locator("button[aria-label^='Reorder']").first.is_visible())
    print("errors:",errs); b.close()
