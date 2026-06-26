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
  "stun",
  "discord_ip_discovery",
];
const METHODS = [
  "fake",
  "multisplit",
  "multidisorder",
  "fakedsplit",
  "rst",
  "circular",
  "wssize",
];

// Which parameter fields each desync method exposes.
const METHOD_FIELDS: Record<string, (keyof DesyncAction)[]> = {
  fake: ["blob", "repeats", "tcp_ts", "tls_mod", "ip_autottl", "tcp_md5", "strategy"],
  multisplit: ["pos", "seqovl", "ip_autottl", "tcp_md5", "strategy"],
  multidisorder: ["pos", "seqovl", "ip_autottl", "tcp_md5", "strategy"],
  fakedsplit: ["pos", "pattern", "tcp_ts", "ip_autottl", "tcp_md5", "strategy"],
  rst: ["pos"],
  circular: ["fails", "maxtime", "retrans", "maxseq", "reset", "udp_out", "udp_in"],
  wssize: ["wsize", "scale", "strategy"],
};

// Per-field metadata for the generic desync parameter renderer.
type FieldType = "text" | "bool" | "blob";
const FIELD_META: Record<string, { label: string; placeholder?: string; type: FieldType }> = {
  blob: { label: "builder.desync.blob", type: "blob" },
  pos: { label: "builder.desync.pos", placeholder: "1,midsld", type: "text" },
  seqovl: { label: "builder.desync.seqovl", placeholder: "652", type: "text" },
  pattern: { label: "builder.desync.pattern", placeholder: "0x00", type: "text" },
  tls_mod: { label: "builder.desync.tlsMod", placeholder: "rnd,dupsid,sni=www.cloudflare.com", type: "text" },
  repeats: { label: "builder.desync.repeats", placeholder: "6", type: "text" },
  tcp_ts: { label: "builder.desync.tcpTs", placeholder: "-600000", type: "text" },
  strategy: { label: "builder.desync.strategy", placeholder: "1", type: "text" },
  ip_autottl: { label: "builder.desync.ipAutottl", placeholder: "-1,3-20", type: "text" },
  tcp_md5: { label: "builder.desync.tcpMd5", type: "bool" },
  fails: { label: "builder.desync.fails", placeholder: "2", type: "text" },
  maxtime: { label: "builder.desync.maxtime", placeholder: "30", type: "text" },
  retrans: { label: "builder.desync.retrans", placeholder: "2", type: "text" },
  maxseq: { label: "builder.desync.maxseq", placeholder: "16384", type: "text" },
  reset: { label: "builder.desync.reset", type: "bool" },
  udp_out: { label: "builder.desync.udpOut", placeholder: "4", type: "text" },
  udp_in: { label: "builder.desync.udpIn", placeholder: "1", type: "text" },
  wsize: { label: "builder.desync.wsize", placeholder: "1", type: "text" },
  scale: { label: "builder.desync.scale", placeholder: "6", type: "text" },
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

// A blob value loaded from a file (needs a `--blob=` declaration) vs. an inline hex
// literal (`0x…`) or a built-in name (`fake_default_*`) passed through verbatim.
function blobIsFile(blob: string): boolean {
  const b = blob.trim();
  return b !== "" && !b.startsWith("0x") && !b.startsWith("fake_default_");
}
function blobParamValue(blob: string): string {
  const b = blob.trim();
  return blobIsFile(b) ? sanitizeBlobId(b) : b;
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
    strategy: "",
    ip_autottl: "",
    tcp_md5: false,
    fails: "",
    maxtime: "",
    retrans: "",
    maxseq: "",
    reset: false,
    udp_out: "",
    udp_in: "",
    wsize: "",
    scale: "",
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
    in_range: "",
    out_range: "",
    desyncs: [newDesync()],
  };
}

/** Mirror of the Rust `build_profile_args` for a live, human-readable preview.
 * Must stay byte-identical to `build_profile_args` in config_gen.rs. */
