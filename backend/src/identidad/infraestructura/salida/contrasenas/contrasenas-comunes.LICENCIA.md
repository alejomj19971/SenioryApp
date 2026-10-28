# Lista de contraseñas comunes

`contrasenas-comunes.txt` sale de las listas «10k-most-common» y «100k-most-used-passwords-NCSC» del
proyecto [SecLists](https://github.com/danielmiessler/SecLists) (licencia MIT, © 2018 Daniel Miessler).

Se conservan solo las de 10 a 128 caracteres (el largo mínimo que acepta Seniory), en minúsculas y sin
repetidas: la comparación no distingue mayúsculas. Para regenerarla hay que bajar ambas listas y aplicar
ese mismo filtro.
