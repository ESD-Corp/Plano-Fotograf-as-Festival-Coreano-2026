# Fotografías del lugar

Coloca aquí las imágenes del levantamiento fotográfico.

## Nombres

`v04-a.jpg` · `v04-b.jpg` · `v04-c.jpg`

donde `v04` es el punto del plano (V01 a V12) y la letra distingue tomas del mismo punto.

## Formato

- JPG, lado largo de 2000 px o más
- de 1 a 4 fotos por punto
- si el teléfono guarda la ubicación GPS, déjala activada: sirve para ubicar la toma

## Después de copiarlas

Abre `datos/plano.js`, busca el punto y escribe las rutas:

```js
{ id: "V04", …, fotos: ["fotos/v04-a.jpg", "fotos/v04-b.jpg"] },
```

## referencias/

Capturas de Google Maps usadas como base georreferenciada del plano. No borrar: el lienzo las
carga al abrir.
