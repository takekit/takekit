import React from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {staticFile} from 'remotion';
import {clamp, curve} from './curve';
import {cursive, sans} from './fonts';
import {ALPHA, CHIP, COL, PALETTE, RADIUS, TYPE} from './tokens';

/* --------------------------------------------------------------- superfície */

export type PlateTone = 'sheet' | 'block' | 'outline';

/**
 * Duas superfícies, e só duas.
 *
 * `sheet`  — folha clara com hairline e sombra curta. Cobre o corpo de um card.
 * `block`  — placa ink com lift. Exatamente UMA por beat, e é sempre o vencedor.
 * `outline`— sem preenchimento, só a hairline. É o default da linha de decisão:
 *            no creme, uma placa clara (branca ou creme) não tem aresta nenhuma
 *            (1,15:1), então o que desenha a linha é a borda e o conteúdo.
 */
export const Plate: React.FC<{
  children?: ReactNode;
  style?: CSSProperties;
  tone?: PlateTone;
  radius?: number;
  shadow?: 'soft' | 'lift' | 'none';
}> = ({children, style, tone = 'outline', radius = RADIUS.chip, shadow}) => {
  const base: CSSProperties = {
    borderRadius: radius,
    overflow: 'hidden',
    position: 'relative',
    ...style,
  };
  if (tone === 'block') {
    return (
      <div
        style={{
          ...base,
          background: PALETTE.ink,
          boxShadow: shadow === 'none' ? 'none' : ALPHA.plateLift,
        }}
      >
        {children}
      </div>
    );
  }
  if (tone === 'sheet') {
    return (
      <div
        style={{
          ...base,
          background: PALETTE.white,
          border: `1px solid ${ALPHA.hairline}`,
          boxShadow: shadow === 'none' ? 'none' : ALPHA.plateShadow,
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <div style={{...base, background: 'transparent', border: `1.5px solid ${ALPHA.hairline}`}}>
      {children}
    </div>
  );
};

/* --------------------------------------------------------------- tipografia */

/** Caixa alta pequena — o rótulo de contexto, nunca a informação. */
export const Eyebrow: React.FC<{children: ReactNode; color?: string; style?: CSSProperties}> = ({
  children,
  color = PALETTE.muted,
  style,
}) => (
  <div
    style={{
      fontFamily: sans,
      fontWeight: 800,
      fontSize: TYPE.smallCaps,
      letterSpacing: TYPE.smallCaps * 0.14,
      textTransform: 'uppercase',
      color,
      lineHeight: 1,
      ...style,
    }}
  >
    {children}
  </div>
);

export const MicroLabel: React.FC<{children: ReactNode; color?: string; style?: CSSProperties}> = ({
  children,
  color = PALETTE.muted,
  style,
}) => (
  <div
    style={{
      fontFamily: sans,
      fontWeight: 800,
      fontSize: TYPE.microLabel,
      letterSpacing: 1.6,
      color,
      lineHeight: 1,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Acento cursivo — Alvito, uma vez por gráfico, e só ASCII. */
export const Accent: React.FC<{children: ReactNode; size?: number; color?: string; style?: CSSProperties}> = ({
  children,
  size = TYPE.accent,
  color = PALETTE.gold,
  style,
}) => (
  <div
    style={{fontFamily: cursive, fontWeight: 700, fontSize: size, color, lineHeight: 1, ...style}}
  >
    {children}
  </div>
);

/**
 * Número em slots fixos.
 *
 * Obrigatório para todo valor que muda: Hetrixo não tem `tnum` (não tem GSUB) e
 * o '1' avança 0,325 em contra 0,667 do '0'. Sem slot, um contador de 1 para 2
 * dígitos reflui 2,05x na horizontal e o número anda para o lado enquanto conta.
 * Aqui cada glifo mora numa caixa própria, e a borda direita fica ancorada.
 */
export const NumericSlots: React.FC<{
  text: string;
  size?: number;
  color?: string;
  /** 0.70em cobre o dígito mais largo; a vírgula leva meia caixa */
  slot?: number;
  edge?: 'right' | 'center';
  style?: CSSProperties;
}> = ({text, size = TYPE.chipValue, color = PALETTE.ink, slot = 0.7, edge = 'right', style}) => (
  <div
    style={{
      display: 'inline-flex',
      justifyContent: edge === 'right' ? 'flex-end' : 'center',
      color,
      fontSize: size,
      lineHeight: 1,
      ...style,
    }}
  >
    {[...text].map((c, i) => (
      <span
        key={`${c}-${i}`}
        style={{
          display: 'inline-block',
          width: (c === ',' || c === '.' ? slot * 0.5 : slot) * size,
          textAlign: 'center',
          fontFamily: sans,
          fontWeight: 800,
        }}
      >
        {c}
      </span>
    ))}
  </div>
);

export const BigNumber: React.FC<{
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}> = ({children, size = TYPE.bigNumber, color = PALETTE.ink, style}) => (
  <div
    style={{
      fontFamily: sans,
      fontWeight: 800,
      fontSize: size,
      color,
      lineHeight: 0.92,
      letterSpacing: -2,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ barra */

/**
 * Barra de valor. O trilho vazio é 0,16: em 0,08 ele some no celular e o slot
 * deixa de ser visível. Ouro SÓ sobre placa ink — ouro em trilho claro é 1,18:1,
 * ou seja, invisível.
 */
export const Bar: React.FC<{
  pct: number;
  w?: number;
  h?: number;
  radius?: number;
  onInk?: boolean;
  fill?: string;
  style?: CSSProperties;
}> = ({pct, w = COL.w, h = 8, radius = 0, onInk = false, fill, style}) => {
  const p = clamp(pct);
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: onInk ? ALPHA.trackOnInk : ALPHA.track,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          width: `${(p * 100).toFixed(3)}%`,
          height: '100%',
          borderRadius: radius,
          background: fill ?? (onInk ? PALETTE.gold : PALETTE.ink),
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------- chip */

export type ChipProps = {
  label: string;
  /** valor já formatado, ex. "94%" — desenhado em slots fixos */
  value?: string;
  /** 0..1 — preenchimento do medidor */
  meter?: number;
  /** o vencedor do frame. No máximo um por frame */
  winner?: boolean;
  /** true quando o chip perdeu e recua para mudo */
  losing?: boolean;
  tone?: PlateTone;
  /**
   * 0..1 — preenchimento ink por cima da superfície, para a TROCA DE ESTADO
   * (o vencedor assume). A placa esmaece em 9 f; o tipo troca de cor num frame
   * só, no meio da rampa — senão lê como dissolve entre dois textos.
   */
  overlay?: number;
  w?: number;
  h?: number;
};

/**
 * A linha de decisão: rótulo, valor e peso no mesmo objeto.
 *
 * O medidor mora colado na borda de baixo e é recortado pelo raio da placa, então
 * o chip carrega a própria leitura sem precisar de um segundo elemento. O vencedor
 * é expresso por SUPERFÍCIE (block), nunca por um anel extra em cima.
 */
export const Chip: React.FC<ChipProps> = ({
  label,
  value,
  meter,
  winner = false,
  losing = false,
  tone,
  overlay = 0,
  w = CHIP.w,
  h = CHIP.h,
}) => {
  const surface: PlateTone = tone ?? (winner ? 'block' : 'outline');
  // o tipo troca num frame só: a cor segue o lado da rampa, não a rampa
  const onInk = surface === 'block' || overlay >= 0.5;
  const labelColor = onInk ? PALETTE.cream : losing ? PALETTE.muted : PALETTE.ink;
  const valueColor = onInk ? PALETTE.gold : losing ? PALETTE.muted : PALETTE.ink;

  return (
    <Plate tone={surface} radius={RADIUS.chip} style={{width: w, height: h}}>
      {overlay > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: PALETTE.ink,
            opacity: overlay,
          }}
        />
      ) : null}
      <div
        style={{
          // `relative` não é decorativo: a camada da troca de estado é absoluta,
          // e um filho estático pinta ABAIXO dela na ordem do CSS — sem isto o
          // rótulo e o valor do vencedor somem atrás do próprio preenchimento.
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: `0 ${CHIP.pad}px`,
          gap: 20,
        }}
      >
        <div
          style={{
            fontFamily: sans,
            fontWeight: 800,
            fontSize: TYPE.chipLabel,
            color: labelColor,
            flex: 1,
            lineHeight: 1,
          }}
        >
          {label}
        </div>
        {value !== undefined ? (
          <NumericSlots text={value} size={TYPE.chipValue} color={valueColor} />
        ) : null}
      </div>
      {meter !== undefined ? (
        <Bar
          pct={meter}
          w={w}
          h={8}
          radius={0}
          onInk={onInk}
          style={{position: 'absolute', left: 0, bottom: 0}}
        />
      ) : null}
    </Plate>
  );
};

/* ------------------------------------------------------------------- card */

export type CardProps = {
  eyebrow?: string;
  title?: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  w?: number;
  h?: number;
  tone?: PlateTone;
  style?: CSSProperties;
};

/**
 * O card de produto dos beats u09–u11. Estrutura fixa (cabeçalho, corpo, rodapé)
 * porque o que muda entre os três é a informação, não a peça: cada um ganha
 * personalidade pelo corpo e pelo estado, nunca por um layout novo.
 */
export const Card: React.FC<CardProps> = ({
  eyebrow,
  title,
  meta,
  body,
  footer,
  w = COL.w,
  h = 420,
  tone = 'sheet',
  style,
}) => (
  <Plate tone={tone} radius={RADIUS.card} style={{width: w, height: h, ...style}}>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '30px 34px 26px',
        gap: 16,
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : <div />}
        {meta}
      </div>
      {title ? (
        <div
          style={{
            fontFamily: sans,
            fontWeight: 800,
            fontSize: TYPE.cardTitle,
            color: PALETTE.ink,
            lineHeight: 1.06,
            letterSpacing: -0.6,
          }}
        >
          {title}
        </div>
      ) : null}
      {body ? <div style={{flex: 1, minHeight: 0}}>{body}</div> : <div style={{flex: 1}} />}
      {footer}
    </div>
  </Plate>
);

/** Linha de lista dentro do corpo de um card (u09 inbox, u10 rota, u11 item). */
export const Row: React.FC<{
  lead?: ReactNode;
  main: ReactNode;
  trail?: ReactNode;
  dim?: boolean;
  strike?: boolean;
}> = ({lead, main, trail, dim = false, strike = false}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '12px 0',
      borderTop: `1px solid ${ALPHA.rule}`,
      opacity: dim ? 0.5 : 1,
    }}
  >
    {lead}
    <div
      style={{
        fontFamily: sans,
        fontWeight: 800,
        fontSize: TYPE.chipLabel,
        color: PALETTE.ink,
        flex: 1,
        lineHeight: 1.1,
        textDecoration: strike ? 'line-through' : 'none',
      }}
    >
      {main}
    </div>
    {trail}
  </div>
);

/** Avatar/ícone de uma letra — o "remetente" de um item de lista. */
export const Dot: React.FC<{size?: number; tone?: 'gold' | 'ink' | 'outline'; label?: string}> = ({
  size = 40,
  tone = 'outline',
  label,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: tone === 'gold' ? PALETTE.gold : tone === 'ink' ? PALETTE.ink : 'transparent',
      border: tone === 'outline' ? `1.5px solid ${ALPHA.hairline}` : 'none',
      fontFamily: sans,
      fontWeight: 800,
      fontSize: size * 0.42,
      color: tone === 'ink' ? PALETTE.cream : PALETTE.ink,
      lineHeight: 1,
    }}
  >
    {label}
  </div>
);

/** Pílula de estado. Ouro é decisão: só o vencedor recebe. */
export const Pill: React.FC<{children: ReactNode; tone?: 'ink' | 'gold' | 'outline'}> = ({
  children,
  tone = 'ink',
}) => (
  <div
    style={{
      fontFamily: sans,
      fontWeight: 800,
      fontSize: TYPE.microLabel,
      letterSpacing: 1.6,
      padding: '8px 18px 10px',
      borderRadius: 999,
      lineHeight: 1,
      textTransform: 'uppercase',
      background: tone === 'gold' ? PALETTE.gold : tone === 'ink' ? PALETTE.ink : 'transparent',
      color: tone === 'outline' ? PALETTE.muted : tone === 'gold' ? PALETTE.ink : PALETTE.cream,
      border: tone === 'outline' ? `1.5px solid ${ALPHA.hairline}` : 'none',
    }}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ linhas */

/** Filete que se desenha em largura — nunca translada, só cresce. */
export const Rule: React.FC<{
  w: number;
  t?: number;
  color?: string;
  style?: CSSProperties;
  /** 0..1 — quanto do filete já se escreveu */
  draw?: number;
}> = ({w, t = 2, color = ALPHA.rule, style, draw = 1}) => (
  <div style={{width: w, height: t, ...style}}>
    <div
      style={{
        width: '100%',
        height: '100%',
        background: color,
        transform: `scaleX(${clamp(draw).toFixed(4)})`,
        transformOrigin: 'left center',
        borderRadius: t,
      }}
    />
  </div>
);

/* ------------------------------------------------------------------ marca */

export type BrandId = 'jev' | 'jev-wordmark' | 'chatgpt' | 'claude' | 'grok';

/** Recorte em public/brands/, copiado de assets/brands/ do kit. */
const BRAND_FILE: Record<BrandId, string> = {
  jev: 'jev-logo',
  'jev-wordmark': 'jev-wordmark',
  chatgpt: 'chatgpt-logo',
  claude: 'claude-logo',
  grok: 'grok-logo',
};

/**
 * Marca em tinta plana.
 *
 * O PNG é usado só como ALFA: a caixa é preenchida com uma cor da paleta e
 * recortada pela silhueta do arquivo. Assim o verde do ChatGPT e o coral do
 * Claude não entram no frame — seriam a única cromia do filme, e a coisa menos
 * legível dele ao mesmo tempo (2,30:1 e 2,73:1 no creme). A silhueta continua
 * exatamente a do arquivo original.
 */
export const BrandMark: React.FC<{
  brand: BrandId;
  box: number;
  height?: number;
  tone?: string;
  /** 0..1 — posição da varredura. Fora de [0,1] não desenha brilho */
  shine?: number;
  /** largura da faixa de brilho, em px */
  band?: number;
  /** recuo para marcas full-bleed não terem os raios cortados */
  pad?: number;
  style?: CSSProperties;
}> = ({brand, box, height, tone = PALETTE.ink, shine, band = 150, pad = 0, style}) => {
  const src = staticFile(`brands/${BRAND_FILE[brand]}.png`);
  const h = height ?? box;
  const active = shine !== undefined && shine > 0 && shine < 1;
  // a faixa atravessa a caixa inteira, entrando e saindo por fora do recorte
  const x = -band + (shine ?? 0) * (box + band * 2);

  return (
    <div style={{position: 'relative', width: box, height: h, ...style}}>
      <div
        style={{
          position: 'absolute',
          inset: pad,
          background: tone,
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      >
        {active ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: band,
              left: x,
              background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 100%)`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- luz */

/**
 * Respiração uniforme depois do shine: um ápice único, sem deslocamento.
 * O objeto nunca fica parado depois da varredura — mas também não ganha uma
 * segunda varredura, que não existe na referência.
 */
export const breath = (frame: number, at: number, dur = 10, alpha = 0.1, scale = 0.006) => {
  const env = curve([
    [at, 0],
    [at + dur / 2, 1],
    [at + dur, 0],
  ])(frame);
  return {alpha: env, lift: alpha * env, scale: 1 + scale * env};
};

/* --------------------------------------------------------- marca ChatGPT */

/**
 * O knot do ChatGPT como geometria.
 *
 * O `chatgpt-logo.png` é o tile do Wikimedia: o alfa dele é a CHAPA inteira, não
 * o knot, então <BrandMark> pintaria um quadrado liso. Aqui a marca sai do path
 * de `brands/chatgpt/logo.svg` (uma pá repetida a cada 60 graus), recortada no
 * bbox do knot para encher a caixa. É o mesmo desenho que o u05 usa em tamanho
 * grande; aqui ele serve de contexto pequeno.
 */
const CHATGPT_PA =
  'M1107.3 299.1c-197.999 0-373.9 127.3-435.2 315.3L650 743.5v427.9c0 21.4 11 40.4 29.4 51.4l344.5 198.515V833.3h.1v-27.9L1372.7 604c33.715-19.52 70.44-32.857 108.47-39.828L1447.6 450.3C1361 353.5 1237.1 298.5 1107.3 299.1zm0 117.5-.6.6c79.699 0 156.3 27.5 217.6 78.4-2.5 1.2-7.4 4.3-11 6.1L952.8 709.3c-18.4 10.4-29.4 30-29.4 51.4V1248l-155.1-89.4V755.8c-.1-187.099 151.601-338.9 339-339.2z';

export const ChatGPTMark: React.FC<{size: number; tone?: string; style?: CSSProperties}> = ({
  size,
  tone = PALETTE.ink,
  style,
}) => (
  <svg width={size} height={size} viewBox={`${1203 - 905} ${1203 - 905} 1810 1810`} style={style}>
    {[0, 60, 120, 180, 240, 300].map((r) => (
      <path key={r} d={CHATGPT_PA} fill={tone} transform={`rotate(${r} 1203 1203)`} />
    ))}
  </svg>
);
