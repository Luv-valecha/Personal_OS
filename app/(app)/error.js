"use client";
export default function Error({ error, reset }) {
  return <div className="card" style={{ maxWidth: 480, margin: "40px auto" }} role="alert"><h2 style={{ fontSize: 18 }}>Something went wrong</h2>
    <p className="sub" style={{ margin: "6px 0 14px" }}>This page couldn&apos;t load — usually a database connection hiccup (free databases pause when idle). Your data is safe.</p>
    <button className="btn btn-primary" onClick={reset}>Try again</button></div>;
}
