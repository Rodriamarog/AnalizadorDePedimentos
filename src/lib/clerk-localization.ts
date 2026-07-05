import { esMX } from "@clerk/localizations";

// @clerk/localizations' es-MX pack has two gaps we hit directly: the sign-up
// password placeholder is untranslated (falls back to English "Create a
// password"), and the sign-up footer link has a typo ("Inicar" instead of
// "Iniciar"). Patched locally rather than waiting on an upstream fix.
export const esMXPatched = {
  ...esMX,
  formFieldInputPlaceholder__signUpPassword: "Crea una contraseña",
  signUp: {
    ...esMX.signUp,
    start: {
      ...esMX.signUp?.start,
      actionLink: "Iniciar sesión",
    },
  },
};
