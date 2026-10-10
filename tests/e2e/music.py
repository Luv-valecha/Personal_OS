from playwright.sync_api import sync_playwright
import subprocess, json
B="http://localhost:3100"
def sql(q): return subprocess.run(["psql","postgresql://postgres:postgres@localhost/dashboard","-At","-c",q],capture_output=True,text=True).stdout.strip()
U="(select id from users where email='lucifer@example.com')"
def login(pg,e="lucifer@example.com",pw="lucifer123"):
    pg.goto(B+"/login"); pg.fill("input[name=email]",e); pg.fill("input[name=password]",pw); pg.click("button.btn-primary"); pg.wait_for_timeout(3500)
sql(f"delete from music_tracks where user_id={U}"); sql(f"delete from music_playlists where user_id={U}")
AU="()=>{const a=document.querySelector('audio'); return {n:document.querySelectorAll('audio').length, t:a.currentTime, paused:a.paused, vol:a.volume, dur:a.duration, src:!!a.src}}"
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:80])); login(pg)
    posts=[]; pg.on("request",lambda r: posts.append((r.method,r.url,len(r.post_data_buffer or b"")) ) if r.method=="POST" else None)
    pg.goto(B+"/music"); pg.wait_for_timeout(1200)
    pg.set_input_files("input[aria-label='Choose audio files']",["/tmp/music/Alpha Band - Dawn.wav","/tmp/music/Alpha Band - Dusk.wav","/tmp/music/Solo Piece.wav"]); pg.wait_for_timeout(3500)
    print("tracks in DB:", sql(f"select string_agg(title||' / '||artist||' / '||duration_sec||'s', ' ; ' order by title) from music_tracks where user_id={U}"))
    print("max POST body bytes during import:", max([x[2] for x in posts] or [0]), "(wav files are ~", 12*22050*2, "bytes)")
    print("music columns:", sql("select string_agg(column_name||':'||data_type, ',') from information_schema.columns where table_name='music_tracks' and data_type='bytea'") or "no bytea columns")
    # play
    pg.click("button[aria-label='Play Dawn']"); pg.wait_for_timeout(2200); a=pg.evaluate(AU); print("playing:", a)
    pg.click("button[aria-label='Pause'] >> nth=0"); pg.wait_for_timeout(400); a2=pg.evaluate(AU); print("paused:", a2["paused"], "time held:", abs(a2["t"]-pg.evaluate(AU)["t"])<0.05)
    pg.fill("input[aria-label='Seek']","6"); pg.dispatch_event("input[aria-label='Seek']","change") if False else None; pg.wait_for_timeout(500); print("seek →", round(pg.evaluate(AU)["t"],1))
    pg.click("button[aria-label='Play'] >> nth=0"); pg.wait_for_timeout(600)
    # route navigation keeps the SAME audio playing
    t_before=pg.evaluate(AU)["t"]; pg.click("a.nav-link:has-text('Tasks')"); pg.wait_for_timeout(1500); pg.click("a.nav-link:has-text('Dashboard')"); pg.wait_for_timeout(1500); a3=pg.evaluate(AU); print("after navigating (audio elements:",a3["n"],") still playing:", not a3["paused"], "time advanced:", a3["t"]>t_before)
    pg.click("a.nav-link:has-text('Music')"); pg.wait_for_timeout(1000)
    # next / prev
    pg.click("button[aria-label='Next track']"); pg.wait_for_timeout(1500); print("next →", pg.locator(".mini-player .trunc").first.inner_text())
    pg.click("button[aria-label='Previous track']"); pg.wait_for_timeout(1500); print("prev →", pg.locator(".mini-player .trunc").first.inner_text())
    # queue tab: volume, shuffle, repeat
    pg.click(".seg button:has-text('Queue')"); pg.wait_for_timeout(500); pg.fill("input[aria-label='Volume']","0.3"); pg.wait_for_timeout(300); print("volume:", round(pg.evaluate(AU)["vol"],2))
    pg.click("button:has-text('Shuffle')"); pg.click("button[aria-label^='Repeat']"); pg.wait_for_timeout(300); print("shuffle/repeat state:", pg.locator("button:has-text('Shuffle')").get_attribute("aria-pressed"), pg.locator("button[aria-label^='Repeat']").get_attribute("aria-label"))
    pg.click("button:has-text('Shuffle')")
    # end-of-track → auto advance: jump near end of current
    pg.evaluate("(()=>{const a=document.querySelector('audio'); a.currentTime=Math.max(0,a.duration-1);})()"); pg.wait_for_timeout(3500); print("auto-advanced to:", pg.locator(".mini-player .trunc").first.inner_text())
    # favorites, playlist
    pg.click(".seg button:has-text('Library')"); pg.wait_for_timeout(400); pg.click("button[aria-label='Favourite Dawn']"); pg.wait_for_timeout(1000); print("favorite DB:", sql(f"select favorite from music_tracks where user_id={U} and title='Dawn'"))
    pg.click(".seg button:has-text('Playlists')"); pg.wait_for_timeout(400); pg.fill("input[aria-label='New playlist name']","Focus mix"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
    pg.click(".seg button:has-text('Library')"); pg.wait_for_timeout(400)
    for t in ["Dawn","Dusk","Solo Piece"]:
        pg.select_option(f"select[aria-label='Add {t} to playlist']",label="Focus mix"); pg.wait_for_timeout(900)
    pg.click(".seg button:has-text('Playlists')"); pg.wait_for_timeout(400); pg.click("button:has-text('Focus mix')"); pg.wait_for_timeout(600)
    order=lambda: sql(f"select string_agg(t.title, ',' order by pt.position) from music_playlist_tracks pt join music_tracks t on t.id=pt.track_id join music_playlists p on p.id=pt.playlist_id where p.name='Focus mix' and p.user_id={U}")
    print("playlist order:", order()); pg.click("button[aria-label='Move Solo Piece up']"); pg.wait_for_timeout(1200); print("after reorder:", order())
    pg.click("button[aria-label='Remove Dusk from playlist']"); pg.wait_for_timeout(1000); print("after remove:", order())
    pg.click("button:has-text('Play') >> nth=-1") if False else None
    pg.once("dialog",lambda d: d.accept()); pg.click("button:has-text('Rename')") if False else None
    # reload: queue restored, files not on this device
    pg.reload(); pg.wait_for_timeout(2000); print("after reload: mini-player visible:", pg.locator(".mini-player").count()==1, "| 'not on this device' badges:", pg.locator("text=not on this device").count())
    print("track meta persisted in DB:", sql(f"select count(*) from music_tracks where user_id={U}"))
    pg.click(".seg button:has-text('Library')"); pg.click("button[aria-label='Play Solo Piece']"); pg.wait_for_timeout(1200); print("unavailable play → toast:", pg.locator(".toast").all_inner_texts()[-1:])
    # relink via file input
    pg.set_input_files("#relink-many",["/tmp/music/Solo Piece.wav","/tmp/music/Alpha Band - Dawn.wav","/tmp/music/Alpha Band - Dusk.wav"]); pg.wait_for_timeout(1000); print("relink toast:", pg.locator(".toast").all_inner_texts()[-1:], "| badges now:", pg.locator("text=not on this device").count())
    pg.click("button[aria-label='Play Solo Piece']"); pg.wait_for_timeout(2000); print("plays after relink:", pg.evaluate(AU))
    # unsupported file
    open("/tmp/music/bad.mp3","wb").write(b"not audio at all"); pg.set_input_files("input[aria-label='Choose audio files']",["/tmp/music/bad.mp3"]); pg.wait_for_timeout(2500); pg.click("button[aria-label='Play bad']"); pg.wait_for_timeout(1800); print("corrupt file → toast:", pg.locator(".toast").all_inner_texts()[-1:])
    # isolation
    pb=b.new_context().new_page(); login(pb,"bob@example.com","bobpassword1"); pb.goto(B+"/music"); pb.wait_for_timeout(1000); print("bob library rows:", pb.locator("main .list-row").count(), "| bob mini-player:", pb.locator(".mini-player").count())
    # mobile layout
    mc=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); mp=mc.new_page(); login(mp); mp.goto(B+"/music"); mp.wait_for_timeout(1200)
    mp.set_input_files("input[aria-label='Choose audio files']",["/tmp/music/Solo Piece.wav"]); mp.wait_for_timeout(2500); mp.tap("button[aria-label='Play Solo Piece']"); mp.wait_for_timeout(1500)
    mb=mp.locator(".mini-player").bounding_box(); bn=mp.locator(".bottom-nav").bounding_box(); print("mobile: overflowX:", mp.evaluate("document.documentElement.scrollWidth>innerWidth+1"), "| mini above bottom-nav (no overlap):", mb["y"]+mb["height"]<=bn["y"]+1); mp.screenshot(path="/tmp/music_mobile.png")
    print("errors:",errs); b.close()
