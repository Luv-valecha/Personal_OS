from playwright.sync_api import sync_playwright
import subprocess
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
U="(select id from users where email='lucifer@example.com')"
sql(f"delete from tasks where user_id={U} and title like 'ZZ%'"); sql(f"update dashboard_settings set task_sort='manual' where user_id={U}")
for i in range(1,5): sql(f"insert into tasks(user_id,title,due_date,manual_position) values({U},'ZZ{i}',current_date,{-1e6+i})")
def titles(pg): return [t.split('\n')[0].strip() for t in pg.locator("main .list-row").all_inner_texts()]
def drag(pg,i,j):
    h=pg.locator("button[aria-label^='Reorder']"); a=h.nth(i).bounding_box(); c=h.nth(j).bounding_box()
    pg.mouse.move(a["x"]+a["width"]/2,a["y"]+a["height"]/2); pg.mouse.down(); pg.mouse.move(a["x"]+8,a["y"]+16,steps=3); pg.mouse.move(c["x"]+8,c["y"]+c["height"]/2+(12 if j>i else -12),steps=12); pg.mouse.up()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_context(viewport={"width":1280,"height":1000}).new_page()
    pg.goto(B+"/login"); pg.fill("input[name=email]","lucifer@example.com"); pg.fill("input[name=password]","lucifer123"); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
    pg.goto(B+"/tasks"); pg.wait_for_timeout(1200); pg.click(".seg button:has-text('Today')"); pg.wait_for_timeout(500); t=titles(pg); print("start:",t[:4])
    sql(f"delete from tasks where user_id={U} and title='ZZ3'")           # another device deleted the neighbour
    drag(pg,0,2); pg.wait_for_timeout(700); print("stale (deleted neighbour) toast:", pg.locator(".toast").all_inner_texts()); pg.wait_for_timeout(1200); print("UI rolled back:", titles(pg)[:4])
    print("DB unchanged for ZZ1:", sql(f"select manual_position from tasks where user_id={U} and title='ZZ1'"))
    pg.reload(); pg.wait_for_timeout(1200); pg.click(".seg button:has-text('Today')"); pg.wait_for_timeout(500)
    sql(f"update tasks set manual_position=-1e6+10 where user_id={U} and title='ZZ2'")  # another device moved ZZ2 below ZZ4 → our neighbours are now crossed
    drag(pg,0,1); pg.wait_for_timeout(1500); print("crossed neighbours toast:", pg.locator(".toast").all_inner_texts()[-1:], "| DB order:", sql(f"select string_agg(title, ',' order by manual_position) from tasks where user_id={U} and title like 'ZZ%'"))
    sql(f"delete from tasks where user_id={U} and title like 'ZZ%'"); b.close()
