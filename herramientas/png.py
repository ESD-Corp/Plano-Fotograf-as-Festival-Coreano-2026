"""Decodificador PNG mínimo (RGB/RGBA, 8 bits) sin dependencias externas."""
import struct, zlib


def leer(ruta):
    """Devuelve (ancho, alto, pixeles) donde pixeles es un bytearray RGB."""
    d = open(ruta, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', 'no es PNG'

    pos, idat, w = 8, bytearray(), None
    while pos < len(d):
        largo = struct.unpack('>I', d[pos:pos + 4])[0]
        tipo = d[pos + 4:pos + 8]
        cuerpo = d[pos + 8:pos + 8 + largo]
        if tipo == b'IHDR':
            w, h, prof, color = struct.unpack('>IIBB', cuerpo[:10])
            assert prof == 8 and color in (2, 6), 'solo RGB/RGBA de 8 bits'
            canales = 3 if color == 2 else 4
        elif tipo == b'IDAT':
            idat += cuerpo
        elif tipo == b'IEND':
            break
        pos += 12 + largo

    crudo = zlib.decompress(bytes(idat))
    paso = w * canales
    salida = bytearray(w * h * 3)
    anterior = bytearray(paso)
    p = 0

    for y in range(h):
        filtro = crudo[p]; p += 1
        linea = bytearray(crudo[p:p + paso]); p += paso

        if filtro == 1:
            for i in range(canales, paso):
                linea[i] = (linea[i] + linea[i - canales]) & 255
        elif filtro == 2:
            for i in range(paso):
                linea[i] = (linea[i] + anterior[i]) & 255
        elif filtro == 3:
            for i in range(paso):
                izq = linea[i - canales] if i >= canales else 0
                linea[i] = (linea[i] + ((izq + anterior[i]) >> 1)) & 255
        elif filtro == 4:
            for i in range(paso):
                a = linea[i - canales] if i >= canales else 0
                b = anterior[i]
                c = anterior[i - canales] if i >= canales else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                linea[i] = (linea[i] + pr) & 255

        anterior = linea
        if canales == 3:
            salida[y * w * 3:(y + 1) * w * 3] = linea
        else:
            o = y * w * 3
            for x in range(w):
                salida[o + x * 3:o + x * 3 + 3] = linea[x * 4:x * 4 + 3]

    return w, h, salida
