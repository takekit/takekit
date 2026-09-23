# Repertório de comportamentos de edição

## Direção acordada com o Oldaque

Captions seguem o formato: explicação ilustrada usa as duas famílias + hold em
[FORMATOS.md](FORMATOS.md); `trendy-stack-chroma` só se o vídeo pedir aquele tratamento
(aprovado no 03). Para outros recursos, estabelecer uma execução visual e sonora reconhecível:
como entra, se acomoda, sustenta a informação e sai. O agente escolhe quando usar, combina
recursos e cria composições conforme a narrativa. Não há sequência de cenas obrigatória nem
quantidade de recursos por vídeo.
Essa liberdade é visual/sonora: roteiro e montagem da fala seguem o contrato em `WORKFLOW.md`, §3.
Movimento “silencioso” neste arquivo significa sem SFX, nunca pausa ou respiro na fala.

Em 15/09/2026, o usuário confirmou punch com zoom + SFX sincronizado como exemplo do padrão
desejado. Os valores abaixo reaproveitam presets existentes; as outras famílias são direções
iniciais de execução, não novos resultados visuais já aprovados.

## Recursos e sua execução

| Recurso | Comportamento de referência | Som associado | Escolhas do editor |
|---|---|---|---|
| Captions (explicação ilustrada) | Palco A: Hetrixo 1–3 palavras no peito (y ~1180). Palco B: mesma família no vão y 640–800. Palco C: y 1500–1750. Hold só no CTA | Sem pop por palavra | `seguir` ou `segurar`; motor `captions_palco.py` |
| Captions trendy-stack-chroma | Tetris + chroma, fontes e animação aprovados no 03 | Sem pop por palavra | Só se o vídeo pedir esse tratamento |
| Punch-in | Aproximação curta ancorada no assunto; desacelera e sustenta o enquadramento | Whoosh curto sincronizado ao zoom | Momento, intensidade, pivô, duração da sustentação. Neste tratamento, punch não é por beat |
| Punch-out | Parte do enquadramento próximo e abre de forma controlada, revelando contexto | Whoosh acompanha a abertura, com peso compatível com o gesto | Momento, amplitude, velocidade e plano de destino |
| Canvas B/C | Sempre em motion. Objeto da cláusula (skills). Faixa travada: B y 180–620; C y 200–1400. Caption intocável | SFX por cue (`snap`/`click`/`whoosh`/`riser`/`reveal`) | Kit Remotion; `<StageB>`/`<StageC>`; não copiar cena do 09-jev |
| Shine em logo | Varredura curta e suave no recorte; reusável em qualquer id do kit | Silencioso | Qualquer logo que fique pouco tempo no canvas |
| Palco | A/B/C pela cláusula (FORMATOS.md). Trocar cedo; moda ~2 s; A é respiro | Corte seco + filmburn na troca; sem whoosh por palco | `palco` no storyboard; B = `palco_b_composite.py` |
| CTA comment | Hold `COMMENT` + keyword ouro até o fim. Fala pode ser mais longa que a tela | Light leak opcional no corte | Keyword do briefing; não reusar glass do 04 neste papel |
| Entrada de texto gráfico | Entrada legível, desaceleração até repouso, leitura estável e saída resolvida | Snap discreto para pontuação; reveal suave para uma revelação; silêncio para texto de apoio | Conteúdo, posição, escala, trajetória e divisão em partes; não redesenhar captions |
| Destaque de informação | Máscara, sublinhado ou aproximação conduz ao trecho certo e sustenta o foco | Marcação curta se houver ênfase; destaque contínuo pode ser silencioso | Forma, região, duração e necessidade de tracking |
| Transição | Neste tratamento: corte seco. Relacionar saída e entrada por palco, não por burn | Whoosh só quando a intensidade for a do 05 | Light leak no CTA se o corte pedir pontuação |

As famílias são ampliáveis. Manter a execução coerente quando um recurso reaparece; variações
podem responder à fala, à intensidade ou ao perfil de edição. Uma ideia nova pode pedir um recurso
novo. Não pedir autorização apenas por adaptar um comportamento dentro da edição solicitada.

## Punch: referência completa

- **Base visual existente:** `presets/punch.json`. Zoom 1.14, variante suave 1.10, rampa de cerca
  de 7 frames a 30 fps. Pivô histórico `[0.5, 0.64]`: localizar o rosto/assunto no footage real.
  Os valores são ponto de partida; em outro fps preservar o tempo percebido.
