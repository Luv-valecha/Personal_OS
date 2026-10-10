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
    s,j=J("add task: write chapter tomorrow !high"); print("1 rules task:", j["type"], j.get("via"), "|", sql("select title||' '||priority||' '||due_date from tasks where title='Write chapter'"))
    s,j=J("add idea: build an AI email organizer"); print("2 rules idea:", j["type"], sql("select count(*) from ideas where title='Build an AI email organizer'"))
    s,j=J("I spent ₹20 on coffee"); print("3 AI expense:", j["type"], "|", j["cards"][0]["title"], "|", sql("select amount||' '||category||' '||description from expenses where description='coffee' order by created_at desc limit 1"))
    s,j=J("ambiguous spend twenty"); print("4a clarify amount:", j["type"], "-", j["text"])
    s,j=J("add it to my project"); print("4b clarify project:", j["type"], "-", j["text"])
    hist=[{"role":"user","text":"add it to my project"},{"role":"assistant","text":j["text"]}]
    s,j2=J("HisaabKitaab", hist); print("4c follow-up completes:", j2["type"], "|", sql("select i.title||' → '||p.name from ideas i join projects p on p.id=i.project_id where i.title like 'Use temporal%' order by i.created_at desc limit 1"))
    s,j3=J("ing", [{"role":"user","text":"add it to my project"},{"role":"assistant","text":"Which project?"}]); print("5 ambiguous project asks:", j3["type"], "-", j3["text"][:90])
    import time; time.sleep(62)
    sql("insert into tasks(user_id,title,due_date) select id,'Pay phone bill',current_date-1 from users where email='lucifer@example.com' and not exists (select 1 from tasks t where t.title='Pay phone bill' and t.user_id=users.id)")
    n0=sql("select count(*) from tasks where title='Pay phone bill'"); s,j4=J("delete my task Pay phone bill"); print("6a confirm required:", j4["type"], "|", j4["text"], "| still exists:", sql("select count(*) from tasks where title='Pay phone bill'")==n0)
    tok=j4["confirm"]["token"]; s,jt=J("", confirmToken=tok[:-3]+"abc"); print("6b tampered token:", jt["type"], jt["text"])
    pb=b.new_context(); pbp=pb.new_page(); login(pbp,"bob@example.com","bobpassword1")
    rb=pb.request.post(B+"/api/jarvis", data=json.dumps({"confirmToken":tok,"requestId":str(uuid.uuid4())}), headers={"content-type":"application/json"}).json(); print("6c other user's token:", rb["type"], rb["text"], "| task still exists:", sql("select count(*) from tasks where title='Pay phone bill'")==n0)
    s,j5=J("", confirmToken=tok); print("6d own confirm executes:", j5["type"], "|", sql("select count(*) from tasks where title='Pay phone bill'"), "left")
    s,j=J("what is my average coffee spend"); print("7 stats:", j["type"], "|", j["cards"][0]["title"], "|", j["cards"][0]["lines"][:2], "| model text:", j["text"])
    s,j=J("badargs please"); print("8a malformed args:", j["type"], "-", j["text"][:80], "| tasks titled 42?:", sql("select count(*) from tasks where title='42'"))
    s,j=J("hack the db"); print("8b unsupported tool:", j["type"], "-", j["text"])
    bobidea=sql("insert into ideas(user_id,title) select id,'Bobs private idea' from users where email='bob@example.com' returning id")
    bobidea=bobidea.split("\n")[0]; s,j=J(f"link idea {bobidea}"); print("8c cross-user idea link:", j["type"], "-", j["text"], "| tasks linked to bob idea:", sql(f"select count(*) from tasks where source_idea_id='{bobidea}'"))
    time.sleep(62)
    for m,label in [("quota please","9a quota"),("badmodel","9b bad model"),("malformed","9c malformed"),("slowpoke","9d timeout")]:
        s,j=J(m); print(label+":", j["type"], j.get("code"), "-", j["text"][:95])
    # fallback: rules still work during AI trouble
    s,j=J("add task: still works offline-ish"); print("10 rules unaffected:", j["type"], j.get("via"))
    # duplicate submit with same requestId
    rid=str(uuid.uuid4()); body=json.dumps({"message":"add expense 33 tea","history":[],"requestId":rid})
    import urllib.request
    ck="; ".join(f"{c['name']}={c['value']}" for c in ctx.cookies())
    def post():
        rq=urllib.request.Request(B+"/api/jarvis", data=body.encode(), headers={"content-type":"application/json","cookie":ck}); return json.loads(urllib.request.urlopen(rq).read())
    with concurrent.futures.ThreadPoolExecutor(2) as ex: r=list(ex.map(lambda _: post(), range(2)))
    print("11 duplicate requestId executed once:", sql("select count(*) from expenses where amount=33 and description='tea'")=="1", [x["type"] for x in r])
    # isolation of reads
    rb=pb.request.post(B+"/api/jarvis", data=json.dumps({"message":"overdue","requestId":str(uuid.uuid4())}), headers={"content-type":"application/json"}).json(); print("12 bob overdue (own data only):", rb["type"], rb["cards"][0]["title"])
    # unauthenticated + oversize
    print("13 unauth:", p.request.new_context().post(B+"/api/jarvis", data="{}").status, "| oversize:", ctx.request.post(B+"/api/jarvis", data=json.dumps({"message":"x"*5000}), headers={"content-type":"application/json"}).status)
    # rate limit
    codes=[ctx.request.post(B+"/api/jarvis", data=json.dumps({"message":"overdue","requestId":str(uuid.uuid4())}), headers={"content-type":"application/json"}).status for _ in range(18)]; print("14 rate limit statuses:", sorted(set(codes)))
    b.close()
