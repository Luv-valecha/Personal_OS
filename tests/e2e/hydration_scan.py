from playwright.sync_api import sync_playwright
B="http://localhost:3100"
pages=["dashboard","today","tasks","calendar","deadlines","notes","bookmarks","projects","ideas","focus","expenses","splits","music","files","developer","activity","search","settings"]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    pg.goto(B+"/login"); pg.fill("input[name=email]","lucifer@example.com"); pg.fill("input[name=password]","lucifer123"); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
    bad={}
    for path in pages:
        pg2=ctx.new_page(); errs=[]; pg2.on("pageerror",lambda e: errs.append(str(e)[:120])); pg2.goto(B+"/"+path); pg2.wait_for_timeout(2500)
        if errs: bad[path]=errs
        pg2.close()
    print("pages with hydration errors:", list(bad.keys()) or "none"); [print(k, v[0]) for k,v in bad.items()]
    b.close()
