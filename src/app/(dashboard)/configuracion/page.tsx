"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Status = {
  configured: boolean;
  manualFacturapiKey: boolean;
  facturapiOrgId: string | null;
  csdUploadedAt: string | null;
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
