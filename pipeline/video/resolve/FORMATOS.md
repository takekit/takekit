# Formatos editoriais

Vocabulário interno para decidir a edição. Formato organiza o conteúdo; estilo define tratamento;
recursos executam a ideia. Tela dividida e B-roll não são formatos. Conexão pode ser objetivo de
qualquer formato. Confirmar a hipótese com o usuário quando estiver ambígua, sem questionário fixo.

| Formato / ID | Como conduz | Tratamento de partida | Recursos sob demanda |
|---|---|---|---|
| YAP / `yap` | Fala direta, opinião ou reflexão sustentada pelo apresentador | Edição mínima, título durante todo o vídeo, captions neutras, câmera estável ou zoom discreto | Sem busca/B-roll/motion elaborado por padrão; incluir só quando necessário ou pedido |
| Explicação ilustrada / `explicacao-ilustrada` | Fala explica descoberta/assunto, apoiada por imagens e provas | **Default do creator.** Três palcos por cláusula, captions palco, canvas B/C em motion na safe zone (09-jev). 05 é intensidade de câmera/SFX, não o default | Palco B, captions palco, kit de marcas, motion Remotion, SFX por cue |
| Demonstração / `demonstracao` | A ação visível conduz a compreensão | Mostrar entrada, ação e resultado; voz orienta | Captura de tela, aproximação no foco, indicação de clique/área |
| Storytelling / `storytelling` | Situação, progressão e desfecho conduzem a narrativa | Progressão visual acompanha a história; intensidade varia conforme estilo | Arquivo, B-roll, associações, texto e motions quando a história pedir |
| React/análise / `react-analise` | Conteúdo externo organiza reação/comentário | Dar contexto do trecho e distinguir fonte da interpretação | Trecho original, split, pausas de reprodução do material, prints e destaques |

YAP é formato próprio; `quiet` não é seu equivalente técnico. Edição visual mínima mantém a
fala dinâmica e a revisão completa do workflow. Pausar o vídeo-fonte num react não autoriza
silêncio na narração. Storytelling pode ser simples: mais artefatos são possibilidade, não quota.
Os formatos podem ser combinados com motivo no plano, sem construir uma taxonomia infinita.

## Referências disponíveis

- Explicação ilustrada (**default**, 19/09/2026): [`09-jev` v3](../projects/09-jev/exports/09-jev-v3.mp4).
  Palco, caption, SFX e faixa aprovados. O objeto do canvas muda por vídeo
  ([motion/README.md](motion/README.md)). Pipeline: [DEFAULT.md](DEFAULT.md).
  Estudo de origem: [`000-video-to-copy`](../projects/000-video-to-copy/index.html).
- Explicação ilustrada (intensidade de câmera/SFX): [05 EDIT_v4](references/motion-host-baseline/README.md).
  Gancho Hulk/Loki representa a reação da frase; punch+whoosh, filmburn, split host-em-cima,
  trendy-stack-chroma. Usar quando o vídeo pedir essa intensidade, não como default do formato.
  Modelar a relação entre fala e imagem, não repetir o clipe.
- YAP: direção declarada nesta consolidação. A variante neutra de caption ainda **não existe** no
  catálogo: `styles/neutral.json` está previsto, sem arquivo nem amostra validada. Criar e validar
  num trecho curto antes de registrar como referência pronta.
- Demais formatos: direções de partida, sem atribuir aprovação visual a exemplos inexistentes.

## Explicação ilustrada — palco por cláusula

Não é formato novo nem sequência obrigatória de cenas. Cada cláusula do roteiro escolhe um palco.
Storyboard no `plan.json`: `palco` (`A`/`B`/`C`) e `caption` (`seguir`/`segurar`).

```
cláusula falada
  ponte / ênfase / pergunta     → A  host fechado      caption P4/P5, modo seguir
  ideia + prova juntos          → B  host embaixo      P6 no canvas + motion
  a ideia É o objeto            → C  full gráfico      P6 + motion
  fechar com keyword            → A ou B               hold P16 (tela ≠ fala)
```

- **A** — crop ombros/cabeça, já fechado. Caption no peito. Câmera quieta. Respiro curto entre B/C.
- **B** — canvas ~50% em cima; host embaixo no card arredondado, **cabeça vaza do card**.
  Receita reproduzível (`../headless/palco_b.py` → `engine/palco_b_composite.py`,
  `presets/host-bottom-split.json`): alfa do RVM (Robust Video Matting) só como máscara →
  threshold duro em Python → card (z=0) + pessoa (z=+1) na metade de baixo. Nada de keyer
  suave: amolece o recorte. Overlay do canvas é o gráfico por cima do host.
  (Até 23/09/2026 a máscara vinha do DepthMap do Resolve; removido.)
- **C** — some o host. O frame é o objeto da frase.

**Ritmo.** Shot 0,9–4,8 s, moda ~2 s. Trocar de palco cedo: o gancho de referência faz B→A→C
em ~3,5 s. Não estacionar. Exceção: a ação precisa de tempo (gerar um B-roll, ~5 s).
Corte seco. Light leak só se o CTA pedir pontuação.

**Caption.** Legenda o vídeo inteiro. Hold empilhado **só no CTA**. Tetris/chroma do
`trendy-stack-chroma` não é o default deste formato (o 03 permanece aprovação daquele
tratamento, se o vídeo o pedir). Fontes: Hetrixo ExtraBold (sans) + Alvito Nova Comp Bold
(cursiva). Poppins/Playfair não.

- No rosto (A): Hetrixo branca, 1–3 palavras, troca no ataque da fala.
- No canvas (B/C): mesma família, tinta no creme. Também **segue a fala** (1–3 palavras);
  não empilhar/segurar a cláusula inteira.
- Ênfase (só frases marcadas): duas camadas independentes, overlap medido pelos
  glifos visíveis, sombra da frente cai na linha de trás. Família e cor **não**
  fixam profundidade — cursiva pode ir atrás; laranja não é default
  (`styles/caption-style-config.json`).
- Hold (só CTA): `comment` Alvito atrás + keyword Hetrixo ouro radial na frente.
  A tela **não** transcreve a fala.

**Motion.** Canvas B e C sempre em motion. O objeto é do vídeo (skills). A faixa
é travada: [motion/README.md](motion/README.md). B = gráfico y 180–620, caption
640–800 vazia, alfa 0 abaixo de 960. C = gráfico y 200–1400, caption 1500–1750
vazia, mais expansivo. Entrada+deriva no kit (`<Enter>`). Shine em logo.

**Som.** Voz na frente. SFX por cue do motion (`map_sfx_cues.py`). Sem whoosh por
corte. Filmburn na troca de palco. Cama, se existir, ducked (−25 dB no 09-jev).

Recursos do default: palco B, captions palco, kit de marcas, motion kit, SFX kind→catálogo.
Todos aprovados no 09-jev. Não reabrir.

## Escolher caption e título

YAP: título persistente em zona livre do rosto/captions; blocos neutros legíveis, sem chroma,
escada de palavra-herói ou efeitos por palavra. Usar o recurso neutro do catálogo quando existir
e ajustar ao footage. O título é elemento separado, construído com Text+ quando necessário.
Explicação ilustrada: as duas famílias + hold acima. `trendy-stack-chroma` só se o vídeo
pedir explicitamente aquele tratamento (aprovado no 03).
Nenhum formato altera a fala do roteiro. O hold do CTA altera o **texto na tela**, não a boca.
