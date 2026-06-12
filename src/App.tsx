import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import Dashboard from "./components/Dashboard";
import RouteEditor from "./components/RouteEditor";
import ZapretRouteEditor from "./components/ZapretRouteEditor";
import ZapretConfig from "./components/ZapretConfig";
import ServerConfig from "./components/ServerConfig";
import LogViewer from "./components/LogViewer";
import Help from "./components/Help";
import { useI18n } from "./i18n";
import { GITHUB_URL, TELEGRAM_URL } from "./lib/links";
import { GitHubIcon, TelegramIcon } from "./components/Icons";

type Page =
  | "dashboard"
  | "vpn-routes"
  | "zapret-routes"
  | "zapret-config"
  | "server"
  | "logs"
  | "help";

function App() {
  const { t, lang, setLang } = useI18n();
  const [page, setPage] = useState<Page>("dashboard");

  const pages: { id: Page; labelKey: string; icon: string }[] = [
    { id: "dashboard", labelKey: "nav.dashboard", icon: "⚡" },
    { id: "vpn-routes", labelKey: "nav.vpnRoutes", icon: "🔀" },
    { id: "zapret-routes", labelKey: "nav.zapretRoutes", icon: "🛡️" },
    { id: "zapret-config", labelKey: "nav.zapretConfig", icon: "⚙️" },
    { id: "server", labelKey: "nav.server", icon: "🔧" },
    { id: "logs", labelKey: "nav.logs", icon: "📋" },
    { id: "help", labelKey: "nav.help", icon: "❓" },
  ];

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-title">{t("app.title")}</div>
        {pages.map((p) => (
          <button
            key={p.id}
            className={`nav-item ${page === p.id ? "active" : ""}`}
            onClick={() => setPage(p.id)}
          >
            <span>{p.icon}</span>
            {t(p.labelKey)}
          </button>
        ))}

        <div className="sidebar-footer">
          <div className="lang-switch">
            <button
              className={`lang-btn ${lang === "ru" ? "active" : ""}`}
              onClick={() => setLang("ru")}
            >
              RU
            </button>
            <button
              className={`lang-btn ${lang === "en" ? "active" : ""}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
          </div>
          <button className="nav-item" onClick={() => open(GITHUB_URL)}>
            <GitHubIcon size={15} />
            {t("nav.github")}
          </button>
          <button className="nav-item" onClick={() => open(TELEGRAM_URL)}>
            <TelegramIcon size={15} />
            {t("nav.telegram")}
          </button>
        </div>
      </nav>
      <main className="content">
        {page === "dashboard" && <Dashboard />}
        {page === "vpn-routes" && <RouteEditor />}
        {page === "zapret-routes" && <ZapretRouteEditor />}
        {page === "zapret-config" && <ZapretConfig />}
        {page === "server" && <ServerConfig />}
        {page === "logs" && <LogViewer />}
        {page === "help" && <Help />}
      </main>
    </div>
  );
}

export default App;
