"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Field, Segmented } from "@/components/ui/Fields";
import ThemeSelector from "@/components/themes/ThemeSelector";
import ThemeSlideshowSettings from "@/components/themes/ThemeSlideshowSettings";
import QuickLinksManager from "@/components/quicklinks/QuickLinksManager";
import { saveLayout } from "@/actions/settings";
import { DEFAULT_LAYOUT } from "@/lib/layout";
import Link from "next/link";
import { useAction } from "@/components/ui/useAction";
import { updateDisplayName, updatePreferences, setMotion, setGlass } from "@/actions/settings";
import { logoutAction } from "@/actions/auth";

export default function SettingsClient({ user, settings, customThemes, quickLinks }) {
  const { run, pending } = useAction(); const [name, setName] = useState(user.display_name); const [motion, setMo] = useState(settings.motion); const [glass, setGl] = useState(settings.glass || "off");
  const [p, setP] = useState({ weather_city: settings.weather_city, monthly_budget: settings.monthly_budget || "", currency: settings.currency });
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  return (<>
    <PageHead title="Settings" />
    <div className="flex flex-col gap-4">
      <section className="card"><div className="card-title">Profile</div>
        <form className="flex gap-2 flex-wrap items-end" onSubmit={async (e) => { e.preventDefault(); await run(() => updateDisplayName(name), { ok: "Name updated" }); }}>
          <Field label="Display name" className="grow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></Field><button className="btn btn-primary" disabled={pending}>Save</button></form>
        <p className="small muted mt-2">Signed in as {user.email}</p></section>
      <section className="card" id="themes"><div className="card-title">Appearance</div>
        <div className="mb-5"><span className="label">Animations</span><Segmented value={motion} onChange={async (v) => { setMo(v); document.documentElement.setAttribute("data-motion", v); await run(() => setMotion(v)); }} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }, { value: "off", label: "Off" }]} label="Animations" />
          <p className="small muted mt-1">Your device&apos;s “reduce motion” setting is always respected.</p></div>
        <div className="mb-5"><span className="label">Glass widgets</span><Segmented value={glass} onChange={async (v) => { const prev = glass; setGl(v); document.documentElement.setAttribute("data-glass", v); if (!(await run(() => setGlass(v)))) { setGl(prev); document.documentElement.setAttribute("data-glass", prev); } }} options={[{ value: "off", label: "Off" }, { value: "soft", label: "Soft" }, { value: "strong", label: "Strong" }]} label="Glass widgets" />
          <p className="small muted mt-1">Frosted, translucent dashboard cards. Looks best on themes with a background glow (e.g. Hell). Turns itself off if your device asks for reduced transparency.</p></div>
        <ThemeSelector current={settings.theme} customThemes={customThemes} activeCustom={settings.active_custom_theme} /></section>
      <ThemeSlideshowSettings customThemes={customThemes} />
      <section className="card" id="dashboard"><div className="card-title">Dashboard</div>
        <p className="small muted mb-3">Show, hide, reorder and resize widgets directly on the dashboard with <strong>Customize</strong>. Priority now, Timeline and Quick links are widgets too.</p>
        <div className="flex gap-2 flex-wrap"><Link className="btn" href="/dashboard">Customize dashboard</Link><button className="btn" disabled={pending} onClick={async () => { if (confirm("Reset the dashboard to the default widgets and order?")) await run(() => saveLayout(DEFAULT_LAYOUT), { ok: "Dashboard reset" }); }}>Reset layout</button></div></section>
      <QuickLinksManager links={quickLinks} />
      <section className="card"><div className="card-title">Preferences</div>
        <form className="form-grid two" onSubmit={async (e) => { e.preventDefault(); await run(() => updatePreferences(p), { ok: "Preferences saved" }); }}>
          <Field label="Weather city"><input className="input" value={p.weather_city} onChange={(e) => setP({ ...p, weather_city: e.target.value })} placeholder="e.g. Pune" /></Field>
          <Field label="Monthly budget"><input className="input" inputMode="decimal" value={p.monthly_budget} onChange={(e) => setP({ ...p, monthly_budget: e.target.value })} placeholder="0 = off" /></Field>
          <Field label="Currency symbol"><input className="input" value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })} maxLength={3} /></Field>
          <div className="flex items-end"><button className="btn btn-primary" disabled={pending}>Save preferences</button></div></form></section>
      <section className="card"><div className="card-title">Notifications</div>
        <p className="small muted mb-3">In-app notifications (the bell) are always on. Browser alerts are optional and only fire while the app is open or installed.</p>
        {perm === "unsupported" ? <p className="small">Not supported in this browser.</p> : perm === "granted" ? <p className="small">Browser alerts are enabled.</p> : perm === "denied" ? <p className="small">Blocked — enable notifications for this site in your browser settings.</p> : <button className="btn" onClick={() => Notification.requestPermission().then(setPerm)}>Enable browser alerts</button>}</section>
      <section className="card"><div className="card-title">JARVIS memory</div><p className="small muted" style={{ margin: "0 0 10px" }}>See, edit or delete the things JARVIS has been asked to remember.</p><Link className="btn" href="/settings/memory">Manage memory</Link></section>
      <section className="card"><div className="card-title">Android companion</div><p className="small muted" style={{ margin: "0 0 10px" }}>Link your phone to use the JARVIS home-screen widget.</p><Link className="btn" href="/settings/android">Manage linked phones</Link></section>
      <section className="card"><div className="card-title">About</div><p className="small muted" style={{ margin: 0 }}>Lucifer&apos;s OS · version {process.env.NEXT_PUBLIC_APP_VERSION}</p></section>
      <section className="card"><div className="card-title">Account</div><form action={logoutAction}><button className="btn"><LogOut size={15} /> Sign out</button></form></section>
    </div></>);
}
