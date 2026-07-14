"use client";

import Swal from "sweetalert2";

// Same SweetAlert2 library the old app used via CDN (frontend/index.html),
// now as a proper npm dependency instead. Colors match this app's rebranded
// orange primary (see globals.css --primary) instead of the old app's gold,
// everything else — icons, animation, layout — is the same library/feel.
const CONFIRM_COLOR = "#ea580c"; // orange-600, matches the app's primary
const DESTRUCTIVE_COLOR = "#ef4444"; // red-500
const CANCEL_COLOR = "#6b7280"; // gray-500

function toHtml(text: string): string {
  return text.replace(/\n/g, "<br>");
}

export function alertSuccess(title: string, text?: string) {
  return Swal.fire({
    icon: "success",
    title,
    html: text ? toHtml(text) : undefined,
    confirmButtonColor: CONFIRM_COLOR,
  });
}

export function alertError(title: string, text?: string) {
  return Swal.fire({
    icon: "error",
    title,
    html: text ? toHtml(text) : undefined,
    confirmButtonColor: CONFIRM_COLOR,
  });
}

export function alertWarning(title: string, text?: string) {
  return Swal.fire({
    icon: "warning",
    title,
    html: text ? toHtml(text) : undefined,
    confirmButtonColor: CONFIRM_COLOR,
  });
}

export function alertInfo(title: string, text?: string) {
  return Swal.fire({
    icon: "info",
    title,
    html: text ? toHtml(text) : undefined,
    confirmButtonColor: CONFIRM_COLOR,
  });
}

// Returns true if the user confirmed. Matches the old app's delete-confirm
// pattern (frontend/index.html:2061-2066 etc.) — warning icon, red confirm
// button, gray cancel button.
export async function confirmDelete(
  title: string,
  text?: string,
  confirmButtonText = "Eliminar"
): Promise<boolean> {
  const { isConfirmed } = await Swal.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "Cancelar",
    confirmButtonColor: DESTRUCTIVE_COLOR,
    cancelButtonColor: CANCEL_COLOR,
  });
  return isConfirmed;
}

// Prompts for a positive decimal number (e.g. a tipo de cambio). Returns null
// if the user cancels or leaves it blank/invalid.
export async function promptNumber(
  title: string,
  text?: string,
  inputValue?: string
): Promise<number | null> {
  const { value, isConfirmed } = await Swal.fire({
    icon: "question",
    title,
    text,
    input: "number",
    inputValue,
    inputAttributes: { step: "0.00001", min: "0.00001" },
    showCancelButton: true,
    confirmButtonText: "Aplicar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: CONFIRM_COLOR,
    cancelButtonColor: CANCEL_COLOR,
    inputValidator: (value) => {
      const n = Number(value);
      if (!value || !n || n <= 0) return "Ingresa un valor válido";
      return undefined;
    },
  });
  if (!isConfirmed) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}
