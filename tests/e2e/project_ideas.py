from playwright.sync_api import sync_playwright
import subprocess
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
U="(select id from users where email='lucifer@example.com')"
def login(pg,e="lucifer@example.com",pw="lucifer123"):
    pg.goto(B+"/login"); pg.fill("input[name=email]",e); pg.fill("input[name=password]",pw); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
sql(f"delete from ideas where user_id={U} and title like 'V3 %'"); sql(f"delete from tasks where user_id={U} and title like 'V3 %'")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:80])); login(pg)
    pg.goto(B+"/ideas"); pg.wait_for_timeout(1000)
    pg.fill("input[aria-label='New idea']","V3 unassigned idea"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
    pg.fill("input[aria-label='New idea']","V3 dashboard idea"); pg.select_option("select[aria-label='Project for new idea']",label="Personal Dashboard"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
    print("DB: unassigned has no project:", sql(f"select project_id is null from ideas where title='V3 unassigned idea'"), "| dashboard idea project:", sql(f"select p.name from ideas i join projects p on p.id=i.project_id where i.title='V3 dashboard idea'"))
    pg.select_option("select[aria-label='Filter ideas by project']",label="Personal Dashboard"); pg.wait_for_timeout(500); print("filter project →", [x.split('\n')[0] for x in pg.locator("button.card strong").all_inner_texts()])
    pg.select_option("select[aria-label='Filter ideas by project']",label="No project"); pg.wait_for_timeout(500); n=pg.locator("button.card strong").all_inner_texts(); print("filter No project includes unassigned only:", "V3 unassigned idea" in n and "V3 dashboard idea" not in n)
    pg.select_option("select[aria-label='Filter ideas by project']",value=""); pg.wait_for_timeout(300)
    # project page → Ideas section
    pg.goto(B+"/projects"); pg.wait_for_timeout(1000); pg.click("button.card:has-text('Personal Dashboard')"); pg.wait_for_timeout(700)
    print("project Ideas section lists it:", pg.locator(".sheet button:has-text('V3 dashboard idea')").count()==1)
    pg.fill("input[aria-label='New project idea']","V3 added inside project"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    print("idea added in project → DB project:", sql("select p.name from ideas i join projects p on p.id=i.project_id where i.title='V3 added inside project'"))
    # edit from the project, see in global (one canonical record)
    pg.click(".sheet button:has-text('V3 dashboard idea')"); pg.wait_for_timeout(600); pg.fill(".sheet .sheet input.input >> nth=0","V3 dashboard idea EDITED"); pg.click(".sheet .sheet button.btn-primary:has-text('Save')"); pg.wait_for_timeout(1500)
    print("edited in project → DB:", sql("select count(*) from ideas where title='V3 dashboard idea EDITED'"), "| duplicates:", sql("select count(*) from ideas where title like 'V3 dashboard idea%'"))
    pg.goto(B+"/ideas"); pg.wait_for_timeout(800); print("global shows edited record:", pg.locator("button.card:has-text('V3 dashboard idea EDITED')").count()==1)
    # convert to linked task
    pg.click("button.card:has-text('V3 dashboard idea EDITED')"); pg.wait_for_timeout(600); pg.click("button:has-text('Create linked task')"); pg.wait_for_timeout(500)
    pg.locator(".sheet").last.locator("input.input").first.fill("V3 task from idea"); pg.locator(".sheet").last.locator("button.btn-primary:has-text('Create task')").click(); pg.wait_for_timeout(1800)
    print("linked task:", sql("select t.title||' | project='||coalesce(p.name,'-')||' | due='||coalesce(t.due_date::text,'none')||' | prio='||t.priority from tasks t left join projects p on p.id=t.project_id where t.title='V3 task from idea'"), "| idea kept:", sql("select count(*) from ideas where title='V3 dashboard idea EDITED'"), "| link set:", sql("select count(*) from tasks t join ideas i on i.id=t.source_idea_id where t.title='V3 task from idea'"))
    # second task from same idea
    pg.goto(B+"/ideas"); pg.wait_for_timeout(700); pg.click("button.card:has-text('V3 dashboard idea EDITED')"); pg.wait_for_timeout(600); print("idea shows linked task:", pg.locator(".sheet a:has-text('V3 task from idea')").count()==1)
    pg.click("button:has-text('Create linked task')"); pg.locator(".sheet").last.locator("input.input").first.fill("V3 second task"); pg.locator(".sheet").last.locator("button.btn-primary:has-text('Create task')").click(); pg.wait_for_timeout(1800); print("multiple tasks per idea:", sql("select count(*) from tasks t join ideas i on i.id=t.source_idea_id where i.title='V3 dashboard idea EDITED'"))
    # task page shows source + deletion semantics
    pg.goto(B+"/tasks?open="+sql("select id from tasks where title='V3 task from idea'")); pg.wait_for_timeout(1200); print("task editor shows source idea:", "Created from idea" in pg.inner_text(".sheet")); pg.keyboard.press("Escape")
    pg.goto(B+"/tasks"); pg.wait_for_timeout(600); print("task visible in Tasks page + dashboard:", "V3 task from idea" in pg.inner_text("main"))
    sql(f"delete from tasks where user_id={U} and title='V3 task from idea'"); print("delete task keeps idea:", sql("select count(*) from ideas where title='V3 dashboard idea EDITED'"))
    pg.goto(B+"/ideas"); pg.wait_for_timeout(700); pg.click("button.card:has-text('V3 dashboard idea EDITED')"); pg.wait_for_timeout(500); pg.once("dialog",lambda d: d.accept()); pg.click(".sheet button.btn-danger"); pg.wait_for_timeout(1500)
    print("delete idea keeps linked task:", sql("select count(*)||' task, source_idea_id='||coalesce(max(source_idea_id::text),'NULL') from tasks where title='V3 second task'"))
    print("global search finds idea/tasks:", ctx.request.get(B+"/api/search?q=V3").json()["results"].keys().__len__()>0)
    # isolation
    pb=b.new_context().new_page(); login(pb,"bob@example.com","bobpassword1"); pb.goto(B+"/ideas"); pb.wait_for_timeout(900); print("bob sees lucifer's V3 ideas:", "V3" in pb.inner_text("main"), "| bob search:", pb.request.get(B+"/api/search?q=V3").json()["results"].get("ideas"))
    sql(f"delete from ideas where user_id={U} and title like 'V3 %'"); sql(f"delete from tasks where user_id={U} and title like 'V3 %'")
    print("errors:",errs); b.close()
