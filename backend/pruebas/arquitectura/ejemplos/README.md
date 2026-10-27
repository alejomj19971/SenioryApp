# Ejemplos que rompen las reglas de arquitectura

Código **a propósito incorrecto**: cada archivo marcado `ROMPE` viola una regla de
`.dependency-cruiser.cjs` y `../reglas.spec.ts` comprueba que la regla lo detecta. Si una regla
deja de detectar su ejemplo, la prueba falla (la regla se rompió sin que nadie lo notara).

No se compila con la aplicación ni se importa desde `src/`.
