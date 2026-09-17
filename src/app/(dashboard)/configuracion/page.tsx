"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Loader2, CheckCircle2, AlertCircle, Sparkles, KeyRound, Copy, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validateSampleFiles } from "@/lib/sampleFiles";
import { alertSuccess, confirmDelete } from "@/lib/alerts";

type Status = {
  configured: boolean;
  manualFacturapiKey: boolean;
  facturapiOrgId: string | null;
  csdUploadedAt: string | null;
  plan: "demo" | "live";
};

export default function ConfiguracionPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/facturapi-key");
      if (!res.ok) {
        setLoadError("No se pudo cargar la configuración");
        return;
      }
      setLoadError(null);
      setStatus(await res.json());
    } catch {
      setLoadError("No se pudo cargar la configuración");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const provision = useCallback(async () => {
    setProvisioning(true);
    setProvisionError(null);
    try {
      const res = await fetch("/api/settings/facturapi-provision", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setProvisionError(data.error ?? "Error al activar la cuenta");
        return;
      }
      await load();
    } finally {
      setProvisioning(false);
    }
  }, [load]);

  useEffect(() => {
    if (status && !status.manualFacturapiKey && !status.facturapiOrgId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      provision();
    }
  }, [status, provision]);

  async function handleUpgrade() {
    setUpgradeError(null);
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setUpgradeError(data.error ?? "No se pudo iniciar el pago");
        return;
      }
      window.location.href = data.url;
    } finally {
      setUpgrading(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    if (!apiKey.trim()) {
      setError("Ingresa una llave de API");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/facturapi-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setApiKey("");
      setSaved(true);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto max-w-lg">
      <PageHeader title="Configuración" description="Integración con FacturAPI" icon={Settings} />

      <div className="mb-4">
        <ApiKeysCard plan={status?.plan ?? null} />
      </div>

      <div className="mb-4">
        <SampleFilesCard />
      </div>

      {loadError && (
        <Card className="border-border shadow-none">
          <CardContent className="p-5 flex flex-col gap-3">
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {loadError}
            </p>
            <div>
              <Button size="sm" variant="outline" onClick={load}>
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status?.manualFacturapiKey && (
        <Card className="border-border shadow-none">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Llave de FacturAPI</p>
              {status.configured && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Configurada
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Se usa para emitir facturas, complementos de pago, y gestionar clientes a través de
              FacturAPI. La llave se guarda cifrada y nunca se muestra de nuevo una vez guardada.
            </p>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status.configured ? "sk_live_… (reemplazar llave existente)" : "sk_live_…"}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            {saved && <p className="text-xs text-emerald-700">Llave guardada correctamente.</p>}
            <div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status && !status.manualFacturapiKey && (
        <div className="flex flex-col gap-4">
          {status.plan === "demo" && (
            <Card className="border-border shadow-none">
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Cuenta demo</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estás usando una cuenta demo: las facturas se generan con una llave de prueba de
                  FacturAPI y no se timbran ante el SAT. Actualiza a una cuenta en vivo para emitir
                  facturas reales.
                </p>
                {upgradeError && <p className="text-xs text-red-600">{upgradeError}</p>}
                <div>
                  <Button size="sm" onClick={handleUpgrade} disabled={upgrading}>
                    {upgrading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Actualizar a cuenta en vivo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border shadow-none">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Cuenta de FacturAPI</p>
                {status.facturapiOrgId && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Activada
                  </span>
                )}
              </div>
              {provisioning && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Activando cuenta…
                </p>
              )}
              {!provisioning && provisionError && (
                <>
                  <p className="text-xs text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {provisionError}
                  </p>
                  <div>
                    <Button size="sm" variant="outline" onClick={provision}>
                      Reintentar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {status.facturapiOrgId && <CsdUploadCard csdUploadedAt={status.csdUploadedAt} onUploaded={load} />}
        </div>
      )}
    </div>
  );
}

type SampleFilesStatus = {
  lastUploadedAt: string | null;
  totalCount: number;
};

function SampleFilesCard() {
  const [status, setStatus] = useState<SampleFilesStatus | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/sample-files");
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleUpload() {
    setError(null);
    const validationError = validateSampleFiles(files);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      const res = await fetch("/api/settings/sample-files", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al subir los archivos");
        return;
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await load();
      alertSuccess("Archivos enviados", "Recibimos tus archivos de muestra correctamente.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">Archivos de muestra</p>
          {status && status.totalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Enviados{" "}
              {status.lastUploadedAt && new Date(status.lastUploadedAt).toLocaleDateString("es-MX")} · {status.totalCount} en total
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Envíanos algunos pedimentos y/o facturas de ejemplo (hasta 10 archivos PDF, 20MB en
          total) para que ajustemos el parser a tus documentos.
        </p>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              Seleccionar archivos
            </Button>
            <span className="text-xs text-foreground truncate">
              {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : "Ningún archivo seleccionado"}
            </span>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <Button size="sm" onClick={handleUpload} disabled={uploading}>
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Enviar archivos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CsdUploadCard({
  csdUploadedAt,
  onUploaded,
}: {
  csdUploadedAt: string | null;
  onUploaded: () => Promise<void>;
}) {
  const [cer, setCer] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    setError(null);
    if (!cer || !key || !password.trim()) {
      setError("Selecciona el .cer, el .key e ingresa la contraseña");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("cer", cer);
      form.set("key", key);
      form.set("password", password);
      const res = await fetch("/api/settings/facturapi-cert", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al subir el CSD");
        return;
      }
      setCer(null);
      setKey(null);
      setPassword("");
      await onUploaded();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">Certificado de Sello Digital (CSD)</p>
          {csdUploadedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Configurado ({new Date(csdUploadedAt).toLocaleDateString("es-MX")})
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Requerido para timbrar facturas. El certificado, la llave y la contraseña se envían
          directamente a FacturAPI y no se guardan en esta aplicación.
        </p>
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground flex flex-col gap-1">
            Archivo .cer
            <input
              ref={cerInputRef}
              type="file"
              accept=".cer"
              className="hidden"
              onChange={(e) => setCer(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => cerInputRef.current?.click()}>
                Seleccionar archivo
              </Button>
              <span className="text-xs text-foreground truncate">
                {cer ? cer.name : "Ningún archivo seleccionado"}
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex flex-col gap-1">
            Archivo .key
            <input
              ref={keyInputRef}
              type="file"
              accept=".key"
              className="hidden"
              onChange={(e) => setKey(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => keyInputRef.current?.click()}>
                Seleccionar archivo
              </Button>
              <span className="text-xs text-foreground truncate">
                {key ? key.name : "Ningún archivo seleccionado"}
              </span>
            </div>
          </div>
          <label className="text-xs text-muted-foreground">
            Contraseña
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <Button size="sm" onClick={handleUpload} disabled={uploading}>
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            {csdUploadedAt ? "Reemplazar CSD" : "Subir CSD"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ApiKey = {
  id: string;
  label: string | null;
  mode: "test" | "live";
  createdAt: string;
  lastUsedAt: string | null;
};

function ApiKeysCard({ plan }: { plan: "demo" | "live" | null }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/api-keys");
    if (res.ok) setKeys((await res.json()).data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al crear la llave");
        return;
      }
      setLabel("");
      setRevealedKey(data.key);
      setCopied(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: ApiKey) {
    const ok = await confirmDelete(
      "¿Revocar esta llave?",
      `${key.label ?? "Llave sin nombre"} dejará de funcionar de inmediato.`,
      "Revocar"
    );
    if (!ok) return;
    const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function handleCopy() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
  }

  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Llaves de API</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Usa una llave de API para integrar tu organización con la{" "}
          <a href="/api-docs" target="_blank" rel="noreferrer" className="underline">
            API pública
          </a>
          .{" "}
          {plan === "demo"
            ? "Tu cuenta es demo: las llaves que crees son de prueba y usan la API de pruebas de FacturAPI (no timbran ante el SAT)."
            : "Tu cuenta es en vivo: las llaves que crees son de producción y timbran facturas reales."}
        </p>

        {revealedKey && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex flex-col gap-2">
            <p className="text-xs text-amber-900">
              Copia esta llave ahora — no se volverá a mostrar.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white border border-amber-200 rounded px-2 py-1 flex-1 truncate">
                {revealedKey}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                {copied ? "Copiada" : "Copiar"}
              </Button>
            </div>
          </div>
        )}

        {keys && keys.length > 0 && (
          <div className="flex flex-col gap-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate">
                      {key.label ?? "Llave sin nombre"}
                    </span>
                    <span
                      className={
                        "text-[10px] px-1.5 py-0.5 rounded-full " +
                        (key.mode === "test" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")
                      }
                    >
                      {key.mode === "test" ? "Prueba" : "Producción"}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Creada {new Date(key.createdAt).toLocaleDateString("es-MX")}
                    {key.lastUsedAt && ` · Usada por última vez ${new Date(key.lastUsedAt).toLocaleDateString("es-MX")}`}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleRevoke(key)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre de la llave (opcional)"
            className="max-w-xs"
          />
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Crear llave
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
