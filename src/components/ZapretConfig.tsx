import { useEffect, useState } from "react";
import {
  getZapretConfig,
  saveZapretConfig,
  getZapretLog,
  runZapretAutotest,
  type ZapretConfig,
  type ZapretProfile,
  type AutotestResult,
} from "../lib/tauri";
import { useI18n } from "../i18n";
import StrategyBuilder, { newProfile } from "./StrategyBuilder";

// Starting-point profiles for the "Load from preset" button in the builder.
const PRESET_TEMPLATES: ZapretProfile[] = [
  {
    name: "TCP 443 TLS",
    l4: "tcp",
    ports: "443",
    l7: ["tls"],
    payload: "tls_client_hello",
    hostlist_domains: "",
    desyncs: [
      {
        method: "fake",
        blob: "tls_clienthello_gosuslugi_ru.bin",
        pos: "",
        seqovl: "",
        tcp_ts: "-10000",
        repeats: "6",
        pattern: "",
        tls_mod: "",
      },
      {
        method: "multisplit",
        blob: "",
        pos: "10",
        seqovl: "652",
        tcp_ts: "",
        repeats: "",
        pattern: "",
        tls_mod: "",
      },
      {
        method: "fakedsplit",
        blob: "",
        pos: "",
        seqovl: "",
        tcp_ts: "-600000",
        repeats: "",
        pattern: "0x00",
        tls_mod: "",
      },
    ],
  },
  {
    name: "QUIC UDP 443",
    l4: "udp",
    ports: "443",
    l7: ["quic"],
    payload: "quic_initial",
    hostlist_domains: "",
    desyncs: [
      {
        method: "fake",
        blob: "quic_initial_www_google_com.bin",
        pos: "",
        seqovl: "",
        tcp_ts: "-10000",
        repeats: "6",
        pattern: "",
        tls_mod: "",
      },
    ],
  },
];

const STRATEGY_MAP: Record<string, ZapretConfig["strategy"]> = {
  Normal: "normal",
  NormalPlus: "normal_plus",
  NormalDiscord: "normal_discord",
};

