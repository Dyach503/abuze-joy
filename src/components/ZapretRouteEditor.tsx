import { useEffect, useState, useMemo, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  RoutesConfig,
  getZapretRoutes,
  addZapretDomain,
  addZapretIp,
  removeZapretDomain,
  removeZapretIp,
  toggleZapretDomain,
  toggleZapretIp,
  importZapretRoutes,
  exportZapretRoutes,
  importZapretDomainsFromFile,
  applyRoutes,
} from "../lib/tauri";
import { useI18n } from "../i18n";

type Tab = "domains" | "ips";

const ITEMS_PER_PAGE = 100;

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function RouteEditor() {
  const { t } = useI18n();
  const [routes, setRoutes] = useState<RoutesConfig>({
    domains: [],
    ips: [],
  });
  const [tab, setTab] = useState<Tab>("domains");
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search to avoid filtering on every keystroke
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    getZapretRoutes().then(setRoutes).catch(console.error);
  }, []);

  // Reset to page 1 when changing tabs or search
  useEffect(() => {
    setCurrentPage(1);
  }, [tab, debouncedSearch]);

  const handleAdd = async () => {
    setError("");
    try {
      const result =
        tab === "domains"
          ? await addZapretDomain(input, note)
          : await addZapretIp(input, note);
      setRoutes(result);
      setInput("");
      setNote("");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = useCallback(
    async (value: string) => {
      try {
        const result =
          tab === "domains"
            ? await removeZapretDomain(value)
            : await removeZapretIp(value);
        setRoutes(result);
      } catch (e) {
        setError(String(e));
      }
    },
    [tab]
  );

  const handleToggle = useCallback(
    async (value: string, enabled: boolean) => {
      try {
        const result =
          tab === "domains"
            ? await toggleZapretDomain(value, enabled)
            : await toggleZapretIp(value, enabled);
        setRoutes(result);
      } catch (e) {
        setError(String(e));
      }
    },
    [tab]
  );

  const handleExport = async () => {
    try {
      const json = await exportZapretRoutes();
      await navigator.clipboard.writeText(json);
      alert(t("common.copied"));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const result = await importZapretRoutes(text);
      setRoutes(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImportFromFile = async () => {
    setError("");
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Text files",
            extensions: ["txt", "lst", "list"],
          },
          {
            name: "All files",
            extensions: ["*"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        const result = await importZapretDomainsFromFile(selected);
        setRoutes(result);
        alert(t("zroutes.imported"));
      }
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

  // Memoize filtered items
  const filtered = useMemo(() => {
    const items = tab === "domains" ? routes.domains : routes.ips;
    if (!debouncedSearch) return items;

    const searchLower = debouncedSearch.toLowerCase();
    return items.filter(
      (item) =>
        item.value.toLowerCase().includes(searchLower) ||
        item.note.toLowerCase().includes(searchLower)
    );
  }, [routes, tab, debouncedSearch]);

  // Paginate filtered items
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filtered.slice(start, end);
  }, [filtered, currentPage]);

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1.2rem" }}>{t("zroutes.title")}</h2>

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
      </div>

      <div className="route-toolbar">
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
      </div>

      <div className="route-toolbar">
        <input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-secondary"
          onClick={handleImportFromFile}
          title={t("zroutes.importFile.title")}
        >
          {t("zroutes.importFile")}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleImport}
          title={t("zroutes.importJson.title")}
        >
          {t("zroutes.importJson")}
        </button>
        <button className="btn btn-secondary" onClick={handleExport}>
          {t("common.export")}
        </button>
        <button className="btn btn-primary" onClick={handleApply}>
          {t("common.apply")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          {search ? t("common.noMatches") : tab === "domains" ? t("routes.empty.domains") : t("routes.empty.ips")}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: "0.85rem",
              color: "var(--text-dim)",
              marginBottom: 8,
              padding: "0 4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {t("zroutes.showing", {
                from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                to: Math.min(currentPage * ITEMS_PER_PAGE, filtered.length),
                total: filtered.length,
              })}
            </span>
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: "4px 12px", fontSize: "0.8rem" }}
                >
                  {t("common.prev")}
                </button>
                <span style={{ padding: "4px 8px" }}>
                  {t("common.page")} {currentPage} {t("common.of")} {totalPages}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: "4px 12px", fontSize: "0.8rem" }}
                >
                  {t("common.next")}
                </button>
              </div>
            )}
          </div>
          <table className="route-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>{t("common.on")}</th>
                <th>{tab === "domains" ? t("routes.col.domain") : t("routes.col.ip")}</th>
                <th>{t("routes.col.note")}</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.value}>
                  <td>
                    <div
                      className={`toggle ${item.enabled ? "on" : ""}`}
                      onClick={() => handleToggle(item.value, !item.enabled)}
                    />
                  </td>
                  <td className="value">{item.value}</td>
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
        </>
      )}
    </div>
  );
}
