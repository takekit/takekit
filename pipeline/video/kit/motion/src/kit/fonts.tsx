import {loadFont} from '@remotion/fonts';
import {continueRender, delayRender} from 'remotion';
import {staticFile} from 'remotion';
import React, {useEffect, useState} from 'react';
import {FONT} from './tokens';

type FontSpec = {
  family: string;
  url: string;
  weight: string;
  style?: 'normal' | 'italic';
};

/**
 * As duas fontes do projeto, do public/, seguradas até estarem prontas.
 * Sem o gate o render headless fotografa o fallback do sistema no meio da
 * composição — e tipo Hetrixo/Alvito é requisito, não preferência.
 */
export const FONTS: FontSpec[] = [
  {
    family: FONT.sans,
    url: staticFile('fonts/hetrixotypeface-extrabold.otf'),
    weight: '800',
  },
  {
    // O brief nomeia `...-bold.otf`, mas esse arquivo é UPRIGHT (italicAngle 0)
    // e o papel pedido é "cursiva". O corte bolditalic é a MESMA família e a
    // mesma demo, e é o que entrega a cursiva de verdade. Trocar aqui é uma linha.
    family: FONT.cursive,
    url: staticFile('fonts/fontspring-demo-alvitonovacomp-bolditalic.otf'),
    weight: '700',
    style: 'italic',
  },
];

export const loadProjectFonts = () =>
  Promise.all(
    FONTS.map((f) =>
      loadFont({family: f.family, url: f.url, weight: f.weight, style: f.style, display: 'block'}),
    ),
  );

export const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [handle] = useState(() => delayRender('carregando Hetrixo + Alvito'));
  useEffect(() => {
    loadProjectFonts()
      .then(() => continueRender(handle))
      .catch((err) => {
        console.error('falha ao carregar as fontes', err);
        continueRender(handle);
      });
  }, [handle]);
  return <>{children}</>;
};

/** Pilhas de fallback: se uma delas aparecer no render, é bug, não escolha. */
export const sans = `${FONT.sans}, "Helvetica Neue", Arial, sans-serif`;
export const cursive = `${FONT.cursive}, Georgia, serif`;
