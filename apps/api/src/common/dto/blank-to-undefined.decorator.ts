import { Transform } from 'class-transformer';

/**
 * Convierte la cadena vacía en `undefined` antes de validar.
 *
 * Por qué hace falta: `@IsOptional()` salta la validación cuando el valor es
 * `undefined` o `null`, **pero no cuando es una cadena vacía**. Un formulario
 * web normal inicializa sus campos a `''` y los envía así aunque el usuario no
 * los toque, de modo que un campo opcional con `@IsEmail()` recibía `''` y
 * rechazaba la petición entera.
 *
 * El efecto era que **no se podía crear un cliente sin correo** desde la
 * interfaz, aunque el correo no fuese obligatorio: la API respondía
 * `400 ["email must be an email"]` y el formulario se quedaba abierto.
 * Reproducido en navegador y contra la API.
 *
 * Sólo debe usarse en campos donde `''` no significa nada por sí mismo (correo,
 * fecha, URL). NO ponerlo en campos de texto libre donde vaciar el contenido es
 * una acción legítima —una dirección, unas notas—, porque ahí `''` sí significa
 * «bórralo» y convertirlo en `undefined` haría imposible limpiarlo.
 */
export function BlankToUndefined() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );
}
