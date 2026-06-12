import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useI18n } from "../i18n";
import { GITHUB_URL, TELEGRAM_URL, ZAPRET2_URL, SINGBOX_URL } from "../lib/links";
import { GitHubIcon, TelegramIcon } from "./Icons";

type Section = "intro" | "quickstart" | "routes" | "zapret" | "logs" | "faq" | "links";

const SECTIONS: Section[] = ["intro", "quickstart", "routes", "zapret", "logs", "faq", "links"];

export default function Help() {
  const { t } = useI18n();
  const [active, setActive] = useState<Section>("intro");

  const bullet = (text: string) => (
    <li style={{ marginBottom: 6, lineHeight: 1.6 }}>{text}</li>
  );

  const renderSection = () => {
    switch (active) {
      case "intro":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.intro")}</div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("help.intro.greeting")}</p>
            <p style={{ lineHeight: 1.7, marginBottom: 12 }}>{t("help.intro.body")}</p>
            <p style={{ marginBottom: 6 }}>{t("help.intro.modes")}</p>
            <ul style={{ paddingLeft: 18 }}>
              {bullet(t("help.intro.mode.off"))}
              {bullet(t("help.intro.mode.vpn"))}
              {bullet(t("help.intro.mode.zapret"))}
              {bullet(t("help.intro.mode.vpnZapret"))}
              {bullet(t("help.intro.mode.fullVpn"))}
            </ul>
          </div>
        );
      case "quickstart":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.quickstart")}</div>
            <p style={{ marginBottom: 6 }}>{t("help.quickstart.body")}</p>
            <ol style={{ paddingLeft: 18 }}>
              {bullet(t("help.quickstart.step1"))}
              {bullet(t("help.quickstart.step2"))}
              {bullet(t("help.quickstart.step3"))}
              {bullet(t("help.quickstart.step4"))}
            </ol>
            <p style={{ marginTop: 12, color: "var(--warning)", lineHeight: 1.6 }}>
              {t("help.quickstart.admin")}
            </p>
          </div>
        );
      case "routes":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.routes")}</div>
            <p style={{ marginBottom: 6 }}>{t("help.routes.body")}</p>
            <ul style={{ paddingLeft: 18 }}>
              {bullet(t("help.routes.vpn"))}
              {bullet(t("help.routes.zapret"))}
            </ul>
            <p style={{ marginTop: 8, lineHeight: 1.6 }}>{t("help.routes.apply")}</p>
          </div>
        );
      case "zapret":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.zapret")}</div>
            <p style={{ marginBottom: 6 }}>{t("help.zapret.body")}</p>
            <ul style={{ paddingLeft: 18 }}>
              {bullet(t("help.zapret.presets"))}
              {bullet(t("help.zapret.builder"))}
              {bullet(t("help.zapret.profile"))}
              {bullet(t("help.zapret.desync"))}
              {bullet(t("help.zapret.blob"))}
              {bullet(t("help.zapret.autotest"))}
            </ul>
          </div>
        );
      case "logs":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.logs")}</div>
            <p style={{ lineHeight: 1.7 }}>{t("help.logs.body")}</p>
          </div>
        );
      case "faq":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.faq")}</div>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>{t(`help.faq.q${n}`)}</p>
                <p style={{ color: "var(--text-dim)", lineHeight: 1.6 }}>{t(`help.faq.a${n}`)}</p>
              </div>
            ))}
          </div>
        );
      case "links":
        return (
          <div className="card">
            <div className="card-title">{t("help.section.links")}</div>
            <p style={{ marginBottom: 12 }}>{t("help.links.body")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              <button className="btn btn-secondary" onClick={() => open(GITHUB_URL)}>
                <GitHubIcon size={14} /> {t("help.links.github")}
              </button>
              <button className="btn btn-secondary" onClick={() => open(ZAPRET2_URL)}>
                <GitHubIcon size={14} /> {t("help.links.zapret2")}
              </button>
              <button className="btn btn-secondary" onClick={() => open(SINGBOX_URL)}>
                <GitHubIcon size={14} /> {t("help.links.singbox")}
              </button>
              <button className="btn btn-secondary" onClick={() => open(TELEGRAM_URL)}>
                <TelegramIcon size={14} /> {t("help.links.telegram")}
              </button>
            </div>
            <p style={{ marginTop: 16, color: "var(--text-dim)" }}>{t("help.signature")}</p>
          </div>
        );
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1.2rem" }}>{t("help.title")}</h2>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 170,
            position: "sticky",
            top: 0,
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s}
              className={`nav-item ${active === s ? "active" : ""}`}
              style={{ borderRadius: 6 }}
              onClick={() => setActive(s)}
            >
              {t(`help.section.${s}`)}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1, minWidth: 0 }}>{renderSection()}</div>
      </div>
    </div>
  );
}