export function previewArgs(profiles: ZapretProfile[]): string[] {
  if (profiles.length === 0) return [];
  const args: string[] = [
    "--lua-init=@zapret2/lua/zapret-lib.lua",
    "--lua-init=@zapret2/lua/zapret-antidpi.lua",
    "--lua-init=@zapret2/lua/zapret-auto.lua",
  ];
  const declared: string[] = [];
  for (const p of profiles) {
    for (const d of p.desyncs) {
      const blob = d.blob.trim();
      if (blobIsFile(blob) && !declared.includes(blob)) {
        declared.push(blob);
        args.push(`--blob=${sanitizeBlobId(blob)}:@zapret2/files/fake/${blob}`);
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
    if (p.in_range.trim()) args.push(`--in-range=${p.in_range.trim()}`);
    if (p.out_range.trim()) args.push(`--out-range=${p.out_range.trim()}`);
    for (const d of p.desyncs) {
      if (!d.method.trim()) continue;
      const parts = [d.method.trim()];
      if (d.blob.trim()) parts.push(`blob=${blobParamValue(d.blob.trim())}`);
      if (d.pos.trim()) parts.push(`pos=${d.pos.trim()}`);
      if (d.seqovl.trim()) parts.push(`seqovl=${d.seqovl.trim()}`);
      if (d.pattern.trim()) parts.push(`pattern=${d.pattern.trim()}`);
      if (d.tls_mod.trim()) parts.push(`tls_mod=${d.tls_mod.trim()}`);
      if (d.repeats.trim()) parts.push(`repeats=${d.repeats.trim()}`);
      if (d.tcp_ts.trim()) parts.push(`tcp_ts=${d.tcp_ts.trim()}`);
      if (d.fails.trim()) parts.push(`fails=${d.fails.trim()}`);
      if (d.maxtime.trim()) parts.push(`maxtime=${d.maxtime.trim()}`);
      if (d.retrans.trim()) parts.push(`retrans=${d.retrans.trim()}`);
      if (d.maxseq.trim()) parts.push(`maxseq=${d.maxseq.trim()}`);
      if (d.udp_out.trim()) parts.push(`udp_out=${d.udp_out.trim()}`);
      if (d.udp_in.trim()) parts.push(`udp_in=${d.udp_in.trim()}`);
      if (d.reset) parts.push("reset");
      if (d.wsize.trim()) parts.push(`wsize=${d.wsize.trim()}`);
      if (d.scale.trim()) parts.push(`scale=${d.scale.trim()}`);
      if (d.ip_autottl.trim()) parts.push(`ip_autottl=${d.ip_autottl.trim()}`);
      if (d.tcp_md5) parts.push("tcp_md5");
      if (d.strategy.trim()) parts.push(`strategy=${d.strategy.trim()}`);
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
                <input
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                  list={`payloads-${pi}`}
                  value={p.payload}
                  placeholder={t("builder.payload.none")}
                  onChange={(e) => updateProfile(pi, { payload: e.target.value })}
                />
                <datalist id={`payloads-${pi}`}>
                  {PAYLOAD_OPTIONS.filter((pl) => pl).map((pl) => (
                    <option key={pl} value={pl} />
                  ))}
                </datalist>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t("builder.inRange")}</label>
                <input
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                  value={p.in_range}
                  placeholder="-s4096"
                  onChange={(e) => updateProfile(pi, { in_range: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("builder.outRange")}</label>
                <input
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                  value={p.out_range}
                  placeholder="-d10"
                  onChange={(e) => updateProfile(pi, { out_range: e.target.value })}
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
                    {fields.map((f) => {
                      const meta = FIELD_META[f];
                      if (!meta) return null;
                      const label = t(meta.label);

                      if (meta.type === "blob") {
                        return (
                          <div key={f}>
                            <label style={labelStyle}>{label}</label>
                            <input
                              style={{ ...inputStyle, fontFamily: "monospace" }}
                              list={`blobs-${pi}-${di}`}
                              value={d.blob}
                              placeholder={t("builder.desync.blob.none")}
                              onChange={(e) => updateDesync(pi, di, { blob: e.target.value })}
                            />
                            <datalist id={`blobs-${pi}-${di}`}>
                              {blobs.map((b) => (
                                <option key={b} value={b} />
                              ))}
                            </datalist>
                          </div>
                        );
                      }

                      if (meta.type === "bool") {
                        const checked = Boolean(d[f]);
                        return (
                          <label
                            key={f}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: "0.78rem",
                              color: "var(--text-dim)",
                              alignSelf: "end",
                              paddingBottom: 8,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => updateDesync(pi, di, { [f]: e.target.checked } as Partial<DesyncAction>)}
                            />
                            {label}
                          </label>
                        );
                      }

                      return (
                        <div key={f}>
                          <label style={labelStyle}>{label}</label>
                          <input
                            style={{ ...inputStyle, fontFamily: "monospace" }}
                            value={String(d[f] ?? "")}
                            placeholder={meta.placeholder}
                            onChange={(e) => updateDesync(pi, di, { [f]: e.target.value } as Partial<DesyncAction>)}
                          />
                        </div>
                      );
                    })}
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
