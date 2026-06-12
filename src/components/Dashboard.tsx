import { useEffect, useState } from "react";
import { getStatus, setMode, StatusInfo, VpnMode } from "../lib/tauri";
import { useI18n } from "../i18n";

export default function Dashboard() {
  const { t } = useI18n();
  const [status, setStatus] = useState<StatusInfo>({
    mode: "off",
    zapret_running: false,
    singbox_running: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getStatus().then(setStatus).catch(console.error);
    const interval = setInterval(() => {
      getStatus().then(setStatus).catch(console.error);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleMode = async (mode: VpnMode) => {
    setLoading(true);
    setError("");
    try {
      const newStatus = await setMode(mode);
      setStatus(newStatus);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1.2rem" }}>{t("dashboard.title")}</h2>

      {error && <div className="error-msg">{error}</div>}

      <div className="mode-switcher">
        <button
          className={`mode-btn off ${status.mode === "off" ? "active" : ""}`}
          onClick={() => handleMode("off")}
          disabled={loading}
        >
          {t("dashboard.mode.off")}
          <div style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 4 }}>
            {t("dashboard.mode.off.desc")}
          </div>
        </button>
        <button
          className={`mode-btn ${status.mode === "vpn_selective" ? "active" : ""}`}
          onClick={() => handleMode("vpn_selective")}
          disabled={loading}
        >
          {t("dashboard.mode.vpn")}
          <div style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 4 }}>
            {t("dashboard.mode.vpn.desc")}
          </div>
        </button>
        <button
          className={`mode-btn ${status.mode === "zapret" ? "active" : ""}`}
          onClick={() => handleMode("zapret")}
          disabled={loading}
        >
          {t("dashboard.mode.zapret")}
          <div style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 4 }}>
            {t("dashboard.mode.zapret.desc")}
          </div>
        </button>
        <button
          className={`mode-btn ${status.mode === "vpn_zapret" ? "active" : ""}`}
          onClick={() => handleMode("vpn_zapret")}
          disabled={loading}
        >
          {t("dashboard.mode.vpnZapret")}
          <div style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 4 }}>
            {t("dashboard.mode.vpnZapret.desc")}
          </div>
        </button>
        <button
          className={`mode-btn full ${status.mode === "vpn_full" ? "active" : ""}`}
          onClick={() => handleMode("vpn_full")}
          disabled={loading}
        >
          {t("dashboard.mode.fullVpn")}
          <div style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 4 }}>
            {t("dashboard.mode.fullVpn.desc")}
          </div>
        </button>
      </div>

      <div className="card">
        <div className="card-title">{t("dashboard.status")}</div>
        <div className="status-row">
          <div className={`status-dot ${status.singbox_running ? "active" : ""}`} />
          <span>sing-box</span>
          <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
            {status.singbox_running ? t("common.running") : t("common.stopped")}
          </span>
        </div>
        <div className="status-row">
          <div className={`status-dot ${status.zapret_running ? "active" : ""}`} />
          <span>{t("dashboard.zapretLabel")}</span>
          <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
            {status.zapret_running ? t("common.running") : t("common.stopped")}
          </span>
        </div>
        <div className="status-row">
          <div className={`status-dot ${status.mode !== "off" ? "active" : ""}`} />
          <span>{t("dashboard.modeLabel")}</span>
          <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
            {status.mode === "off"
              ? t("dashboard.mode.value.off")
              : status.mode === "vpn_selective"
                ? t("dashboard.mode.value.vpn")
                : status.mode === "zapret"
                  ? t("dashboard.mode.value.zapret")
                  : status.mode === "vpn_zapret"
                    ? t("dashboard.mode.value.vpnZapret")
                    : t("dashboard.mode.value.fullVpn")}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t("dashboard.quickInfo")}</div>
        <div style={{ fontSize: "0.83rem", color: "var(--text-dim)", lineHeight: 1.7 }}>
          <p style={{ marginBottom: 4 }}><strong>{t("dashboard.modes")}</strong></p>
          <p>• <strong>VPN</strong> — {t("dashboard.info.vpn")}</p>
          <p>• <strong>ZAPRET</strong> — {t("dashboard.info.zapret")}</p>
          <p>• <strong>VPN+ZAPRET</strong> — {t("dashboard.info.vpnZapret")}</p>
          <p>• <strong>FULL VPN</strong> — {t("dashboard.info.fullVpn")}</p>
          <p style={{ marginTop: 8, marginBottom: 4 }}><strong>{t("dashboard.statusHint")}</strong></p>
          <p>• <strong>sing-box</strong> — {t("dashboard.info.singbox")}</p>
          <p>• <strong>Zapret</strong> — {t("dashboard.info.zapretStatus")}</p>
        </div>
      </div>

      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: 16,
            color: "var(--accent)",
            fontSize: "0.85rem",
          }}
        >
          {t("dashboard.applying")}
        </div>
      )}
    </div>
  );
}
