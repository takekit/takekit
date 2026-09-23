import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fadeIn} from '../kit/curve';
import {Enter, driftAmbient, driftHero, staggerStart, vertical} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, COL, MOTION, PALETTE, RADIUS} from '../kit/tokens';
import {MicroLabel, Plate, Row} from '../kit/ui';

/**
 * u09 — palco B, 48 f (1,60 s).
 *
 * Um card de inbox abre com três itens e um deles é reconhecido na frente do
 * viewer: o tag INBOX pousa no primeiro item, as barras de preview dele viram
 * tinta sólida e os outros dois recuam. O gesto é do ITEM + TAG, não do card —
 * a placa é só o contêiner que carrega o vencedor, e por isso ela não ganha
 * nenhum estado próprio.
 *
 * O card fecha em y 176..496: 320 px de altura, dentro de 40..700 e longe da
 * costura em 960. A faixa da caption (700..960) fica inteiramente vazia.
 */

const CARTAO = {left: COL.x, top: 176, w: COL.w, h: 320};
/** O mesmo recuo horizontal do `Card` do kit: todo tipo do card nasce em x=116. */
const RECUO = 36;
const TOPO_CABECALHO = 30;
const TOPO_LINHAS = 74; // 30 do padding + 28 do cabeçalho + 16 de respiro
const PASSO = 75; // a linha do kit mede 69; 6 de intervalo entre irmãos
const VAZIA = 0.18; // barra de preview ainda não lida
const LIDA = 0.88; // a mesma barra depois de reconhecida
const LUZ_PX = 240; // largura da banda de luz

/**
 * Frames — aqui só mora tempo, nenhum número de movimento.
 *
 * ABRE em -5 porque o corte cai com o card já subindo; CASCATA em 0 deixa o card
 * existir antes de ter conteúdo, e o stagger de 4 f (grupo de 3) fecha a lista em
 * 20. CLASSIFICA em 16 divide o beat: metade cascata, metade reconhecimento. A
 * última novidade (RECUA) começa em 26, bem antes de duration − tail = 40.
 */
const ABRE = -5;
const CASCATA = 0;
const CLASSIFICA = 16;
const LUZ = 18;
const RECUA = 26;

/**
 * O card inteiro é UM plano: 920 px de largura pedem `vertical`, e o conteúdo
 * usa a mesma família de eixo. Se uma linha derivasse em x ela deslizaria para
 * fora do padding do próprio card — e o conteúdo de um card não pode andar
 * dentro da moldura dele. A paralaxe que sobra é vertical e no mesmo sentido.
 */
const PLANO = vertical(driftHero);
const DENTRO = vertical(driftAmbient);

/* ------------------------------------------------------------------ desenho */

/**
 * Envelope de traço puro: um nome de remetente seria palavra no canvas, e o
 * `Dot` do kit só aceita `label` de texto. O objeto da frase é o e-mail, e o
 * envelope o desenha sem gastar tipo.
 */
