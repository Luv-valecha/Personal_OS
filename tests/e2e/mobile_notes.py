from playwright.sync_api import sync_playwright
B="http://localhost:3100"
UA="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
def lost(pg,text,label):
    act=[]
    for ch in text:
        pg.keyboard.type(ch); pg.wait_for_timeout(80); act.append(pg.evaluate("document.activeElement.getAttribute('aria-label')||document.activeElement.tagName"))
    return sum(1 for a in act if a!=label)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,device_scale_factor=3,user_agent=UA)
    pg=ctx.new_page(); pg.goto(B+"/login"); pg.fill("input[name=email]","lucifer@example.com"); pg.fill("input[name=password]","lucifer123"); pg.tap("button.btn-primary"); pg.wait_for_timeout(3500)
    pg.goto(B+"/notes"); pg.wait_for_timeout(800); pg.tap("text=New note"); pg.wait_for_timeout(600)
    pg.tap("input[aria-label=Title]"); n1=lost(pg,"Mobile title","Title")
    pg.tap("textarea[aria-label='Note body']"); pg.wait_for_timeout(200)
    t1="Hello world, typing continuously on mobile."; n2=lost(pg,t1,"Note body")
    print("NEW note: focus-loss keystrokes (title,body):",n1,n2,"| body:",repr(pg.input_value("textarea[aria-label='Note body']")))
    long=" The quick brown fox jumps over the lazy dog. Sentence two keeps going without the keyboard closing. Sentence three too."; n3=lost(pg,long,"Note body")
    print("LONG note extra loss:",n3,"| length:",len(pg.input_value("textarea[aria-label='Note body']")), "expected", len(t1)+len(long))
    pg.set_viewport_size({"width":844,"height":390}); pg.wait_for_timeout(500); n4=lost(pg," landscape ok","Note body"); pg.set_viewport_size({"width":390,"height":844}); pg.wait_for_timeout(500); n5=lost(pg," portrait ok","Note body")
    print("ROTATION loss:",n4,n5,"| ends with:",repr(pg.input_value("textarea[aria-label='Note body']")[-26:]))
    pg.tap("input[aria-label=Tags]"); lost(pg,"mobile, test","Tags"); pg.tap("button:has-text('Save') >> nth=-1"); pg.wait_for_timeout(1800)
    print("saved & listed:", pg.locator("text=Mobile title").count()>0)
    pg.tap("text=Mobile title"); pg.wait_for_timeout(600)
    if pg.locator("textarea[aria-label='Note body']").count()==0: pg.tap(".sheet button:has-text('Edit')"); pg.wait_for_timeout(300)
    pg.tap("textarea[aria-label='Note body']"); pg.wait_for_timeout(200); pg.keyboard.press("Control+End"); n6=lost(pg," EDITED continuously.","Note body"); print("EDIT existing loss:",n6)
    pg.tap("button:has-text('Save') >> nth=-1"); pg.wait_for_timeout(1500)
    pg.tap("text=Mobile title"); pg.wait_for_timeout(500)
    if pg.locator("textarea[aria-label='Note body']").count()==0: pg.tap(".sheet button:has-text('Edit')"); pg.wait_for_timeout(300)
    v=pg.input_value("textarea[aria-label='Note body']"); print("persisted edit:", v.rstrip().endswith("EDITED continuously."))
    pg.goto(B+"/dashboard"); pg.wait_for_timeout(800); pg.tap("button[aria-label='Quick add']"); pg.wait_for_timeout(500); pg.tap("button:has-text('Note')"); pg.wait_for_timeout(300)
    pg.tap("textarea"); n7=lost(pg,"Quick add body typed fine","TEXTAREA"); print("QUICK-ADD note loss:",n7, repr(pg.input_value("textarea")))
    b.close()
