# 09-jev — Briefing de edição

Vídeo: "Sua IA agora decide sozinha"
Perfil: vertical (Reels / Shorts / TikTok)
Estado: roteiro no molde das refs (Brock / Nick), aprovado nesta conversa. Aguardando raw.
Cobaya: primeiro vídeo nosso no tratamento de explicação ilustrada de
[`000-video-to-copy`](../000-video-to-copy/) / `FORMATOS.md`. Ainda sem resultado validado.

## Roteiro gravado

A ordem abaixo é o raciocínio. Não reordenar. A fonte da fala é o roteiro aprovado e o raw é o
material; transcrever o raw e conferir contra este texto. Divergência entre raw e roteiro se
resolve em outra tomada ou vira pendência para decisão do usuário (WORKFLOW.md §3.A.4), nunca
ajuste do roteiro à fala do áudio.

Sua IA agora decide sozinha, e não é um textão, é sim ou não. O Jev acabou de sair, do cara que ajudou a inventar o ChatGPT, e ele não gera texto. Então você lista as opções e ele devolve a decisão com a probabilidade. Com isso você classifica email, encaminha chamado, checa se a outra IA inventou um desconto, e escolhe qual modelo usar na hora. Na Vercel ficou de cinco a dezoito vezes mais rápido que o classificador do ChatGPT. Responde em menos de meio segundo. A saída é de graça. Quer o setup? Comenta JEV aqui embaixo que eu te mando o link direto.

## CTA

Só no fecho, como nas refs. Sem encaminhar no meio.

- Fala: "Comenta JEV aqui embaixo que eu te mando o link direto."
- Keyword: `JEV`.
- Tela: hold `COMMENT` + `"JEV"` ouro. A tela não transcreve a frase.

## Formato e ritmo

- Vertical 9:16, ~30–40 s.
- Formato: `explicacao-ilustrada`. Palco A/B/C por cláusula. Caption 1–3 palavras, duas famílias
  + hold. Canvas B/C em motion. Corte seco. Câmera estável no A.
- Referência visual: estudo [`000-video-to-copy`](../000-video-to-copy/) (reel-02 do Nick em
  especial). Não copiar cenas; copiar o motor.
- Abertura: B→A→C em ~3 s, três cláusulas do gancho.
- Porta na cara: encerrar em "direto", sem sobra depois do CTA.

## Título na tela

- Wordmark `JEV` no gancho (palco B), no papel do `ANTHROPIC` do reel-01. Shine, sai quando o
  gancho acaba. Não volta.
- Não usar frase-título por cima do gancho falado.

## Estrutura da fala (molde das refs)

| bloco | fala |
|---|---|
| gancho (3 cláusulas) | Sua IA agora decide sozinha / e não é um textão / é sim ou não |
| nome + prova | O Jev acabou de sair, do cara que ajudou a inventar o ChatGPT |
| definição | ele não gera texto. Você lista as opções e ele devolve a decisão com a probabilidade |
| inventário | classifica email, encaminha chamado, checa desconto inventado, escolhe o modelo |
| prova | Vercel 5–18× o classificador do ChatGPT |
| transformação | menos de meio segundo; saída de graça |
| CTA | Comenta JEV… mando o link direto |

## Abertura (B→A→C)

| palco | fala | visual (sugestão) |
|---|---|---|
| B | Sua IA agora decide sozinha | split: chips de decisão no canvas, host embaixo, wordmark `JEV` |
| A | e não é um textão | host fechado |
| C | é sim ou não | full: rótulos `SIM` / `NÃO` + probabilidade |

Depois do gancho, palco troca na cláusula. Lista de ações no split (mesmo palco B, troca o
print de cima). CTA no fim em B ou A, hold da keyword.

## Aspectos visuais

O editor decide a solução. O vídeo só precisa deixar claros estes pontos:

- Jev decide; não escreve. O objeto do gancho é rótulo no lugar de textão.
- Nome + origem: TypeSafe / Diogo Almeida / ChatGPT, sem virar aula de história.
- Os quatro usos do inventário, um visual cada.
- Prova Vercel (número 5–18×), velocidade, saída de graça.
- Marcas do assunto (ChatGPT, se couber Claude) vêm de `assets/brands/` quando existir. Sem
  mascote do Oldaque.

## Beats de interpretação

- Gancho no ritmo do Nick: três frases curtas, sem respiro, sobe em "sim ou não".
- Inventário como lista de verbo, emenda, sem pausa entre os quatro.
- "A saída é de graça" deixa cair.
- CTA rápido, sem explicar de novo. "Quer o setup?" é o único aquecimento.

## Legenda do post

```
Comenta "JEV" que eu te mando o link.

Sua IA agora decide sozinha, e não é um textão, é sim ou não.

O Jev acabou de sair, do cara que ajudou a inventar o ChatGPT. Ele não gera texto. Você lista as opções, ele devolve a decisão com a probabilidade.

Classifica email, encaminha chamado, checa se a outra IA inventou um desconto, e escolhe qual modelo usar na hora.

Na Vercel ficou de 5 a 18 vezes mais rápido que o classificador do ChatGPT. Saída de graça.

#jev #ia #chatgpt #automacao
```

## Fontes

Conferidas em 18/09/2026.

- TypeSafe / Diogo Almeida (ex-OpenAI, InstructGPT/ChatGPT), lançamento ~15/09/2026. Jev não gera texto: devolve decisões e probabilidades entre opções definidas. Latência declarada 70–500 ms. Entrada US$ 0,042 / milhão de tokens; saída gratuita.
  https://typesafe.ai/blog/introducing-system-one-models-and-jev
- TechCrunch, 18/09/2026: Pranit Sharma (Vercel) trocou o classificador do ChatGPT Luna 5.6 pelo Jev, 5 a 18 vezes mais rápido e com mais acerto. Gemini ligeiramente mais preciso em e-mail, 10–20× mais caro.
  https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/
- Olhar Digital, 17/09/2026: triagem de chamado, classificação, checagem de texto gerado por outra IA. Escolher a opção errada continua possível.
  https://olhardigital.com.br/2026/09/17/inteligencia-artificial/conheca-o-jev-nova-ia-do-cocriador-do-chatgpt-que-nao-conversa-e-foi-criada-para-tomar-decisoes-dentro-de-softwares/
- OpenRouter: `typesafe/jev-1.13`, listado 18/09/2026.

A fala usa o caso Vercel e os números redondos (meio segundo, saída de graça). Multiplicadores
internos da TypeSafe (193×, 444×) ficam fora da boca.

## CTA e automação

- Keyword: `JEV`.
- Entrega no DM: link pra testar (early access TypeSafe e/ou OpenRouter) e pra que serve
  (triar / checar a outra IA), sem chamar de artigo na fala.

## Pendências

- [x] Caminho do vídeo raw: `IMG_8187.mov`.
- [ ] Logo TypeSafe / wordmark JEV (PNG com alfa) em `assets/brands/` ou na pasta do projeto.
- [ ] Print ou card da prova Vercel (5–18×), se for usar prova de tela.
- [ ] Automação comment→DM com keyword `JEV`.
