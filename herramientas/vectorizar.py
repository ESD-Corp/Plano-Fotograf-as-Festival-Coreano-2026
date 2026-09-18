#!/usr/bin/env python3
"""
Vectoriza el plano de referencia a SVG.

Procedimiento:
  1. decodifica el PNG                        (png.py, Python puro)
  2. clasifica cada píxel en una capa de color por reglas sobre RGB
  3. limpia el grano con un filtro de mayoría
  4. extrae los contornos de cada capa siguiendo las aristas entre
     píxeles (crack following): da polígonos exactos sobre la rejilla
  5. simplifica con Douglas-Peucker
  6. escribe un SVG con una capa por color, fill-rule evenodd para
     que los huecos se resuelvan solos

Uso:  python3 herramientas/vectorizar.py entrada.png salida.svg [epsilon] [ss]

  ss = factor de supersampling de la entrada (1 o 2). Con 2, la imagen
  se vectoriza al doble de resolución y las coordenadas se dividen al
  escribir: el escalón de la rejilla queda en medio píxel del sistema
  final y los grosores salen más fieles.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png

# --- CAPAS -----------------------------------------------------------
# orden de dibujo: de abajo hacia arriba
# nombre, epsilon de simplificación, área mínima, pasadas de suavizado
# nombre, epsilon, área mínima, suavizado, tramo de esquina, área desde
# la que se suaviza (por debajo es letra o detalle: se deja tal cual)
# Las superficies toleran bastante simplificación; los trazos no: con
# eps alto las líneas finas se hinchan y se funden entre sí.
# ESTILO: planta técnica sobre negro. Las superficies se apagan casi
# hasta el fondo y el dibujo lo sostienen las líneas blancas; el césped
# es lo único con color, con una trama de grama fina.
# Opacidad del dibujo completo sobre el fondo
OPACIDAD = '0.7'

ESTILO = {
    'mar':      '#0a1622',
    'verde':    'url(#grama)',
    'oscuro':   '#0c0c0d',
    'oscuro2':  '#111113',
    'medio':    '#16161a',
    'claro1':   '#1c1d21',
    'claro2':   '#24252a',
    'blanco':   '#ffffff',
}

# Zonas de rotulación, en píxeles [x1, y1, x2, y2]. Un contorno cuyo
# centro cae aquí nunca se descarta: si no, el filtro por longitud se
# lleva por delante la tilde de ANTÓN, la I de CARIBE y el punto de P.º
ROTULOS = [
    [20, 15, 540, 155],       # título y subtítulo
    [280, 120, 660, 290],     # P.º PDTE. BILLINI
    [50, 1050, 260, 1100],    # MAR CARIBE
    [1060, 1140, 1130, 1240], # norte
]

# nombre, epsilon, área mínima, suavizado, tramo de esquina,
# área desde la que se suaviza, fracción de contornos que se conserva
CAPAS = [
    ('mar',     1.9, 300, 3, 2.4, 1500, 1.00),
    ('verde',   1.7, 240, 3, 2.2,  900, 1.00),
    ('oscuro',  1.4, 180, 2, 1.8,  700, 1.00),   # aquí viven las copas
    ('oscuro2', 1.5, 180, 2, 1.8,  700, 1.00),
    ('medio',   1.7, 210, 3, 2.2,  900, 1.00),
    ('claro1',  1.7, 210, 3, 2.2,  900, 1.00),
    ('claro2',  1.7, 210, 3, 2.2,  900, 1.00),
    ('blanco',  0.5,  11, 2, 1.3, 1800, 0.25),   # solo los trazos que dibujan
]
IND = {n: i + 1 for i, (n, *_) in enumerate(CAPAS)}   # 0 = fondo


def luminancias(w, h, px):
    L = bytearray(w * h)
    for i in range(w * h):
        j = i * 3
        L[i] = (299 * px[j] + 587 * px[j + 1] + 114 * px[j + 2]) // 1000
    return L


def minimo_local(w, h, L, radio=2):
    """Mínimo en una ventana cuadrada, calculado en dos pasadas."""
    tmp = bytearray(w * h)
    for y in range(h):
        f = y * w
        for x in range(w):
            a = max(0, x - radio); b = min(w, x + radio + 1)
            tmp[f + x] = min(L[f + a:f + b])
    out = bytearray(w * h)
    for x in range(w):
        col = [tmp[y * w + x] for y in range(h)]
        for y in range(h):
            a = max(0, y - radio); b = min(h, y + radio + 1)
            out[y * w + x] = min(col[a:b])
    return out


def clasificar(w, h, px, L, Lmin):
    """Índice de capa de cada píxel.

    Las líneas del dibujo son finas y su antialiasing deja el núcleo
    claro discontinuo, así que no bastan los umbrales absolutos: un
    píxel cuenta como trazo blanco si destaca sobre su entorno."""
    cls = bytearray(w * h)
    mar, verde = IND['mar'], IND['verde']
    osc, osc2, med = IND['oscuro'], IND['oscuro2'], IND['medio']
    c1, c2, bl = IND['claro1'], IND['claro2'], IND['blanco']

    for i in range(w * h):
        l = L[i]
        if l < 12:
            continue                      # fondo
        if l >= 160 or (l >= 112 and l - Lmin[i] >= 70):
            cls[i] = bl
            continue
        j = i * 3
        r, g, b = px[j], px[j + 1], px[j + 2]
        if b - r >= 12 and 19 <= l < 95:
            cls[i] = mar
        elif g - r >= 4 and g - b >= 2 and l < 115:
            cls[i] = verde
        elif l >= 128:
            cls[i] = c2
        elif l >= 88:
            cls[i] = c1
        elif l >= 58:
            cls[i] = med
        elif l >= 34:
            cls[i] = osc2
        else:
            cls[i] = osc
    return cls


def mayoria(w, h, cls, pasadas=2, radio=2, protegidos=()):
    """Moda en una ventana cuadrada, para aplanar el grano de las
    superficies. Las clases protegidas no se tocan ni arrastran: las
    líneas del dibujo tienen uno o dos píxeles de ancho."""
    prot = set(protegidos)
    for _ in range(pasadas):
        nueva = bytearray(cls)
        for y in range(radio, h - radio):
            fila = y * w
            for x in range(radio, w - radio):
                i = fila + x
                actual = cls[i]
                if actual in prot:
                    continue
                cuenta = {}
                for dy in range(-radio, radio + 1):
                    base = i + dy * w
                    for dx in range(-radio, radio + 1):
                        v = cls[base + dx]
                        if v in prot:
                            continue
                        cuenta[v] = cuenta.get(v, 0) + 1
                if not cuenta:
                    continue
                # la clase dominante gana: aplana el grano de la textura
                v, n = max(cuenta.items(), key=lambda t: (t[1], t[0] == actual))
                if v != actual:
                    nueva[i] = v
        cls = nueva
    return cls


def contornos(w, h, cls, valor):
    """Bucles cerrados del borde de la región `valor`, en píxeles."""
    sig = {}
    W1 = w + 1

    for y in range(h):
        fila = y * w
        for x in range(w):
            if cls[fila + x] != valor:
                continue
            v0 = y * W1 + x
            if y == 0 or cls[fila - w + x] != valor:          # arriba
                sig.setdefault(v0, []).append(v0 + 1)
            if x == w - 1 or cls[fila + x + 1] != valor:      # derecha
                sig.setdefault(v0 + 1, []).append(v0 + 1 + W1)
            if y == h - 1 or cls[fila + w + x] != valor:      # abajo
                sig.setdefault(v0 + 1 + W1, []).append(v0 + W1)
            if x == 0 or cls[fila + x - 1] != valor:          # izquierda
                sig.setdefault(v0 + W1, []).append(v0)

    bucles = []
    for inicio in list(sig.keys()):
        while sig.get(inicio):
            camino = [inicio]
            actual = sig[inicio].pop()
            while actual != inicio:
                camino.append(actual)
                lista = sig.get(actual)
                if not lista:
                    camino = None
                    break
                actual = lista.pop()
            if camino:
                bucles.append([(v % W1, v // W1) for v in camino])
    return bucles


def esquinas(pts, umbral_grados=52, tramo_min=2.2):
    """Marca los vértices donde el contorno gira de verdad.

    Un contorno sacado de una rejilla de píxeles está lleno de giros de
    90° que son escalones, no esquinas del dibujo. Se distinguen por la
    longitud de los tramos que llegan y salen: un giro real une dos
    tramos largos."""
    n = len(pts)
    cos_lim = math.cos(math.radians(180 - umbral_grados))
    marca = [False] * n
    for i in range(n):
        ax, ay = pts[(i - 1) % n]
        bx, by = pts[i]
        cx, cy = pts[(i + 1) % n]
        u = (bx - ax, by - ay)
        v = (cx - bx, cy - by)
        lu = math.hypot(*u); lv = math.hypot(*v)
        if lu < tramo_min or lv < tramo_min:
            continue                       # tramos cortos: es un escalón
        cosang = (u[0] * v[0] + u[1] * v[1]) / (lu * lv)
        if cosang < cos_lim:
            marca[i] = True
    return marca


def suavizar(pts, vueltas, fijos=None):
    """Promedio móvil que deja quietos los vértices marcados.

    Quita la escalera de la rejilla sin redondear las esquinas reales
    del dibujo ni encoger la forma."""
    n = len(pts)
    if n < 5:
        return pts
    fijos = fijos or [False] * n
    for _ in range(vueltas):
        nuevo = []
        for i in range(n):
            if fijos[i]:
                nuevo.append(pts[i])
                continue
            ax, ay = pts[(i - 1) % n]
            bx, by = pts[i]
            cx, cy = pts[(i + 1) % n]
            nuevo.append(((ax + 2 * bx + cx) / 4, (ay + 2 * by + cy) / 4))
        pts = nuevo
    return pts


def a_curvas(pts, marca, dec=1):
    """Emite el contorno como Bézier cúbicas (Catmull-Rom).

    Entre dos esquinas consecutivas sale una recta; en los tramos
    libres, una curva continua. Así los bordes rectos quedan rectos y
    los orgánicos quedan limpios.

    Se escribe con comandos relativos y `dec` decimales, que es donde
    está casi todo el peso del archivo. El redondeo se hace contra la
    posición ya escrita, no contra la ideal, para que el error no se
    acumule a lo largo del contorno."""
    n = len(pts)
    P = lambda i: pts[i % n]
    q = 10 ** dec
    fmt = ('%.' + str(dec) + 'f')

    # posición real del cursor tras redondear, para no derivar
    cur = [round(P(0)[0] * q) / q, round(P(0)[1] * q) / q]
    d = 'M' + fmt % cur[0] + ' ' + fmt % cur[1]

    def rel(destino):
        dx = round((destino[0] - cur[0]) * q) / q
        dy = round((destino[1] - cur[1]) * q) / q
        cur[0] += dx; cur[1] += dy
        return dx, dy

    def num(v):
        t = fmt % v
        if t.endswith('.0'):
            t = t[:-2]
        return t

    for i in range(n):
        p1, p2 = P(i), P(i + 1)
        if marca[i % n] and marca[(i + 1) % n]:
            dx, dy = rel(p2)
            if dx == 0 and dy == 0:
                continue
            d += 'l' + num(dx) + ' ' + num(dy)
            continue
        p0, p3 = P(i - 1), P(i + 2)
        t0 = 0 if marca[i % n] else 1
        t1 = 0 if marca[(i + 1) % n] else 1
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * t0, p1[1] + (p2[1] - p0[1]) / 6 * t0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * t1, p2[1] - (p3[1] - p1[1]) / 6 * t1)
        base = (cur[0], cur[1])
        a1 = (round((c1[0] - base[0]) * q) / q, round((c1[1] - base[1]) * q) / q)
        a2 = (round((c2[0] - base[0]) * q) / q, round((c2[1] - base[1]) * q) / q)
        dx, dy = rel(p2)
        d += ('c' + num(a1[0]) + ' ' + num(a1[1]) + ' '
                  + num(a2[0]) + ' ' + num(a2[1]) + ' '
                  + num(dx) + ' ' + num(dy))
    return d + 'z'


def simplificar(pts, eps):
    """Douglas-Peucker iterativo."""
    n = len(pts)
    if n < 4:
        return pts
    guardar = [False] * n
    guardar[0] = guardar[n - 1] = True
    pila = [(0, n - 1)]
    while pila:
        a, b = pila.pop()
        if b <= a + 1:
            continue
        x1, y1 = pts[a]; x2, y2 = pts[b]
        dx, dy = x2 - x1, y2 - y1
        norma = (dx * dx + dy * dy) ** .5
        peor, idx = 0.0, -1
        for k in range(a + 1, b):
            x, y = pts[k]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norma if norma else \
                ((x - x1) ** 2 + (y - y1) ** 2) ** .5
            if d > peor:
                peor, idx = d, k
        if peor > eps:
            guardar[idx] = True
            pila.append((a, idx)); pila.append((idx, b))
    return [p for p, s in zip(pts, guardar) if s]


def perimetro(b):
    t = 0.0
    for i in range(len(b)):
        x1, y1 = b[i]; x2, y2 = b[(i + 1) % len(b)]
        t += ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** .5
    return t


def a_path(bucles, eps, area_min, suavizado=0, tramo=2.2, ss=1, area_suave=0,
           mantener=1.0):
    # Con `mantener` < 1 se conservan solo los trazos más largos: un
    # contorno fino y largo tiene poca área pero mucho perímetro, así que
    # el corte va por longitud, no por superficie. Deja los trazos que
    # dibujan y descarta los fragmentos sueltos.
    if mantener < 1.0 and bucles:
        def rotulado(b):
            cx = sum(p[0] for p in b) / len(b) / ss
            cy = sum(p[1] for p in b) / len(b) / ss
            return any(x1 <= cx <= x2 and y1 <= cy <= y2
                       for x1, y1, x2, y2 in ROTULOS)
        texto = [b for b in bucles if rotulado(b)]
        resto = sorted((b for b in bucles if not rotulado(b)),
                       key=perimetro, reverse=True)
        bucles = texto + resto[:max(1, int(len(resto) * mantener))]

    partes = []
    for b in bucles:
        # área por la fórmula del cordón; descarta motas
        a = 0
        for i in range(len(b)):
            x1, y1 = b[i]; x2, y2 = b[(i + 1) % len(b)]
            a += x1 * y2 - x2 * y1
        if abs(a) / 2 < area_min:
            continue

        # Un contorno pequeño es una letra, una mota o un detalle fino:
        # suavizarlo lo deforma. Solo se regularizan los grandes, que
        # son donde la escalera de la rejilla se nota.
        area = abs(a) / 2
        suave = suavizado if area >= area_suave * ss * ss else 0
        e = eps if suave else eps * .62

        # 1. quita vértices redundantes de la rejilla
        p = simplificar(b + [b[0]], e)[:-1]
        if len(p) < 3:
            continue
        # 2. suaviza los escalones dejando quietas las esquinas reales
        if suave:
            m = esquinas(p, tramo_min=tramo)
            p = suavizar(p, suave, m)
            p = simplificar(p + [p[0]], e * .55)[:-1]
            if len(p) < 3:
                continue
        # 3. emite rectas entre esquinas y curvas en lo demás
        if ss != 1:
            p = [(x / ss, y / ss) for x, y in p]
        partes.append(a_curvas(p, esquinas(p, tramo_min=tramo / ss)))
    return ''.join(partes)


def main():
    entrada = sys.argv[1]
    salida = sys.argv[2]
    eps = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0   # factor global
    ss = int(sys.argv[4]) if len(sys.argv) > 4 else 1        # supersampling

    w, h, px = png.leer(entrada)
    sys.stderr.write('decodificado %dx%d\n' % (w, h))

    L = luminancias(w, h, px)
    Lmin = minimo_local(w, h, L, 2 * ss)
    sys.stderr.write('contraste local\n')
    cls = clasificar(w, h, px, L, Lmin)
    sys.stderr.write('clasificado\n')
    cls = mayoria(w, h, cls, pasadas=3, radio=2 * ss, protegidos=(IND['blanco'],))
    sys.stderr.write('limpiado\n')

    piezas = []
    for nombre, cap_eps, amin, suav, tramo, asuave, mant in CAPAS:
        color = ESTILO[nombre]
        b = contornos(w, h, cls, IND[nombre])
        # los umbrales que se miden en píxeles se escalan con la entrada
        d = a_path(b, cap_eps * eps * ss, amin * ss * ss, suav,
                   tramo * ss, ss, asuave, mant)
        sys.stderr.write('  %-8s %5d bucles  %8d car.\n' % (nombre, len(b), len(d)))
        if d:
            piezas.append('<path id="%s" fill="%s" d="%s"/>' % (nombre, color, d))

    W, H = w // ss, h // ss

    defs = (
        '<defs>'
        # trama de grama: trazos finos, cortos, en tres inclinaciones
        '<pattern id="grama" width="7" height="7" patternUnits="userSpaceOnUse">'
        '<rect width="7" height="7" fill="#091510"/>'
        '<g stroke="#4a9c5e" stroke-width=".5" stroke-linecap="round" fill="none">'
        '<path d="M1 6.2 1.5 3.4M1.5 3.4 1.1 4.6"/>'
        '<path d="M3.4 6.6 3.2 3.9M3.2 3.9 3.7 5"/>'
        '<path d="M5.6 6.1 5.1 3.2M5.1 3.2 5.5 4.3"/>'
        '<path d="M2.3 2.9 2.7 .4"/>'
        '<path d="M4.6 2.6 4.2 .2"/>'
        '</g>'
        '<g stroke="#31703f" stroke-width=".45" stroke-linecap="round" fill="none">'
        '<path d="M.4 3.1.8 1"/><path d="M6.4 3.4 6 1.2"/>'
        '</g>'
        '</pattern>'
        # grano de fondo, como el papel de un plano impreso
        '<filter id="grano" x="0" y="0" width="100%" height="100%">'
        '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7"/>'
        '<feColorMatrix type="saturate" values="0"/>'
        '<feComponentTransfer><feFuncA type="linear" slope=".07"/></feComponentTransfer>'
        '</filter>'
        '</defs>')

    fondo = ('<rect width="%d" height="%d" fill="#050506"/>'
             '<rect width="%d" height="%d" filter="url(#grano)" opacity=".9"/>'
             % (W, H, W, H))

    # Leyenda de materiales y pie, al modo de una lámina técnica.
    # Dice qué es cada tono del plano, que es información que ya
    # tenemos; no se inventan cotas ni cortes que el dibujo no lleva.
    tipo = ('font-family="Helvetica Neue,Helvetica,Arial,sans-serif" '
            'fill="#ffffff" fill-opacity=".72"')
    leyenda = [
        ('url(#grama)', 'AREAS VERDES'),
        ('#24252a',     'PAVIMENTO'),
        ('#16161a',     'EXPLANADA'),
        ('#0c0c0d',     'ARBOLADO'),
        ('#0a1622',     'MAR CARIBE'),
    ]
    lx, ly = W - 214, 46
    filas = ''
    for i, (relleno, etiqueta) in enumerate(leyenda):
        y = ly + i * 19
        filas += ('<rect x="%d" y="%d" width="13" height="13" fill="%s" '
                  'stroke="#ffffff" stroke-opacity=".45" stroke-width=".7"/>'
                  '<text x="%d" y="%d" font-size="8.2" letter-spacing="1.7" %s>%s</text>'
                  % (lx, y, relleno, lx + 22, y + 10, tipo, etiqueta))

    pie = ('<text x="%d" y="%d" font-size="19" letter-spacing="4.4" '
           'fill="#ffffff" fill-opacity=".9" text-anchor="end" '
           'font-family="Helvetica Neue,Helvetica,Arial,sans-serif">'
           'PLANTA DE CONJUNTO</text>'
           '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#ffffff" '
           'stroke-opacity=".3" stroke-width=".8"/>'
           % (W - 40, H - 48, 40, H - 76, W - 40, H - 76))

    # Todo el dibujo va atenuado sobre el fondo, que se queda opaco para
    # que el negro siga siendo negro.
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
           'width="%d" height="%d" fill-rule="evenodd" '
           'shape-rendering="geometricPrecision">%s%s'
           '<g opacity="%s">%s%s%s</g></svg>'
           % (W, H, W, H, defs, fondo, OPACIDAD,
              ''.join(piezas), filas, pie))
    open(salida, 'w').write(svg)
    sys.stderr.write('escrito %s (%d KB)\n' % (salida, len(svg) // 1024))


if __name__ == '__main__':
    main()
