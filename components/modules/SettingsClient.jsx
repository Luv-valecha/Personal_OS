"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Field, Segmented } from "@/components/ui/Fields";
import ThemeSelector from "@/components/themes/ThemeSelector";
import { useAction } from "@/components/ui/useAction";
import { updateDisplayName, updatePreferences, setMotion } from "@/actions/settings";
import { logoutAction } from "@/actions/auth";

export default function SettingsClient({ user, settings, customThemes }) {
  const { run, pending } = useAction(); const [name, setName] = useState(user.display_name); const [motion, setMo] = useState(settings.motion);
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
        <ThemeSelector current={settings.theme} customThemes={customThemes} activeCustom={settings.active_custom_theme} /></section>
      <section className="card"><div className="card-title">Preferences</div>
        <form className="form-grid two" onSubmit={async (e) => { e.preventDefault(); await run(() => updatePreferences(p), { ok: "Preferences saved" }); }}>
          <Field label="Weather city"><input className="input" value={p.weather_city} onChange={(e) => setP({ ...p, weather_city: e.target.value })} placeholder="e.g. Pune" /></Field>
          <Field label="Monthly budget"><input className="input" inputMode="decimal" value={p.monthly_budget} onChange={(e) => setP({ ...p, monthly_budget: e.target.value })} placeholder="0 = off" /></Field>
          <Field label="Currency symbol"><input className="input" value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })} maxLength={3} /></Field>
          <div className="flex items-end"><button className="btn btn-primary" disabled={pending}>Save preferences</button></div></form></section>
      <section className="card"><div className="card-title">Notifications</div>
        <p className="small muted mb-3">In-app notifications (the bell) are always on. Browser alerts are optional and only fire while the app is open or installed.</p>
        {perm === "unsupported" ? <p className="small">Not supported in this browser.</p> : perm === "granted" ? <p className="small">Browser alerts are enabled.</p> : perm === "denied" ? <p className="small">Blocked — enable notifications for this site in your browser settings.</p> : <button className="btn" onClick={() => Notification.requestPermission().then(setPerm)}>Enable browser alerts</button>}</section>
      <section className="card"><div className="card-title">Account</div><form action={logoutAction}><button className="btn"><LogOut size={15} /> Sign out</button></form></section>
    </div></>);
}
