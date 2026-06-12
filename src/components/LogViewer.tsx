import { useEffect, useMemo, useRef, useState } from "react";
import { getZapretLog, getSingboxLog } from "../lib/tauri";
import { useI18n } from "../i18n";

type LogTab = "singbox" | "zapret";
type Level = "all" | "info" | "warn" | "error";

const LOG_TABS: { id: LogTab; labelKey: string }[] = [
  { id: "singbox", labelKey: "logs.tab.singbox" },
  { id: "zapret", labelKey: "logs.tab.zapret" },
];

async function fetchLog(tab: LogTab): Promise<string> {
  switch (tab) {
    case "singbox":
      return getSingboxLog();
    case "zapret":
      return getZapretLog();
  }
}

function lineLevel(line: string): Exclude<Level, "all"> {
  const l = line.toLowerCase();
  if (l.includes("error") || l.includes("fatal")) return "error";
  if (l.includes("warn")) return "warn";
  return "info";
}

const LEVEL_COLOR: Record<Exclude<Level, "all">, string> = {
  error: "var(--danger, #e05252)",
  warn: "#f5a623",
  info: "var(--text-dim)",
};

export default function LogViewer() {
  const { t } = useI18n();
  const [tab, setTab] = useState<LogTab>("singbox");
  const [content, setContent] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [level, setLevel] = useState<Level>("all");
  const [query, setQuery] = useState("");
  // Lines before this index (in the full log) are hidden by "Clear view".
  const [hiddenBefore, setHiddenBefore] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const text = await fetchLog(tab);
      // Only update state when the text actually changed — avoids re-render flicker.
      if ((text || "") !== contentRef.current) setContent(text || "");
    } catch (e) {
      const msg = t("logs.unavailable", { err: String(e) });
      if (msg !== contentRef.current) setContent(msg);
    }
  };

  useEffect(() => {
    setContent("");
    setHiddenBefore(0);
    refresh();
    intervalRef.current = setInterval(refresh, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const allLines = useMemo(
    () => content.split("\n").filter((l) => l.trim() !== ""),
    [content],
  );

  const lines = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLines.slice(hiddenBefore).filter((line) => {
      if (level !== "all" && lineLevel(line) !== level) return false;
      if (q && !line.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allLines, hiddenBefore, level, query]);

  // Auto-scroll only when new content arrives AND the user is already near the bottom.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  const levels: Level[] = ["all", "info", "warn", "error"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.2rem", margin: 0 }}>{t("logs.title")}</h2>
        <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
          {query || level !== "all"
            ? t("logs.linesFiltered", { shown: lines.length, total: allLines.length - hiddenBefore })
            : t("logs.lines", { count: lines.length })}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={checkboxLabel}>
            <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
            {t("logs.wrap")}
          </label>
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            {t("logs.autoScroll")}
          </label>
          <button
            className="btn btn-secondary"
            style={smallBtn}
            title={t("logs.clear.title")}
            onClick={() => setHiddenBefore(allLines.length)}
          >
            {t("logs.clear")}
          </button>
          <button
            className="btn btn-secondary"
            style={smallBtn}
            onClick={() => navigator.clipboard.writeText(lines.join("\n"))}
          >
            {t("common.copy")}
          </button>
          <button className="btn btn-secondary" style={smallBtn} onClick={refresh}>
            {t("common.refresh")}
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 8 }}>
        {LOG_TABS.map((tt) => (
          <button
            key={tt.id}
            className={`tab ${tab === tt.id ? "active" : ""}`}
            onClick={() => setTab(tt.id)}
          >
            {t(tt.labelKey)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {levels.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              style={{
                padding: "4px 10px",
                borderRadius: 14,
                fontSize: "0.76rem",
                border: `1px solid ${level === lv ? "var(--accent)" : "var(--border)"}`,
                background: level === lv ? "rgba(108,92,231,0.2)" : "transparent",
                color: level === lv ? "var(--accent)" : "var(--text-dim)",
              }}
            >
              {t(`logs.level.${lv}`)}
            </button>
          ))}
        </div>
        <input
          placeholder={t("logs.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
      </div>

      <div
        ref={scrollRef}
        className="card"
        style={{ overflow: "auto", padding: 12, flex: 1, minHeight: 0 }}
      >
        {lines.length === 0 ? (
          <div className="empty-state">{t("logs.empty")}</div>
        ) : (
          <pre
            style={{
              fontFamily: '"Cascadia Code", "Fira Code", monospace',
              fontSize: "0.78rem",
              margin: 0,
              whiteSpace: wrap ? "pre-wrap" : "pre",
              wordBreak: wrap ? "break-all" : "normal",
              userSelect: "text",
              cursor: "text",
              lineHeight: 1.5,
            }}
          >
            {lines.map((line, i) => (
              <span key={i} style={{ display: "block", color: LEVEL_COLOR[lineLevel(line)] }}>
                {line}
              </span>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

const checkboxLabel: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--text-dim)",
  display: "flex",
  alignItems: "center",
  gap: 4,
};
const smallBtn: React.CSSProperties = { padding: "4px 10px", fontSize: "0.78rem" };
