import { useEffect, useState } from "react";
import {
  ServerConfig as ServerConfigType,
  getServerConfig,
  saveServerConfig,
  parseVlessUri,
} from "../lib/tauri";
import { useI18n } from "../i18n";

export default function ServerConfig() {
  const { t } = useI18n();
  const [config, setConfig] = useState<ServerConfigType>({
    address: "",
    port: 443,
    uuid: "",
    flow: "xtls-rprx-vision",
    encryption: "none",
    network: "tcp",
    security: "tls",
    sni: "",
    fingerprint: "chrome",
    alpn: ["h2", "http/1.1"],
    public_key: "",
    short_id: "",
    spider_x: "",
  });
  const [vlessUri, setVlessUri] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getServerConfig().then(setConfig).catch(console.error);
  }, []);

  const handleSave = async () => {
    setError("");
    setSaved(false);
    try {
      await saveServerConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImportUri = async () => {
    setError("");
    setSaved(false);
    try {
      const parsed = await parseVlessUri(vlessUri);
      setConfig(parsed);
      await saveServerConfig(parsed);
      setVlessUri("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  };

  const update = (field: keyof ServerConfigType, value: string | number | string[]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1.2rem" }}>{t("server.title")}</h2>

      {error && <div className="error-msg">{error}</div>}

      <div className="card">
        <div className="card-title">{t("server.import.title")}</div>
        <div className="route-toolbar">
          <input
            placeholder={t("server.import.placeholder")}
            value={vlessUri}
            onChange={(e) => setVlessUri(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImportUri()}
          />
          <button className="btn btn-primary" onClick={handleImportUri}>
            {t("common.import")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t("server.connection")}</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("server.address")}</label>
            <input
              value={config.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="server.example.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("server.port")}</label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => update("port", parseInt(e.target.value) || 443)}
            />
          </div>
          <div className="form-group full-width">
            <label className="form-label">UUID</label>
            <input
              value={config.uuid}
              onChange={(e) => update("uuid", e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t("server.protocol")}</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("server.flow")}</label>
            <select
              value={config.flow}
              onChange={(e) => update("flow", e.target.value)}
            >
              <option value="xtls-rprx-vision">xtls-rprx-vision</option>
              <option value="">{t("server.flow.none")}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t("server.encryption")}</label>
            <select
              value={config.encryption}
              onChange={(e) => update("encryption", e.target.value)}
            >
              <option value="none">none</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t("server.network")}</label>
            <select
              value={config.network}
              onChange={(e) => update("network", e.target.value)}
            >
              <option value="tcp">TCP</option>
              <option value="ws">WebSocket</option>
              <option value="grpc">gRPC</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t("server.security")}</label>
            <select
              value={config.security}
              onChange={(e) => update("security", e.target.value)}
            >
              <option value="tls">TLS</option>
              <option value="reality">Reality</option>
              <option value="none">{t("server.security.none")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t("server.tlsReality")}</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("server.sni")}</label>
            <input
              value={config.sni}
              onChange={(e) => update("sni", e.target.value)}
              placeholder="example.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("server.fingerprint")}</label>
            <select
              value={config.fingerprint}
              onChange={(e) => update("fingerprint", e.target.value)}
            >
              <option value="chrome">Chrome</option>
              <option value="firefox">Firefox</option>
              <option value="safari">Safari</option>
              <option value="randomized">{t("server.fp.randomized")}</option>
            </select>
          </div>
          {config.security === "reality" && (
            <>
              <div className="form-group">
                <label className="form-label">{t("server.publicKey")}</label>
                <input
                  value={config.public_key}
                  onChange={(e) => update("public_key", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("server.shortId")}</label>
                <input
                  value={config.short_id}
                  onChange={(e) => update("short_id", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("server.spiderX")}</label>
                <input
                  value={config.spider_x}
                  onChange={(e) => update("spider_x", e.target.value)}
                  placeholder="/"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          {t("common.saveConfig")}
        </button>
        {saved && (
          <span
            style={{
              color: "var(--success)",
              fontSize: "0.85rem",
              alignSelf: "center",
            }}
          >
            {t("common.saved")}
          </span>
        )}
      </div>
    </div>
  );
}
