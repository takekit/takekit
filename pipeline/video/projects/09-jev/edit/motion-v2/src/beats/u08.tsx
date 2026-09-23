import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {curve, fadeIn, progress} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, vertical} from '../kit/motion';
import {StageC} from '../kit/Stage';
import {ALPHA, COL, MOTION, PALETTE, RADIUS, EYEBROW, TYPE} from '../kit/tokens';
import {Eyebrow, NumericSlots, Plate, Rule, breath} from '../kit/ui';

/**
 * u08 — palco C, 71 f (2,37 s).
 *
 * O objeto da frase é só um: a probabilidade com que a decisão volta. Ela é o
 * herói, e por isso mora na única superfície `block` do beat — a mesma leitura
 * do chip vencedor do u01 (placa de tinta + medidor colado na borda de baixo),
 * só que ampliada até virar a peça inteira. Nada mais entra no frame: com 2,37 s
 * e um número vivo, qualquer segundo objeto rouba a leitura.
 *
 * Tempo: a placa pousa em f11, o rótulo aparece dentro dela, o valor acorda em
 * f12 e sobe até travar em 94 no f58 — antes do fim da cauda (71 − 10,65 = 60,35).
 * Os últimos 12 frames são só deriva, com o fio do medidor ainda respirando.
 */

/** Repouso da placa. Ela ocupa a coluna inteira (920 px), então deriva só em y:
 *  em x um bloco desse tamanho não tem para onde ir sem sair da faixa 80..1000. */
const PLACA = {x: COL.x, y: 560, w: COL.w, h: 440} as const;

/** O medidor é a aresta inferior do objeto, como no Chip do u01 — não um
 *  segundo elemento pendurado embaixo dele. */
const MEDIDOR_H = 20;
/** Fio de ataque do preenchimento: 30% de branco (alfa da paleta, não cor nova)
 *  para a borda do medidor parecer viva enquanto o valor sobe. */
const FIO = 34;

/** 94 é dado, não movimento: o alvo da contagem. */
const ALVO = 94;
/** Dois dígitos, cada um em slot fixo. A Hetrixo não tem `tnum` (o '1' avança
 *  0,325 em contra 0,667 do '0'), então o campo com largura fixa é o que impede
 *  o número de refluir e a % de pulsar no meio da subida. */
const SLOT = 0.7;
const CAMPO_W = TYPE.heroNumber * SLOT * 2;
const GAP_UNIDADE = 16;

/**
 * O valor é uma spline própria, monotônica, que só assenta no frame do corte.
 * Contador e medidor saem do MESMO número — é o que faz a leitura parecer
 * cálculo acontecendo, e não duas animações empilhadas. A subida acelera e
 * desacelera: probabilidade que se resolve, não cronômetro.
 */
const VALOR = curve([
  [12, 0],
  [20, 20],
  [28, 44],
  [38, 70],
  [48, 86],
  [54, 92],
  [58, ALVO],
  [70, ALVO],
]);

/**
 * Medidor local, não o `Bar` do kit: o preenchimento precisa carregar o fio de
 * ataque dentro dele. Trilho, preenchimento e fio saem de UMA largura só — com
 * dois elementos animados em separado eles desalinham em um frame.
 */
const Medidor: React.FC<{pct: number; brilho: number}> = ({pct, brilho}) => (
  <div style={{height: MEDIDOR_H, background: ALPHA.trackOnInk, overflow: 'hidden', flex: 'none'}}>
    <div
      style={{
        width: `${(pct * 100).toFixed(3)}%`,
        height: '100%',
        background: PALETTE.gold,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          width: FIO,
          height: '100%',
          background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${(
            0.3 +
            0.25 * brilho
          ).toFixed(3)}) 100%)`,
        }}
      />
    </div>
  </div>
);

export const U08: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  /** Casa: a mesma cabeça do u13 (eyebrow na faixa de 120, régua em 192), para o
   *  corte B→C→B não deslocar o tipo. */
  const cabecalho = fadeIn(frame, -4, 12);
  const escreve = progress(frame, {start: -3, enter: MOTION.micro, duration, ease: 'pop'});

  const v = Math.round(VALOR(frame));
  const pct = v / ALVO;
  // A placa se monta por dentro: primeiro o rótulo, depois o número acorda já
  // contando. Assim o beat tem três tempos (pouso, cálculo, lock) em vez de um
  // bloco que aparece pronto e espera.
  const rotulo = fadeIn(frame, 2, MOTION.fade);
  const acorda = fadeIn(frame, 12, MOTION.fade);
  // O lock (f57, quando a spline arredonda para 94) é a última novidade do beat;
  // o fio do medidor respira por cima do valor travado e daí em diante não nasce
  // mais nada — só a deriva, que segue com velocidade até o corte.
  const respira = breath(frame, 57, MOTION.breath);

  return (
    <StageC>
      {/* camada ambiente: só a cabeça da casa. A régua tem 920 px, logo deriva
          só em y — a paralaxe entre ela e a placa é vertical, no mesmo sentido. */}
      <Enter
        frame={frame}
        duration={duration}
        start={-5}
        enter={1}
        driftRate={vertical(driftAmbient)}
      >
        <div
          style={{
            position: 'absolute',
            left: COL.x,
            top: EYEBROW.C,
            opacity: cabecalho,
          }}
        >
          <Eyebrow>Decisão do modelo</Eyebrow>
        </div>
        <Rule
          w={COL.w}
          t={1.5}
          color={ALPHA.rule}
          draw={escreve.s}
          style={{position: 'absolute', left: COL.x, top: 192}}
        />
      </Enter>

      {/* herói: a placa do vencedor. É a única superfície block do beat, e o
          vencedor se declara por superfície, nunca por um selo em cima. */}
      <Enter
        frame={frame}
        duration={duration}
        start={-5}
        enter={MOTION.enterPlate}
        from={{y: MOTION.travel.plate, scale: 0.97, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{
          position: 'absolute',
          left: PLACA.x,
          top: PLACA.y,
          width: PLACA.w,
          height: PLACA.h,
        }}
      >
        <Plate tone="block" radius={RADIUS.plate} style={{width: '100%', height: '100%'}}>
          {/* Tudo dentro da placa é leitura em fluxo, não camada solta: um
              número que deriva por conta própria dentro do próprio painel
              desalinha do medidor, e o medidor é a segunda metade do número. */}
          <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: '48px 48px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {/* caixa baixa, como o rótulo do chip do u01: é a MESMA palavra, e
                  o vencedor não muda de registro entre beats */}
              <div
                style={{
                  fontFamily: sans,
                  fontWeight: 800,
                  fontSize: TYPE.chipLabel,
                  letterSpacing: TYPE.chipLabel * 0.12,
                  color: PALETTE.cream,
                  lineHeight: 1,
                  opacity: rotulo,
                }}
              >
                financeiro
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: GAP_UNIDADE,
                  opacity: acorda,
                }}
              >
                <NumericSlots
                  text={`${v}`}
                  size={TYPE.heroNumber}
                  color={PALETTE.cream}
                  slot={SLOT}
                  edge="right"
                  style={{width: CAMPO_W}}
                />
                <div
                  style={{
                    fontFamily: sans,
                    fontWeight: 800,
                    fontSize: TYPE.unit,
                    color: PALETTE.gold,
                    lineHeight: 1,
                  }}
                >
                  %
                </div>
              </div>
            </div>
            <Medidor pct={pct} brilho={respira.alpha} />
          </div>
        </Plate>
      </Enter>
    </StageC>
  );
};
