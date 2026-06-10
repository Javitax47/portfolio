'use strict';
/* =============================================================
   media-manifest.js — Manifiesto declarativo de medios por proyecto
                        (Focus-Drift Mosaic)
   Javier Portfolio
   -------------------------------------------------------------
   Fuente de datos pura: asocia cada `data-proj` con su lista
   ordenada de medios. Indice 0 = pieza enfocada inicial.
   Sin logica de UI. Funciona como global de navegador y como
   modulo CommonJS para pruebas en Node (guarda de export al final).
   ============================================================= */

/**
 * @typedef {'image'|'gif'|'video'} MediaType
 *
 * @typedef {Object} MediaItem
 * @property {MediaType} type        - clase de medio
 * @property {string}    src         - ruta al archivo (no vacia)
 * @property {string}    [poster]    - poster/preview para 'video' (recomendado si type==='video')
 * @property {string}    [captionEs] - texto descriptivo en espanol
 * @property {string}    [captionEn] - texto descriptivo en ingles
 * @property {number}    [w]         - ancho intrinseco (opcional, evita layout shift)
 * @property {number}    [h]         - alto intrinseco (opcional)
 * @property {string}    [focus]     - object-position sugerido p. ej. '50% 40%' (centro de interes)
 *
 * @typedef {Object.<string, MediaItem[]>} MediaManifest  // clave = data-proj
 */

/**
 * Manifiesto de medios por proyecto. Convencion de nombres:
 *   public/ph_{proj}.png                         -> placeholder/overview (indice 0)
 *   public/media/{proj}/{proj}-{NN}.{png|gif}    -> imagenes y gifs
 *   public/media/{proj}/{proj}-{NN}.mp4          -> video
 *   public/media/{proj}/{proj}-{NN}.poster.png   -> poster del video
 * El `type` de cada item coincide con la extension del archivo real.
 * @type {MediaManifest}
 */
const PROJECT_MEDIA = {
  // Deteccion de ondas gravitacionales — 1D-ResNet vs ViT sobre LIGO/Virgo
  gw: [
    { type: 'image', src: 'public/ph_gw.png',
      captionEs: 'Vista general del detector', captionEn: 'Detector overview', focus: '50% 40%' },
    { type: 'image', src: 'public/media/gw/gw-02.png',
      captionEs: 'Comparativa 1D-ResNet vs ViT', captionEn: '1D-ResNet vs ViT comparison' },
    { type: 'gif', src: 'public/media/gw/gw-03.gif',
      captionEs: 'Inferencia en vivo sobre el strain', captionEn: 'Live inference on the strain' },
    { type: 'video', src: 'public/media/gw/gw-04.mp4', poster: 'public/media/gw/gw-04.poster.png',
      captionEs: 'Demo de la interfaz web', captionEn: 'Web UI demo' }
  ],

  // NLTL — Gravedad analoga: ~20 fenomenos GR en una PCB modular
  nltl: [
    { type: 'image', src: 'public/ph_nltl.png',
      captionEs: 'Vista general de la PCB', captionEn: 'PCB overview', focus: '50% 40%' },
    { type: 'image', src: 'public/media/nltl/nltl-02.png',
      captionEs: 'Disposicion de la linea no lineal', captionEn: 'Nonlinear line layout' },
    { type: 'image', src: 'public/media/nltl/nltl-03.png',
      captionEs: 'Medidas en el osciloscopio', captionEn: 'Oscilloscope measurements' },
    { type: 'gif', src: 'public/media/nltl/nltl-04.gif',
      captionEs: 'Propagacion de solitones', captionEn: 'Soliton propagation' }
  ],

  // Cosmos — Universo jugable a escala real (Unity HDRP)
  cosmos: [
    { type: 'image', src: 'public/ph_cosmos.png',
      captionEs: 'Vista general del universo', captionEn: 'Universe overview', focus: '50% 40%' },
    { type: 'image', src: 'public/media/cosmos/cosmos-02.png',
      captionEs: 'Renderizado HDRP de planetas', captionEn: 'HDRP planet rendering' },
    { type: 'image', src: 'public/media/cosmos/cosmos-03.png',
      captionEs: 'Sistema a escala real', captionEn: 'Real-scale system' },
    { type: 'video', src: 'public/media/cosmos/cosmos-04.mp4', poster: 'public/media/cosmos/cosmos-04.poster.png',
      captionEs: 'Demo de exploracion', captionEn: 'Exploration demo' }
  ],

  // Physdeck — Laboratorio de simulacion de escritorio
  physdeck: [
    { type: 'image', src: 'public/ph_physdeck.png',
      captionEs: 'Vista general del laboratorio', captionEn: 'Laboratory overview', focus: '50% 40%' },
    { type: 'image', src: 'public/media/physdeck/physdeck-02.png',
      captionEs: 'Panel de simulacion', captionEn: 'Simulation panel' },
    { type: 'image', src: 'public/media/physdeck/physdeck-03.png',
      captionEs: 'Parametros fisicos en vivo', captionEn: 'Live physics parameters' },
    { type: 'gif', src: 'public/media/physdeck/physdeck-04.gif',
      captionEs: 'Simulacion en ejecucion', captionEn: 'Simulation running' }
  ],

  // Mineralia — Catalogo de minerales offline-first (PWA)
  mineralia: [
    { type: 'image', src: 'public/ph_mineralia.png',
      captionEs: 'Vista general del catalogo', captionEn: 'Catalogue overview', focus: '50% 40%' },
    { type: 'image', src: 'public/media/mineralia/mineralia-02.png',
      captionEs: 'Ficha de mineral', captionEn: 'Mineral detail card' },
    { type: 'image', src: 'public/media/mineralia/mineralia-03.png',
      captionEs: 'Busqueda offline', captionEn: 'Offline search' },
    { type: 'gif', src: 'public/media/mineralia/mineralia-04.gif',
      captionEs: 'Navegacion de la PWA', captionEn: 'PWA navigation' }
  ],

  // Mario OST Rank — Ranking de bandas sonoras por swipe
  mario: [
    { type: 'image', src: 'public/ph_mario.png',
      captionEs: 'Vista general de la baraja', captionEn: 'Deck overview', focus: '50% 40%' },
    { type: 'image', src: 'public/media/mario/mario-02.png',
      captionEs: 'Swipe estilo citas', captionEn: 'Dating-style swipe' },
    { type: 'image', src: 'public/media/mario/mario-03.png',
      captionEs: 'Brackets eliminatorios', captionEn: 'Elimination brackets' },
    { type: 'gif', src: 'public/media/mario/mario-04.gif',
      captionEs: 'Ranking exportable como imagen', captionEn: 'Ranking exportable as an image' }
  ]
};

/**
 * Devuelve la lista ordenada de medios de un proyecto, o [] si no existe.
 * @param {string} proj - identificador de proyecto (data-proj)
 * @returns {MediaItem[]}
 */
function getManifest(proj) {
  return (Object.prototype.hasOwnProperty.call(PROJECT_MEDIA, proj) && PROJECT_MEDIA[proj]) || [];
}

/* ═══ EXPORT GUARD ═══
   En Node (pruebas) exporta como modulo CommonJS; en navegador no hace nada
   y `PROJECT_MEDIA`/`getManifest` quedan disponibles como globales del script. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROJECT_MEDIA, getManifest };
}
