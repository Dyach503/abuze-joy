import { useEffect, useState } from "react";
import {
  RoutesConfig,
  AppRoutesConfig,
  getRoutes,
  addDomain,
  addIp,
  removeDomain,
  removeIp,
  toggleDomain,
  toggleIp,
  importRoutes,
  exportRoutes,
  applyRoutes,
  getAppRoutes,
  addApp,
  removeApp,
  toggleApp,
} from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";

type Tab = "domains" | "ips" | "apps";

export default function RouteEditor() {
  const { t } = useI18n();
  const [routes, setRoutes] = useState<RoutesConfig>({
    domains: [],
    ips: [],
  });
  const [appRoutes, setAppRoutes] = useState<AppRoutesConfig>({ apps: [] });
  const [tab, setTab] = useState<Tab>("domains");
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getRoutes().then(setRoutes).catch(console.error);
    getAppRoutes().then(setAppRoutes).catch(console.error);
  }, []);

  const handleAdd = async () => {
    setError("");
    try {
      if (tab === "apps") {
        const result = await addApp(input, note);
        setAppRoutes(result);
      } else {
        const result =
          tab === "domains"
            ? await addDomain(input, note)
            : await addIp(input, note);
        setRoutes(result);
      }
      setInput("");
      setNote("");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleBrowse = async () => {
    setError("");
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Executables", extensions: ["exe"] }],
      });
      if (selected) {
        const path = typeof selected === "string" ? selected : selected;
        const result = await addApp(path as string, note || t("routes.browse.note"));
        setAppRoutes(result);
        setNote("");
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (value: string) => {
    try {
      if (tab === "apps") {
        const result = await removeApp(value);
        setAppRoutes(result);
      } else {
        const result =
          tab === "domains"
            ? await removeDomain(value)
            : await removeIp(value);
        setRoutes(result);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleToggle = async (value: string, enabled: boolean) => {
    try {
      if (tab === "apps") {
        const result = await toggleApp(value, enabled);
        setAppRoutes(result);
      } else {
        const result =
          tab === "domains"
            ? await toggleDomain(value, enabled)
            : await toggleIp(value, enabled);
        setRoutes(result);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportRoutes();
      await navigator.clipboard.writeText(json);
      alert(t("common.copied"));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const result = await importRoutes(text);
      setRoutes(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleApply = async () => {
    try {
      await applyRoutes();
    } catch (e) {
      setError(String(e));
    }
  };

  // Get items for current tab
  const items =
    tab === "apps"
      ? appRoutes.apps.map((a) => ({
          value: a.path,
          enabled: a.enabled,
          note: a.note,
        }))
      : tab === "domains"
        ? routes.domains
        : routes.ips;

  const filtered = items.filter(
    (item) =>
      item.value.toLowerCase().includes(search.toLowerCase()) ||
      item.note.toLowerCase().includes(search.toLowerCase()),
  );

  // Extract filename from path for display
  const getAppName = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || path;
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1.2rem" }}>{t("routes.title")}</h2>

      {error && <div className="error-msg">{error}</div>}

      <div className="tabs">
        <button
          className={`tab ${tab === "domains" ? "active" : ""}`}
          onClick={() => setTab("domains")}
        >
          {t("routes.tab.domains")} ({routes.domains.length})
        </button>
        <button
          className={`tab ${tab === "ips" ? "active" : ""}`}
          onClick={() => setTab("ips")}
        >
          {t("routes.tab.ips")} ({routes.ips.length})
        </button>
        <button
          className={`tab ${tab === "apps" ? "active" : ""}`}
          onClick={() => setTab("apps")}
        >
          {t("routes.tab.apps")} ({appRoutes.apps.length})
        </button>
      </div>

      <div className="route-toolbar">
        {tab === "apps" ? (
          <>
            <input
              placeholder={t("routes.placeholder.app")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input && handleAdd()}
              style={{ flex: 1 }}
            />
            <input
              placeholder={t("common.note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input && handleAdd()}
              style={{ maxWidth: 180 }}
            />
            <button className="btn btn-primary" onClick={handleAdd} disabled={!input}>
              {t("common.add")}
            </button>
            <button className="btn btn-secondary" onClick={handleBrowse}>
              {t("common.browse")}
            </button>
          </>
        ) : (
          <>
            <input
              placeholder={tab === "domains" ? t("routes.placeholder.domain") : t("routes.placeholder.ip")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              placeholder={t("common.note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              style={{ maxWidth: 180 }}
            />
            <button className="btn btn-primary" onClick={handleAdd}>
              {t("common.add")}
            </button>
          </>
        )}
      </div>

      <div className="route-toolbar">
        <input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {tab !== "apps" && (
          <>
            <button className="btn btn-secondary" onClick={handleImport}>
              {t("common.import")}
            </button>
            <button className="btn btn-secondary" onClick={handleExport}>
              {t("common.export")}
            </button>
          </>
        )}
        <button className="btn btn-primary" onClick={handleApply}>
          {t("common.apply")}
        </button>
      </div>

      {tab === "apps" && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: 12 }}>
          {t("routes.apps.hint")}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          {search
            ? t("common.noMatches")
            : tab === "apps"
              ? t("routes.empty.apps")
              : tab === "domains"
                ? t("routes.empty.domains")
                : t("routes.empty.ips")}
        </div>
      ) : (
        <table className="route-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>{t("common.on")}</th>
              <th>
                {tab === "apps"
                  ? t("routes.col.app")
                  : tab === "domains"
                    ? t("routes.col.domain")
                    : t("routes.col.ip")}
              </th>
              <th>{t("routes.col.note")}</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.value}>
                <td>
                  <div
                    className={`toggle ${item.enabled ? "on" : ""}`}
                    onClick={() => handleToggle(item.value, !item.enabled)}
                  />
                </td>
                <td className="value">
                  {tab === "apps" ? (
                    <div>
                      <div>{getAppName(item.value)}</div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-dim)",
                          wordBreak: "break-all",
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  ) : (
                    item.value
                  )}
                </td>
                <td style={{ color: "var(--text-dim)" }}>{item.note}</td>
                <td>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                    onClick={() => handleRemove(item.value)}
                  >
                    {t("common.del")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
