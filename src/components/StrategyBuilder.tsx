import { useEffect, useMemo, useState } from "react";
import { listZapretBlobs, type DesyncAction, type ZapretProfile } from "../lib/tauri";
import { useI18n } from "../i18n";

// ── Option sets ──
const L7_OPTIONS = ["tls", "quic", "http", "discord", "stun", "dns"];
const PAYLOAD_OPTIONS = [
  "",
  "tls_client_hello",
  "tls_server_hello",
  "quic_initial",
  "http_req",
  "http_reply",
];
const METHODS = ["fake", "multisplit", "multidisorder", "fakedsplit", "rst"];

// Which parameter fields each desync method exposes.
const METHOD_FIELDS: Record<string, (keyof DesyncAction)[]> = {
  fake: ["blob", "repeats", "tcp_ts", "tls_mod"],
  multisplit: ["pos", "seqovl"],
  multidisorder: ["pos", "seqovl"],
  fakedsplit: ["pos", "pattern", "tcp_ts"],
  rst: ["pos"],
};

// Curated fallback list used when the backend blob folder can't be read (e.g. dev
// before resources are in place). Mirrors common files in zapret2/files/fake.
const FALLBACK_BLOBS = [
  "tls_clienthello_www_google_com.bin",
  "tls_clienthello_gosuslugi_ru.bin",
  "tls_clienthello_vk_com.bin",
  "tls_clienthello_iana_org.bin",
  "quic_initial_www_google_com.bin",
  "quic_initial_facebook_com.bin",
  "stun.bin",
  "dns.bin",
];

function sanitizeBlobId(file: string): string {
  return file.replace(/\.bin$/, "").replace(/[^a-zA-Z0-9]/g, "_");
}

export function newDesync(): DesyncAction {
  return {
    method: "fakedsplit",
    blob: "",
    pos: "",
    seqovl: "",
    tcp_ts: "",
    repeats: "",
    pattern: "",
    tls_mod: "",
  };
}

export function newProfile(): ZapretProfile {
  return {
    name: "",
    l4: "tcp",
    ports: "443",
    l7: ["tls"],
    payload: "tls_client_hello",
    hostlist_domains: "",
    desyncs: [newDesync()],
  };
}

/** Mirror of the Rust `build_profile_args` for a live, human-readable preview. */
export function previewArgs(profiles: ZapretProfile[]): string[] {
  if (profiles.length === 0) return [];
  const args: string[] = [
    "--lua-init=@zapret2/lua/zapret-lib.lua",
    "--lua-init=@zapret2/lua/zapret-antidpi.lua",
  ];
  const declared: string[] = [];
  for (const p of profiles) {
    for (const d of p.desyncs) {
      const blob = d.blob.trim();
      if (blob && !declared.includes(blob)) {
        declared.push(blob);
        args.push(`--blob=${sanitizeBlobId(blob)}:zapret2/files/fake/${blob}`);
      }
    }
  }
  profiles.forEach((p, i) => {
    if (i > 0) args.push("--new");
    const l4 = p.l4 === "udp" ? "udp" : "tcp";
    if (p.ports.trim()) args.push(`--filter-${l4}=${p.ports.trim()}`);
    const l7 = p.l7.filter((s) => s.trim());
    if (l7.length) args.push(`--filter-l7=${l7.join(",")}`);
    if (p.payload.trim()) args.push(`--payload=${p.payload.trim()}`);
    if (p.hostlist_domains.trim())
      args.push(`--hostlist-domains=${p.hostlist_domains.trim()}`);
    for (const d of p.desyncs) {
      if (!d.method.trim()) continue;
      const parts = [d.method.trim()];
      if (d.blob.trim()) parts.push(`blob=${sanitizeBlobId(d.blob.trim())}`);
      if (d.pos.trim()) parts.push(`pos=${d.pos.trim()}`);
      if (d.seqovl.trim()) parts.push(`seqovl=${d.seqovl.trim()}`);
      if (d.pattern.trim()) parts.push(`pattern=${d.pattern.trim()}`);
      if (d.tls_mod.trim()) parts.push(`tls_mod=${d.tls_mod.trim()}`);
      if (d.repeats.trim()) parts.push(`repeats=${d.repeats.trim()}`);
      if (d.tcp_ts.trim()) parts.push(`tcp_ts=${d.tcp_ts.trim()}`);
      args.push(`--lua-desync=${parts.join(":")}`);
    }
  });
  return args;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text)",
};
const labelStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-dim)",
  display: "block",
  marginBottom: 4,
};