- **Construção:** Transform com Size animado em spline no Fusion; MotionBlur ligado, referência
  de shutter 270 e quality 4. Resolver a curva para chegada controlada e sustentação estável.
  No punch-out, verificar o enquadramento revelado. Shake é um recurso adicional, não parte
  obrigatória de todo punch.
- **Par sonoro:** whoosh, referência `whoosh/whoosh_swoosh_01` no catálogo de SFX. Selecionar um
  trecho curto útil e alinhar seu gesto audível ao zoom. O mapa histórico usava 0,7 s e início
  3 frames antes; conferir o ataque real, não aplicar offset cegamente. O arquivo-fonte do
  catálogo é maior que o trecho utilizado.
- **Nível:** consultar `assets/sfx/catalog.json` → `rel_db`, consumido por `engine/sfx_prep.py`;
  o whoosh tem referência de −19 dB em relação à voz. Ouvir com a narração. Os textos descritivos
  de categorias podem ter níveis antigos; usar os valores executáveis como ponto de partida.
- **Coerência:** ao escolher um punch de ênfase, montar zoom e som como um evento conjunto.
  Ajustar o som à força do gesto. Um punch sem SFX pode servir ao perfil, sem interromper a fala,
  mas não deve resultar de esquecer a parte sonora. Não duplicar som já presente.
- **Revisão:** assistir antes, durante e depois do gesto com áudio; rosto/assunto permanece no
  enquadramento, a curva não dá tranco, o som parece pertencer ao movimento e a voz segue clara.

O zoom-out de abertura em `presets/intro-zoomout.json` é outro comportamento: parte de 1.40 e
chega a 1.00 com blur em 18 frames na referência histórica. Não confundir essa abertura mais
marcada com todo punch-out; selecionar conforme o papel da passagem.

## Compor recursos sem repetir cenas

Uma mudança de argumento pode usar punch + whoosh. Uma demonstração pode usar aproximação no
cursor + destaque. Uma comparação pode usar texto gráfico em dois planos. O tratamento dos
recursos fornece continuidade visual e sonora; a montagem e o desenho atendem ao conteúdo.

Materiais também compõem o repertório. O efeito glass aprovado no 04 pode tratar texto, uma
notificação ou outro objeto. A aprovação se refere ao material; não obriga o layout, a função
CTA, nem o uso de glass em outros vídeos. Consultar a referência técnica quando esse material
for escolhido, assim como se consulta um preset de câmera ao escolher um punch.

Ícone, seta ou logo que chega com franja ou halo na borda: limpar o artefato no matte
(erode/dilate na ordem de 0,5–1 px + recolor branco) antes de entrar na composição. O valor é
ponto de partida daquele asset, não default — a referência é a borda limpa no frame real.

## Aplicação no workflow existente

Kit pronto para B-roll sobre grid claro: [Parallax nativo](references/parallax-kit/README.md).
O agente informa mídia, formato e posição; `pipeline/apply_broll_parallax.py` monta grid do
Brainstorm + card arredondado + sombra + movimentos independentes no Fusion. Três formatos:
horizontal, vertical e quadrado. **Look aprovado pelo usuário em 16/09/2026** (preview
`parallax-kit-v1`), sem gate de validação; a promoção a motor de motion host ainda não foi feita,
e o resultado renderizado se compara com o preview antes de mudar parâmetros.

Repertório adicional: [pack Brainstorm Academy](assets/packs/brainstorm-academy/README.md).
Fundos e SFX já estão disponíveis como mídia; zoom/pan e animações de texto Adobe são referências
para futuras adaptações nativas conforme a edição pedir. Não substituem os padrões existentes.

1. Definir o que cada trecho precisa comunicar e escolher os recursos pertinentes.
2. Consultar o comportamento e os presets relevantes; definir visual e som juntos.
3. Executar no Fusion e na timeline de áudio do Resolve. Se usar o builder atual, declarar o
   movimento em `punches` e o som em `audio.sfx`; ele não associa o SFX automaticamente. Para
   outras composições, editar o grafo diretamente ou importar uma `.comp` em host adequado.
4. Capturar o resultado nativo e conferir movimento + som em playback. Ajustar o tratamento
   conforme o contexto, preservando a família de caption do formato.
5. Registrar feedback com seu objeto: legenda, movimento, som, material, layout ou composição
   inteira. Promover somente o aspecto aprovado; referência de um efeito não aprova a cena toda.

Este repertório orienta o agente. Não adiciona um motor, um novo manifesto obrigatório ou
associação automática de som. `SCENES.md` continua como exemplos opcionais de composição;
`FUSION.md` descreve execução e captura nativas.
