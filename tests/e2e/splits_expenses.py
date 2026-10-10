from playwright.sync_api import sync_playwright
import subprocess
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
U="(select id from users where email='lucifer@example.com')"
def login(pg,e="lucifer@example.com",pw="lucifer123"):
    pg.goto(B+"/login"); pg.fill("input[name=email]",e); pg.fill("input[name=password]",pw); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
sql(f"delete from friends where user_id={U}")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":1000}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:80])); login(pg)
    pg.goto(B+"/splits"); pg.wait_for_timeout(900)
    for n in ["Rahul","Aman","Priya"]: pg.fill("input[aria-label='Friend name']",n); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    print("friends:", sql(f"select string_agg(name, ',' order by name) from friends where user_id={U}"))
    pg.fill("input[aria-label='Friend name']","rahul"); pg.keyboard.press("Enter"); pg.wait_for_timeout(900); print("duplicate name (case-insens) ignored:", sql(f"select count(*) from friends where user_id={U} and lower(name)='rahul'"))
    pg.click("button:has-text('Add entry')"); pg.wait_for_timeout(500)
    pg.select_option(".sheet select",label="Rahul"); pg.fill(".sheet input[inputmode=decimal]","450"); pg.fill(".sheet input[placeholder^='Dinner']","Dinner at Pizza Hut"); pg.click(".sheet button.btn-primary"); pg.wait_for_timeout(1200)
    pg.click("button:has-text('Rahul')"); pg.wait_for_timeout(500); print("Rahul row:", pg.locator("button[aria-expanded]").first.inner_text().replace("\n"," | "))
    print("ledger shows reason:", pg.locator("text=Dinner at Pizza Hut").count()==1)
    pg.click("button:has-text('They paid / lent') >> nth=0") if False else None
    # I owe Aman via entry form
    pg.click("button:has-text('Add entry')"); pg.wait_for_timeout(400); pg.select_option(".sheet select",label="Aman"); pg.check(".sheet input[type=radio] >> nth=1"); pg.fill(".sheet input[inputmode=decimal]","200"); pg.fill(".sheet input[placeholder^='Dinner']","Cab to airport"); pg.click(".sheet button.btn-primary"); pg.wait_for_timeout(1200)
    print("balances DB:", sql(f"select string_agg(f.name||'='||coalesce(sum(case e.kind when 'lent' then e.amount when 'i_paid_them' then e.amount else -e.amount end),0), ',' order by f.name) from friends f left join split_entries e on e.friend_id=f.id where f.user_id={U} group by f.name"))
    print("summary cards:", pg.locator(".grid.grid-cols-3 .stat").all_inner_texts())
    # partial payment then settle
    pg.click("button:has-text('Add entry')"); pg.wait_for_timeout(400); pg.select_option(".sheet select",label="Rahul"); pg.check(".sheet input[type=radio] >> nth=2"); pg.fill(".sheet input[inputmode=decimal]","150"); pg.fill(".sheet input[placeholder^='Dinner']","Partial payback"); pg.click(".sheet button.btn-primary"); pg.wait_for_timeout(1200)
    print("after ₹150 payback Rahul owes:", sql(f"select sum(case e.kind when 'lent' then e.amount when 'i_paid_them' then e.amount else -e.amount end) from split_entries e join friends f on f.id=e.friend_id where f.name='Rahul' and f.user_id={U}"))
    pg.once("dialog",lambda d: d.accept()); pg.locator("div.card:has(button[aria-expanded]) >> text=Rahul").first.click() if False else None
    pg.click("button:has-text('Rahul')"); pg.wait_for_timeout(300)
    if pg.locator("button:has-text('Settle up')").count()==0: pg.click("button:has-text('Rahul')")
    pg.once("dialog",lambda d: d.accept()); pg.locator("button:has-text('Settle up')").first.click(); pg.wait_for_timeout(1500); print("settled → Rahul balance:", sql(f"select coalesce(sum(case e.kind when 'lent' then e.amount when 'i_paid_them' then e.amount else -e.amount end),0) from split_entries e join friends f on f.id=e.friend_id where f.name='Rahul' and f.user_id={U}"))
    # equal split
    pg.click("button:has-text('Split equally')"); pg.wait_for_timeout(400); pg.fill(".sheet input[inputmode=decimal]","900"); pg.fill(".sheet input[placeholder='Dinner']","Group dinner"); pg.locator(".sheet label.chip:has-text('Rahul')").click(); pg.locator(".sheet label.chip:has-text('Priya')").click(); print("preview:", pg.locator(".sheet p.small").first.inner_text()); pg.click(".sheet button.btn-primary:has-text('Record split')"); pg.wait_for_timeout(1500)
    print("equal split entries:", sql(f"select string_agg(f.name||':'||e.amount||':'||e.kind, ',' order by f.name) from split_entries e join friends f on f.id=e.friend_id where e.reason='Group dinner' and e.user_id={U}"), "| my share expense:", sql(f"select amount from expenses where user_id={U} and description='Group dinner (my share)'"))
    print("dashboard widget:", ctx.request.get(B+"/api/search?q=Priya").json()["results"].get("splits"))
    # isolation
    pb=b.new_context().new_page(); login(pb,"bob@example.com","bobpassword1"); pb.goto(B+"/splits"); pb.wait_for_timeout(900); print("bob sees friends:", pb.locator("button[aria-expanded]").count(), "| bob search:", pb.request.get(B+"/api/search?q=Rahul").json()["results"].get("splits"))
    # EXPENSE ANALYTICS
    pg.goto(B+"/expenses"); pg.wait_for_timeout(1500); print("KPIs:", [x.replace("\n"," | ") for x in pg.locator(".grid.md\\:grid-cols-4 .card").all_inner_texts()][:4])
    db=sql(f"select sum(amount)||' / '||count(*) from expenses where user_id={U} and spent_on>=date_trunc('month', current_date)::date"); print("DB month total/count:", db)
    pg.click("button.chip:has-text('30 days')"); pg.wait_for_timeout(1500); print("30d heading:", pg.locator("p.small.muted").first.inner_text())
    pg.click("button.chip:has-text('All time')"); pg.wait_for_timeout(1500); print("all time total:", pg.locator(".grid.md\\:grid-cols-4 .card .stat").first.inner_text(), "| DB:", sql(f"select sum(amount) from expenses where user_id={U}"))
    pg.fill("input[type=date] >> nth=0","2026-10-01"); pg.fill("input[type=date] >> nth=1","2026-10-05"); pg.click("button:has-text('Apply range')"); pg.wait_for_timeout(1500); print("custom range url:", pg.url.split("?")[1][:60], "| total:", pg.locator(".grid.md\\:grid-cols-4 .card .stat").first.inner_text(), "| DB:", sql(f"select coalesce(sum(amount),0) from expenses where user_id={U} and spent_on between '2026-10-01' and '2026-10-05'"))
    pg.goto(B+"/expenses?range=all&q=coffee"); pg.wait_for_timeout(1500); print("contains coffee:", pg.locator(".grid.md\\:grid-cols-4 .card").nth(0).inner_text().replace("\n"," | ")[:80], "| DB:", sql(f"select sum(amount)||'/'||count(*) from expenses where user_id={U} and description ilike '%coffee%'"))
    print("charts rendered:", pg.locator("svg[role=img]").count(), "svgs")
    pg.set_viewport_size({"width":390,"height":844}); pg.goto(B+"/expenses"); pg.wait_for_timeout(1200); print("mobile overflowX:", pg.evaluate("document.documentElement.scrollWidth>innerWidth+1")); pg.screenshot(path="/tmp/exp_mobile.png")
    pg.set_viewport_size({"width":1280,"height":1000}); pg.goto(B+"/expenses"); pg.wait_for_timeout(1200); pg.screenshot(path="/tmp/exp_desktop.png", full_page=True)
    sql(f"delete from friends where user_id={U}"); sql(f"delete from expenses where user_id={U} and description='Group dinner (my share)'"); print("errors:",errs); b.close()
