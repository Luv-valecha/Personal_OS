from playwright.sync_api import sync_playwright
import subprocess, re
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
def login(pg,e="lucifer@example.com",pw="lucifer123"):
    pg.goto(B+"/login"); pg.fill("input[name=email]",e); pg.fill("input[name=password]",pw); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":800}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:60])); login(pg)
    # V1 regression
    pg.goto(B+"/tasks"); pg.fill("input[aria-label='New task']","Regression task tomorrow !high #qa @HisaabKitaab"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    print("task+project link:", sql("select t.title||' → '||p.name||' ['||t.priority||']' from tasks t join projects p on p.id=t.project_id where t.title='Regression task'"))
    pg.goto(B+"/bookmarks"); pg.fill("input[aria-label='Bookmark URL']","https://example.invalid/x"); pg.keyboard.press("Enter"); pg.wait_for_timeout(5000); print("bookmark:", pg.locator("text=example.invalid").count()>0)
    pg.goto(B+"/expenses"); pg.fill("input[inputmode=decimal] >> nth=0","55"); pg.click("button:has-text('Add expense') >> nth=-1"); pg.wait_for_timeout(1500); print("expense:", pg.locator("text=₹55").count()>0)
    pg.set_input_files if False else None
    pg.goto(B+"/files"); open("/tmp/r.txt","w").write("x"); pg.set_input_files("#file-in","/tmp/r.txt"); pg.wait_for_timeout(2500); print("file upload:", pg.locator("text=r.txt").count()>0)
    pg.goto(B+"/notes"); pg.click("text=New note"); pg.fill("input[aria-label=Title]","Desktop note"); pg.click("textarea[aria-label='Note body']"); pg.keyboard.type("# Heading\n```js\nlet a=1\n```\n- item"); pg.click("button:has-text('Save') >> nth=-1"); pg.wait_for_timeout(1500)
    pg.click("text=Desktop note"); pg.wait_for_timeout(500); print("markdown preview h1/code:", pg.locator(".sheet .md h1").count(), pg.locator(".sheet .md pre code").count()); pg.keyboard.press("Escape")
    pg.click("text=Desktop note"); pg.click(".sheet button:has-text('Pin')"); pg.wait_for_timeout(1000); print("pin:", sql("select pinned from notes where title='Desktop note'"))
    pg.click("text=Desktop note"); pg.click(".sheet button:has-text('Archive')"); pg.wait_for_timeout(1000); print("archive:", sql("select archived from notes where title='Desktop note'"))
    pg.goto(B+"/calendar"); pg.wait_for_timeout(800); print("calendar loads:", pg.locator("h1").inner_text()); pg.goto(B+"/calendar?view=day"); pg.wait_for_timeout(600); print("calendar ?view=day:", pg.locator("button[aria-pressed=true]").first.inner_text())
    pg.goto(B+"/deadlines?filter=today"); pg.wait_for_timeout(600); print("deadlines filter chip:", pg.locator(".chip-active").first.inner_text())
    pg.goto(B+"/tasks?view=overdue"); pg.wait_for_timeout(600); print("tasks ?view=overdue active:", pg.locator(".seg button[aria-pressed=true]").first.inner_text())
    # PROJECT relationships intact
    pg.goto(B+"/projects"); pg.wait_for_timeout(800); pg.click("button.card:has-text('ML Project')"); pg.wait_for_timeout(600)
    print("project modal tasks:", pg.locator(".sheet .list-row").all_inner_texts()[:4]); print("project counts DB:", sql("select p.name||' '||count(t.id)||' tasks' from projects p left join tasks t on t.project_id=p.id where p.name='ML Project' group by p.name"))
    pg.keyboard.press("Escape")
    # estimate field persists
    pg.goto(B+"/tasks"); pg.click("button:has-text('Finish ML report') >> nth=0"); pg.fill(".sheet input[type=number]","45"); pg.click(".sheet button.btn-primary"); pg.wait_for_timeout(1200); print("estimate saved:", sql("select estimate_minutes from tasks where title='Finish ML report' and estimate_minutes is not null limit 1")); 
    pg.goto(B+"/today"); pg.wait_for_timeout(1200); print("priority card:", pg.inner_text("section[aria-label='Priority now']").replace("\n"," | ")[:170])
    # PWA assets
    r=lambda u: ctx.request.get(B+u).status; m=ctx.request.get(B+"/manifest.webmanifest").json()
    print("PWA:", r("/sw.js"), r("/icons/icon-512.png"), r("/offline"), "| display:",m["display"],"| shortcuts:",[s["name"] for s in m["shortcuts"]],"| version in package:", open("/home/claude/personal-dashboard/package.json").read().count('"version": "2.0.0"'))
    # API auth
    print("unauth api:", p.request.new_context().get(B+"/api/palette").status)
    print("errors:",errs); b.close()
