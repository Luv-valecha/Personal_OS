from playwright.sync_api import sync_playwright
import subprocess, json, uuid, concurrent.futures
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
def login(pg,e="lucifer@example.com",pw="lucifer123"):
    pg.goto(B+"/login"); pg.fill("input[name=email]",e); pg.fill("input[name=password]",pw); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(); pg=ctx.new_page(); login(pg)
    def J(msg, history=None, **kw):
        r=ctx.request.post(B+"/api/jarvis", data=json.dumps({"message":msg,"history":history or [],"requestId":str(uuid.uuid4()),**kw}), headers={"content-type":"application/json"}); return r.status, r.json()
    sql("insert into ideas(user_id,title) select id,'Bobs private idea' from users where email='bob@example.com' and not exists (select 1 from ideas where title='Bobs private idea')")
    bobidea=sql("select id from ideas where title='Bobs private idea' limit 1")
    s,j=J(f"link idea {bobidea}"); print("8c cross-user idea link:", j["type"], "-", j["text"], "| tasks linked to bob idea:", sql(f"select count(*) from tasks where source_idea_id='{bobidea}'"))
    pb=b.new_context(); pbp=pb.new_page(); login(pbp,"bob@example.com","bobpassword1")
    def JB(msg): return pb.request.post(B+"/api/jarvis", data=json.dumps({"message":msg,"requestId":str(uuid.uuid4())}), headers={"content-type":"application/json"}).json()
    r=JB("overdue"); print("12 bob overdue (own data only):", r["type"], r["cards"][0]["title"])
    s,j=J("overdue"); print("12b lucifer overdue:", j["type"], j["cards"][0]["title"], "| items:", len(j["cards"][0]["items"]))
    s,j=J("what should i work on today"); print("12c priorities:", j["type"], j["cards"][0]["title"], j["cards"][0]["lines"][:2])
    s,j=J("how much have i spent this month"); print("12d spend:", j["type"], j["cards"][0]["title"])
    s,j=J("Rahul owes me 300 for lunch"); print("12e split:", j["type"], j["cards"][0]["title"], j["cards"][0]["lines"])
    s,j=J("I owe Aman 120 for cab"); print("12f split2:", j["type"], j["cards"][0]["title"])
    s,j=J("who owes me"); print("12g balances:", j["type"], j["cards"][0]["title"])
    s,j=J("start 30 minute focus"); print("12h focus clientAction:", j["clientActions"])
    print("13 unauth:", p.request.new_context().post(B+"/api/jarvis", data="{}").status, "| oversize:", ctx.request.post(B+"/api/jarvis", data=json.dumps({"message":"x"*5000}), headers={"content-type":"application/json"}).status)
    codes=[ctx.request.post(B+"/api/jarvis", data=json.dumps({"message":"overdue","requestId":str(uuid.uuid4())}), headers={"content-type":"application/json"}).status for _ in range(18)]; print("14 rate limit statuses:", sorted(set(codes)))
    b.close()
