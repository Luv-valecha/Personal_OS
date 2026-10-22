// "@project" references in quick commands. Pure (no DB) so it can be unit-tested; callers pass the user's own projects.
// Grammar: `@Name With Spaces` runs to the next ` #tag` / ` !priority` marker or the end of the text; `@"Quoted Name"` is also accepted.
// An "@" only counts at the start of a word (so emails like a@b.com are left alone) and only becomes a project if it MATCHES one.
export function extractAtProject(input) {
  const s = String(input || "");
  const m = s.match(/(^|\s)@(?:"([^"]+)"|([^\s#!@][^#!@]*?))(?=\s+[#!]|\s*$)/);
  if (!m) return { text: s.trim(), ref: null };
  const ref = (m[2] || m[3] || "").trim(); if (!ref) return { text: s.trim(), ref: null };
  return { text: (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(), ref, quoted: !!m[2] };
}

// Resolve raw text after "@" against the user's projects [{id,name}].
//   → { project, rest }            exactly one match; `rest` = words after the matched name (e.g. a trailing "tomorrow")
//   → { ambiguous: [names] }       several equally good matches — the caller must ask, never pick
//   → { notFound: true }           nothing matches — the caller must report an error, never create unassigned/in the wrong project
// Exact (case-insensitive) names beat partial ones; longer matches beat shorter ones.
export function matchProjectRef(raw, projects) {
  const words = String(raw || "").trim().split(/\s+/).filter(Boolean).slice(0, 8); if (!words.length) return { notFound: true };
  const norm = (x) => x.toLowerCase().replace(/\s+/g, " ").trim();
  for (const pass of ["exact", "partial"]) {
    for (let n = words.length; n >= 1; n--) {
      const cand = norm(words.slice(0, n).join(" "));
      const hits = projects.filter((p) => (pass === "exact" ? norm(p.name) === cand : norm(p.name).includes(cand)));
      if (hits.length === 1) return { project: hits[0], rest: words.slice(n).join(" ") };
      if (hits.length > 1) return { ambiguous: hits.map((h) => h.name).slice(0, 6) };
    }
  }
  return { notFound: true };
}
