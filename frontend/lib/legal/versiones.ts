// Versión de cada texto legal que la interfaz muestra y la persona acepta. El backend exige que coincida con
// la vigente (`VERSION_POLITICA_VIGENTE` y `VERSION_CONSENTIMIENTO_SALUD_VIGENTE`): si no, responde 400 y la
// persona no puede registrarse ni autorizar. Cuando Legal apruebe un texto nuevo, se cambia aquí y allá.
export const VERSION_DE_LA_POLITICA = "v1";
export const VERSION_DEL_CONSENTIMIENTO_DE_SALUD = "v1";