interface Props {
  profiles: ZapretProfile[];
  onChange: (profiles: ZapretProfile[]) => void;
}

export default function StrategyBuilder({ profiles, onChange }: Props) {
  const { t } = useI18n();
  const [blobs, setBlobs] = useState<string[]>(FALLBACK_BLOBS);

  useEffect(() => {
    listZapretBlobs()
      .then((b) => {
        if (b && b.length) setBlobs(b);
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  const preview = useMemo(() => previewArgs(profiles), [profiles]);

  const updateProfile = (i: number, patch: Partial<ZapretProfile>) => {
    onChange(profiles.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const removeProfile = (i: number) => onChange(profiles.filter((_, idx) => idx !== i));
  const moveProfile = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= profiles.length) return;
    const next = [...profiles];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addProfile = () => onChange([...profiles, newProfile()]);

  const updateDesync = (pi: number, di: number, patch: Partial<DesyncAction>) => {
    updateProfile(pi, {
      desyncs: profiles[pi].desyncs.map((d, idx) => (idx === di ? { ...d, ...patch } : d)),
    });
  };
  const addDesync = (pi: number) =>
    updateProfile(pi, { desyncs: [...profiles[pi].desyncs, newDesync()] });
  const removeDesync = (pi: number, di: number) =>
    updateProfile(pi, { desyncs: profiles[pi].desyncs.filter((_, idx) => idx !== di) });

  const toggleL7 = (pi: number, proto: string) => {
    const cur = profiles[pi].l7;
    updateProfile(pi, {
      l7: cur.includes(proto) ? cur.filter((x) => x !== proto) : [...cur, proto],
    });
  };

  return (
    <div className="card">
      <div className="card-title">{t("builder.title")}</div>
      <p style={{ fontSize: "0.83rem", color: "var(--text-dim)", marginBottom: 12 }}>
        {t("builder.desc")}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={addProfile}>
          + {t("builder.addProfile")}
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="empty-state">{t("builder.empty")}</div>
      ) : (
        profiles.map((p, pi) => (
          <div
            key={pi}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              background: "var(--bg-input)",
            }}
          >
            {/* Profile header */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                {t("builder.profile")} {pi + 1}
              </span>
              <input
                style={{ ...inputStyle, flex: 1, padding: "4px 8px" }}
                placeholder={t("builder.profile.name")}
                value={p.name}
                onChange={(e) => updateProfile(pi, { name: e.target.value })}
              />
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 10px" }}
                disabled={pi === 0}
                title={t("builder.profile.moveUp")}
                onClick={() => moveProfile(pi, -1)}
              >
                ↑
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 10px" }}
                disabled={pi === profiles.length - 1}
                title={t("builder.profile.moveDown")}
                onClick={() => moveProfile(pi, 1)}
              >
                ↓
              </button>
              <button
                className="btn btn-danger"
                style={{ padding: "4px 10px" }}
                title={t("builder.profile.remove")}
                onClick={() => removeProfile(pi)}
              >
                ✕
              </button>
            </div>

            {/* Filter */}
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8 }}>
              {t("builder.filter")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>{t("builder.l4")}</label>
                <select
                  style={inputStyle}
                  value={p.l4}
                  onChange={(e) => updateProfile(pi, { l4: e.target.value as "tcp" | "udp" })}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("builder.ports")}</label>
                <input
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                  value={p.ports}
                  placeholder="443"
                  onChange={(e) => updateProfile(pi, { ports: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t("builder.l7")}</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {L7_OPTIONS.map((proto) => {
                  const on = p.l7.includes(proto);
                  return (
                    <button
                      key={proto}
                      onClick={() => toggleL7(pi, proto)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 14,
                        fontSize: "0.78rem",
                        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                        background: on ? "rgba(108,92,231,0.2)" : "transparent",
                        color: on ? "var(--accent)" : "var(--text-dim)",
                      }}
                    >
                      {proto}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t("builder.payload")}</label>
                <select
                  style={inputStyle}
                  value={p.payload}
                  onChange={(e) => updateProfile(pi, { payload: e.target.value })}
                >
                  {PAYLOAD_OPTIONS.map((pl) => (
                    <option key={pl} value={pl}>
                      {pl || t("builder.payload.none")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("builder.hostlist")}</label>
                <input
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                  value={p.hostlist_domains}
                  placeholder={t("builder.hostlist.placeholder")}
                  onChange={(e) => updateProfile(pi, { hostlist_domains: e.target.value })}
                />
              </div>
            </div>

            {/* Desync actions */}
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8 }}>
              {t("builder.desyncs")}
            </div>
            {p.desyncs.length === 0 && (
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 8 }}>
                {t("builder.desync.empty")}
              </div>
            )}
            {p.desyncs.map((d, di) => {
              const fields = METHOD_FIELDS[d.method] ?? [];
              return (
                <div
                  key={di}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 8,
                    background: "var(--bg-card)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{t("builder.desync.method")}</label>
                      <select
                        style={inputStyle}
                        value={d.method}
                        onChange={(e) => updateDesync(pi, di, { method: e.target.value })}
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "6px 10px" }}
                      onClick={() => removeDesync(pi, di)}
                    >
                      {t("builder.desync.remove")}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    {fields.includes("blob") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.blob")}</label>
                        <select
                          style={inputStyle}
                          value={d.blob}
                          onChange={(e) => updateDesync(pi, di, { blob: e.target.value })}
                        >
                          <option value="">{t("builder.desync.blob.none")}</option>
                          {blobs.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {fields.includes("pos") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.pos")}</label>
                        <input
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                          value={d.pos}
                          placeholder={t("builder.hint.pos")}
                          onChange={(e) => updateDesync(pi, di, { pos: e.target.value })}
                        />
                      </div>
                    )}
                    {fields.includes("seqovl") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.seqovl")}</label>
                        <input
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                          value={d.seqovl}
                          placeholder="652"
                          onChange={(e) => updateDesync(pi, di, { seqovl: e.target.value })}
                        />
                      </div>
                    )}
                    {fields.includes("pattern") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.pattern")}</label>
                        <input
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                          value={d.pattern}
                          placeholder="0x00"
                          onChange={(e) => updateDesync(pi, di, { pattern: e.target.value })}
                        />
                      </div>
                    )}
                    {fields.includes("repeats") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.repeats")}</label>
                        <input
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                          value={d.repeats}
                          placeholder="6"
                          onChange={(e) => updateDesync(pi, di, { repeats: e.target.value })}
                        />
                      </div>
                    )}
                    {fields.includes("tcp_ts") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.tcpTs")}</label>
                        <input
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                          value={d.tcp_ts}
                          placeholder={t("builder.hint.tcpTs")}
                          onChange={(e) => updateDesync(pi, di, { tcp_ts: e.target.value })}
                        />
                      </div>
                    )}
                    {fields.includes("tls_mod") && (
                      <div>
                        <label style={labelStyle}>{t("builder.desync.tlsMod")}</label>
                        <input
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                          value={d.tls_mod}
                          placeholder="rnd,dupsid,sni=www.cloudflare.com"
                          onChange={(e) => updateDesync(pi, di, { tls_mod: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              className="btn btn-secondary"
              style={{ padding: "4px 12px" }}
              onClick={() => addDesync(pi)}
            >
              + {t("builder.desync.add")}
            </button>
          </div>
        ))
      )}

      {/* Live preview */}
      <div style={{ marginTop: 8 }}>
        <label style={labelStyle}>{t("builder.preview")}</label>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 6,
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            fontFamily: '"Cascadia Code", "Fira Code", monospace',
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: preview.length ? "var(--text)" : "var(--text-dim)",
          }}
        >
          {preview.length ? preview.join(" \\\n  ") : t("builder.preview.empty")}
        </pre>
      </div>
    </div>
  );
}