export default function ZapretConfigComponent() {
  const { t } = useI18n();
  const [config, setConfig] = useState<ZapretConfig>({
    strategy: "normal",
    tcp_ports: "80,443",
    udp_ports: "443",
    custom_args: "",
    profiles: [],
  });
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testDomain, setTestDomain] = useState("youtube.com");
  const [autotestRunning, setAutotestRunning] = useState(false);
  const [autotestResults, setAutotestResults] = useState<AutotestResult[]>([]);

  useEffect(() => {
    getZapretConfig()
      .then((c) => setConfig({ ...c, profiles: c.profiles ?? [] }))
      .catch((e) => setError(String(e)));
  }, []);

  const handleSave = async () => {
    setError("");
    setSuccess("");
    try {
      await saveZapretConfig(config);
      setSuccess(t("zconf.saved"));
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLoadLog = async () => {
    setError("");
    try {
      setLog(await getZapretLog());
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStrategyChange = (strategy: ZapretConfig["strategy"]) => {
    // Seed the builder with one empty profile the first time it's selected.
    if (strategy === "builder" && config.profiles.length === 0) {
      setConfig({ ...config, strategy, profiles: [newProfile()] });
    } else {
      setConfig({ ...config, strategy });
    }
  };

  const handleAutotest = async () => {
    if (!testDomain.trim()) {
      setError(t("zconf.autotest.enterDomain"));
      return;
    }
    setAutotestRunning(true);
    setError("");
    setAutotestResults([]);
    try {
      const results = await runZapretAutotest(testDomain);
      setAutotestResults(results);
      const successful = results.filter((r) => r.success);
      if (successful.length > 0) {
        const best = successful.reduce((a, b) =>
          a.response_time_ms < b.response_time_ms ? a : b,
        );
        setSuccess(t("zconf.autotest.best", { name: best.strategy, ms: best.response_time_ms }));
        const newStrategy = STRATEGY_MAP[best.strategy];
        if (newStrategy) setConfig((c) => ({ ...c, strategy: newStrategy }));
      } else {
        setError(t("zconf.autotest.noneSucceeded"));
      }
    } catch (e) {
      setError(t("zconf.autotest.error", { err: String(e) }));
    } finally {
      setAutotestRunning(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: 8,
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1.2rem" }}>{t("zconf.title")}</h2>

      {error && <div className="error-msg">{error}</div>}
      {success && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "var(--success)",
            color: "white",
            borderRadius: 6,
          }}
        >
          {success}
        </div>
      )}

      <div className="card">
        <div className="card-title">{t("zconf.strategy.title")}</div>
        <p style={{ fontSize: "0.83rem", color: "var(--text-dim)", marginBottom: 12 }}>
          {t("zconf.strategy.desc")}
        </p>
        <select
          value={config.strategy}
          onChange={(e) => handleStrategyChange(e.target.value as ZapretConfig["strategy"])}
          style={selectStyle}
        >
          <option value="normal">{t("zconf.strategy.normal")}</option>
          <option value="normal_plus">{t("zconf.strategy.normalPlus")}</option>
          <option value="normal_discord">{t("zconf.strategy.normalDiscord")}</option>
          <option value="builder">{t("zconf.strategy.builder")}</option>
          <option value="custom">{t("zconf.strategy.custom")}</option>
        </select>
      </div>

      <div className="card">
        <div className="card-title">{t("zconf.ports.title")}</div>
        <p style={{ fontSize: "0.83rem", color: "var(--text-dim)", marginBottom: 12 }}>
          {t("zconf.ports.desc")}
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: "0.85rem", color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
            {t("zconf.ports.tcp")}
          </label>
          <input
            type="text"
            value={config.tcp_ports}
            onChange={(e) => setConfig({ ...config, tcp_ports: e.target.value })}
            style={{ ...selectStyle, fontFamily: "monospace" }}
            placeholder="80,443,8000-9000"
          />
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 4 }}>
            {t("zconf.ports.hint")}
          </div>
        </div>
        <div>
          <label style={{ fontSize: "0.85rem", color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
            {t("zconf.ports.udp")}
          </label>
          <input
            type="text"
            value={config.udp_ports}
            onChange={(e) => setConfig({ ...config, udp_ports: e.target.value })}
            style={{ ...selectStyle, fontFamily: "monospace" }}
            placeholder="443,50000-65535"
          />
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 4 }}>
            {t("zconf.ports.hint")}
          </div>
        </div>
      </div>

      {config.strategy === "builder" && (
        <>
          <div style={{ marginBottom: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={() =>
                setConfig({ ...config, profiles: PRESET_TEMPLATES.map((p) => ({ ...p })) })
              }
            >
              {t("builder.loadPreset")}
            </button>
          </div>
          <StrategyBuilder
            profiles={config.profiles}
            onChange={(profiles) => setConfig({ ...config, profiles })}
          />
        </>
      )}

      {config.strategy === "custom" && (
        <div className="card">
          <div className="card-title">{t("zconf.custom.title")}</div>
          <p style={{ fontSize: "0.83rem", color: "var(--text-dim)", marginBottom: 12 }}>
            {t("zconf.custom.desc")}
          </p>
          <textarea
            value={config.custom_args}
            onChange={(e) => setConfig({ ...config, custom_args: e.target.value })}
            style={{
              width: "100%",
              minHeight: 100,
              padding: 8,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-input)",
              color: "var(--text)",
              fontFamily: "monospace",
              fontSize: "0.85rem",
            }}
            placeholder="--filter-tcp=443 --lua-desync=fakedsplit:pattern=0x00"
          />
        </div>
      )}

      <div className="card">
        <div className="card-title">{t("zconf.autotest.title")}</div>
        <p style={{ fontSize: "0.83rem", color: "var(--text-dim)", marginBottom: 12 }}>
          {t("zconf.autotest.desc")}
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: "0.85rem", color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
            {t("zconf.autotest.domain")}
          </label>
          <input
            type="text"
            value={testDomain}
            onChange={(e) => setTestDomain(e.target.value)}
            placeholder="youtube.com"
            disabled={autotestRunning}
            style={selectStyle}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleAutotest}
          disabled={autotestRunning}
          style={{ marginBottom: autotestResults.length > 0 ? 16 : 0 }}
        >
          {autotestRunning ? t("zconf.autotest.running") : t("zconf.autotest.run")}
        </button>

        {autotestResults.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: "0.9rem", fontWeight: "bold", marginBottom: 8 }}>
              {t("zconf.autotest.results")}
            </div>
            {autotestResults.map((result, i) => (
              <div
                key={i}
                style={{
                  padding: 8,
                  marginBottom: 8,
                  borderRadius: 4,
                  background: result.success ? "rgba(0, 200, 0, 0.1)" : "rgba(200, 0, 0, 0.1)",
                  border: `1px solid ${result.success ? "#00c800" : "#c80000"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold" }}>{result.strategy}</span>
                  <span style={{ fontSize: "0.85rem", color: result.success ? "#00c800" : "#c80000" }}>
                    {result.success ? `✓ ${result.response_time_ms}ms` : `✗ ${t("zconf.autotest.failed")}`}
                  </span>
                </div>
                {result.error && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 4 }}>
                    {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={handleSave} style={{ marginBottom: 20 }}>
        {t("common.saveConfig")}
      </button>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>
            {t("zconf.debugLog")}
          </div>
          <button className="btn btn-secondary" onClick={handleLoadLog}>
            {t("zconf.refreshLog")}
          </button>
        </div>
        <pre
          style={{
            maxHeight: 400,
            overflow: "auto",
            fontSize: "0.75rem",
            background: "var(--bg-input)",
            padding: 12,
            borderRadius: 4,
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {log || t("zconf.noLog")}
        </pre>
      </div>
    </div>
  );
}