const Envelope: React.FC = () => (
  <svg width={20} height={14} viewBox="0 0 20 14" fill="none">
    <rect x={0.8} y={0.8} width={18.4} height={12.4} rx={2.6} stroke={PALETTE.muted} strokeWidth={1.6} />
    <path
      d="M3.6 4.2 L10 8.6 L16.4 4.2"
      stroke={PALETTE.muted}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Avatar do item: o círculo do `Dot` do kit, hospedando o envelope. */
const Avatar: React.FC = () => (
  <div
    style={{
      width: 44,
      height: 44,
      borderRadius: 22,
      border: `1.5px solid ${ALPHA.hairline}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
    }}
  >
    <Envelope />
  </div>
);

/** Bandeja de entrada: a identidade do card, sem uma palavra escrita. */
const Bandeja: React.FC = () => (
  <svg width={34} height={28} viewBox="0 0 34 28" fill="none">
    <path
      d="M2 15 H11 L13.5 19.5 H20.5 L23 15 H32 V21 A5 5 0 0 1 27 26 H7 A5 5 0 0 1 2 21 Z"
      stroke={PALETTE.muted}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Slot livre do cabeçalho — os irmãos u10/u11 podem espelhar a mesma anatomia. */
const Pontos: React.FC = () => (
  <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{width: 6, height: 6, borderRadius: 3, background: PALETTE.muted}} />
    ))}
  </div>
);

/**
 * Duas barras de preview. A tinta é a `PALETTE.ink` com opacidade, nunca um
 * rgba escrito à mão: a cor continua vindo de um lugar só. O trilho vazio usa
 * 0,18 — abaixo disso (0,08) a barra some no celular.
 */
const Preview: React.FC<{tinta: number}> = ({tinta}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap: 8, opacity: tinta}}>
    <div style={{width: 380, height: 12, borderRadius: RADIUS.bar, background: PALETTE.ink}} />
    <div style={{width: 240, height: 12, borderRadius: RADIUS.bar, background: PALETTE.ink}} />
  </div>
);

/** Hora do item: mudo, curto, no trail. Só o item não lido carrega isso. */
const Hora: React.FC = () => (
  <div style={{width: 56, height: 12, borderRadius: RADIUS.bar, background: ALPHA.soft, flex: 'none'}} />
);

/* -------------------------------------------------------------------- item */

const Item: React.FC<{
  frame: number;
  duration: number;
  index: number;
  classifica: number;
  recuo: number;
}> = ({frame, duration, index, classifica, recuo}) => {
  const heroi = index === 0;
  return (
    <Enter
      frame={frame}
      duration={duration}
      start={staggerStart(index, CASCATA, 3)}
      enter={MOTION.enter}
      from={{y: MOTION.travel.chip, scale: 0.99, opacity: 0}}
      fade={MOTION.fade}
      driftRate={DENTRO}
      style={{
        position: 'absolute',
        left: RECUO,
        top: TOPO_LINHAS + index * PASSO,
        width: CARTAO.w - 2 * RECUO,
      }}
    >
      {/* O recuo dos irmãos mora num filho, não no `Enter`: o `Enter` escreve a
          própria opacidade depois do style, e a rampa de entrada apagaria o
          estado. A barra do herói usa o mesmo relógio de 10 f, invertido. */}
      <div style={{opacity: recuo}}>
        <Row
          lead={<Avatar />}
          main={<Preview tinta={heroi ? VAZIA + (LIDA - VAZIA) * classifica : VAZIA} />}
          trail={heroi ? undefined : <Hora />}
        />
      </div>

      {/* Item + tag são UM gesto: o tag mora dentro do `Enter` da linha e sobe
          com ela. É a única placa ink do beat — e é o vencedor. Ouro só existe
          sobre essa superfície, e é o único ouro do frame. O `pop` é o único
          ápice do beat: 2% de escala, no pouso.
          A sombra do `block` fica desligada: o pill encosta no padding direito
          do card, e o lift (18 px para baixo, 38 de blur) vazaria sobre a linha
          de baixo e seria decapitado pela borda — melhor nenhuma sombra que uma
          sombra cortada. */}
      {heroi ? (
        <Enter
          frame={frame}
          duration={duration}
          start={CLASSIFICA}
          enter={MOTION.enter}
          ease="pop"
          from={{x: MOTION.travel.chip, scale: 0.92, opacity: 0}}
          fade={MOTION.fade}
          driftRate={DENTRO}
          style={{position: 'absolute', right: 0, top: 16}}
        >
          <Plate tone="block" radius={999} shadow="none" style={{padding: '8px 18px 10px'}}>
            <MicroLabel color={PALETTE.gold}>INBOX</MicroLabel>
          </Plate>
        </Enter>
      ) : null}
    </Enter>
  );
};

/* -------------------------------------------------------------------- beat */

export const U09: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  // Um relógio só para a classificação: a barra do herói assume em 10 f e os
  // irmãos recuam logo atrás, no fade de 6 f do kit. Nada pisca de volta.
  const classifica = fadeIn(frame, CLASSIFICA, 10);
  const recuo = 1 - 0.55 * fadeIn(frame, RECUA, MOTION.fade);

  return (
    <StageB>
      <Enter
        frame={frame}
        duration={duration}
        start={ABRE}
        enter={MOTION.enterPlate}
        from={{y: MOTION.travel.plate, scale: 0.972, opacity: 0}}
        fade={MOTION.fadePlate}
        driftRate={PLANO}
        style={{position: 'absolute', left: CARTAO.left, top: CARTAO.top}}
      >
        <Plate tone="sheet" radius={RADIUS.card} style={{width: CARTAO.w, height: CARTAO.h}}>
          {/* Varredura de luz: tinta a 5,5%, nunca ouro. Ela nasce e morre fora
              do recorte do card (por isso o fade de 2 f acontece onde ninguém
              vê) e atravessa em 13 f — o `shine` de um beat de 48 f. */}
          <Enter
            frame={frame}
            duration={duration}
            start={LUZ}
            enter={MOTION.shine}
            from={{x: -(CARTAO.w + LUZ_PX)}}
            fade={2}
            driftRate={DENTRO}
            style={{
              position: 'absolute',
              left: CARTAO.w,
              top: -160,
              width: LUZ_PX,
              height: 640,
              background: `linear-gradient(112deg, rgba(28,26,24,0) 0%, rgba(28,26,24,0.055) 50%, rgba(28,26,24,0) 100%)`,
            }}
          >
            {null}
          </Enter>

          {/* Cabeçalho sem uma palavra. Sem entrada própria: ele é chapa do card
              e usa o MESMO relógio de fade da placa — com um fade próprio a
              bandeja flutuaria sobre o canvas vazio antes do card chegar. */}
          <Enter
            frame={frame}
            duration={duration}
            start={ABRE}
            enter={1}
            fade={MOTION.fadePlate}
            driftRate={DENTRO}
            style={{
              position: 'absolute',
              left: RECUO,
              top: TOPO_CABECALHO,
              width: CARTAO.w - 2 * RECUO,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Bandeja />
            <Pontos />
          </Enter>

          {[0, 1, 2].map((i) => (
            <Item
              key={i}
              frame={frame}
              duration={duration}
              index={i}
              classifica={classifica}
              recuo={i === 0 ? 1 : recuo}
            />
          ))}
        </Plate>
      </Enter>
    </StageB>
  );
};
