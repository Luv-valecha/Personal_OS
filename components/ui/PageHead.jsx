export default function PageHead({ title, sub, children }) {
  return <div className="page-head"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div><div className="flex gap-2 flex-wrap items-center">{children}</div></div>;
}
