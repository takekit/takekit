# 09-jev — artigo-copy (v2 progressiva)

## 1. Briefing

- Papel ATA: explicar ferramenta nova que muda automação. Público: quem usa IA no trabalho e nunca ouviu falar de modelo que decide.
- Promessa do CTA (fala): "Comenta JEV aqui embaixo que eu te mando o link direto." Keyword: `JEV`.
- Escada progressiva: caixa lotada → pedir textão ao LLM → texto não cabe no código + lento e caro → precisar de resposta que o código entenda → Jev decide entre opções → precisar saber quando confiar → probabilidade → limite das opções.
- Ressalvas: Jev escolhe entre opções que você define, então pode escolher a errada. Qualidade varia com a tarefa. Parte dos testes usa resposta de outra IA como referência.
- Fatos verificados com data:
  - TypeSafe AI, Diogo Almeida (ex-OpenAI, InstructGPT/ChatGPT), System One Models + Jev em early access, anúncio 15/09/2026, post 18/09/2026. https://typesafe.ai/blog/introducing-system-one-models-and-jev (acesso 19/09/2026)
  - Jev não gera texto. Devolve decisão tipada + probabilidade calibrada. Latência 70-500ms. Entrada US$ 0,042 / milhão de tokens, saída gratuita. Docs: https://docs.typesafe.ai/
  - TechCrunch 18/09/2026: Pranit Sharma (Vercel) trocou classificador ChatGPT Luna 5.6 por Jev, 5 a 18 vezes mais rápido e com mais acerto. https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/
  - Mesmo TechCrunch: teste Nikhil Mudholkar (Bryo AI), Gemini ligeiramente mais preciso em e-mail, 10 a 20 vezes mais caro. Jev devolve probabilidade real.
  - Olhar Digital 17/09/2026: triagem de chamado, classificação, checagem de texto gerado por outra IA. Escolher a opção errada continua possível. https://olhardigital.com.br/2026/09/17/inteligencia-artificial/conheca-o-jev-nova-ia-do-cocriador-do-chatgpt-que-nao-conversa-e-foi-criada-para-tomar-decisoes-dentro-de-softwares/
  - OpenRouter: `typesafe/jev-1.13`, listado 18/09/2026, entrada $0,042/M, saída $0. https://openrouter.ai/models/typesafe/jev-1.13 (acesso 19/09/2026)
- Frontmatter:
  - PT slug: `jev-ia-que-decide-sozinha` | translationKey: `jev-decides` | URL: `https://www.oldaque.com/pt-BR/blog/jev-ia-que-decide-sozinha`
  - EN slug: `jev-ai-that-decides` | translationKey: `jev-decides` | URL: `https://www.oldaque.com/en/blog/jev-ai-that-decides`
- Assets: sem `assets/`. Só diagrama. Embed do Reel depois de publicado.

## 2. Copy PT (pronta para MDX)

```mdx
---
title: "Jev: a IA que não conversa, ela decide"
description: "O que é o Jev da TypeSafe, como ele escolhe entre opções com probabilidade, e onde testar grátis: lista de espera, Vercel e OpenRouter."
date: "2026-09-19"
translationKey: "jev-decides"
---

A Camila cuida do suporte de uma loja pequena. Três pessoas, umas 200 mensagens por dia: defeito, troca, cobrança, dúvida simples. Ela quer que o sistema separe isso sozinho.

A primeira tentativa parece óbvia: mandar cada mensagem para o ChatGPT e pedir um resumo do que fazer. Para 5 mensagens funciona. Para 200 quebra em três pontos concretos. A Camila precisa ler o resumo e decidir manualmente para onde a mensagem vai, porque o texto vem livre e o sistema dela só entende um campo exato. Cada resposta demora segundos, e a fila anda em milissegundos. E uma vez a IA inventou a categoria "urgente VIP", que nem existe no cadastro, e a mensagem se perdeu.

Então a necessidade muda. Ela não precisa de um redator dentro do código. Precisa de um porteiro. Alguém que olhe cada mensagem e responda curto: é troca, com 94% de certeza. Pode encaminhar.

É para isso que serve o Jev, da TypeSafe AI. Empresa do Diogo Almeida, um dos pesquisadores por trás do ChatGPT. A Camila define as opções antes, o Jev recebe a mensagem e devolve só a decisão, com probabilidade calibrada. Nada de parágrafo. O código já entende e age.

Agora falta resolver o erro. E quando ele marca errado? É aqui que a probabilidade vira regra de operação. Com 94%, o sistema encaminha direto. Com 57%, manda para a Camila revisar. A mesma lógica vale para triar chamado, definir rota de vendas ou conferir se outra IA prometeu um desconto que não está no cadastro. A checagem fica barata porque a saída é gratuita e a entrada custa US$ 0,042 por milhão de tokens, com resposta entre 70 e 500 milissegundos.

Na prática, um engenheiro da Vercel trocou um classificador feito com ChatGPT Luna 5.6 pelo Jev e ficou de 5 a 18 vezes mais rápido, com mais acerto. Em outro teste com e-mails, o Gemini foi um pouco mais preciso, mas custou de 10 a 20 vezes mais. A TypeSafe chama isso de System One Model: modelo para decisão rápida, não para conversa.

Limite real: quem escreve as opções é você. Opção mal escrita vira erro confiante. E parte dos testes divulgados usa resposta de outra IA como referência, não prova final.

Onde testar:

1. [Lista de espera oficial com early access](https://console.typesafe.ai/) e [site da TypeSafe](https://typesafe.ai/). Anúncio completo: [Introducing System One Models e Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
2. [Documentação para ver como definir opções e ler a saída](https://docs.typesafe.ai/)
3. [Jev 1.13 no OpenRouter, para chamar via API hoje](https://openrouter.ai/typesafe/jev-1.13)
4. [AI Gateway da Vercel, para testar sem custo por enquanto](https://vercel.com/ai-gateway)

Começa pelo item 1 para entrar na fila e usa o 3 para testar hoje.

Onde conferir: post da TypeSafe de 18/09/2026, TechCrunch de 18/09/2026 e Olhar Digital de 17/09/2026.
```

## 3. Copy EN (pronta para MDX)

```mdx
---
title: "Jev: the AI that does not chat, it decides"
description: "What TypeSafe Jev is, how it picks between options with probability, and where to try it: waitlist, Vercel and OpenRouter."
date: "2026-09-19"
translationKey: "jev-decides"
---

Camila runs support for a small store. Three people, around 200 messages a day: defects, exchanges, billing, simple questions. She wants the system to sort it alone.

The first attempt looks obvious: send each message to ChatGPT and ask for a summary of what to do. For 5 messages it works. For 200 it breaks in three concrete places. Camila still has to read the summary and decide where each message goes, because the text comes back free form and her system only understands one exact field. Each answer takes seconds, and the queue moves in milliseconds. And once the AI invented the category "VIP urgent", which does not exist in the database, and the message got lost.

So the need changes. She does not need a writer inside her code. She needs a bouncer. Someone who looks at each message and answers short: this is an exchange, 94% sure. Route it.

That is what Jev is for, from TypeSafe AI. Company of Diogo Almeida, one of the researchers behind ChatGPT. Camila defines the options up front, Jev takes the message and returns only the decision, with calibrated probability. No paragraph. Code can act on it.

Now one problem remains: what when it labels wrong? This is where probability becomes the operating rule. At 94%, the system routes it. At 57%, it sends it to Camila for review. Same logic to triage tickets, set a sales route, or check if another AI promised a discount that is not in the database. The check stays cheap because output is free and input costs $0.042 per million tokens, with answers in 70 to 500 milliseconds.

In practice, an engineer at Vercel swapped a ChatGPT Luna 5.6 classifier for Jev and got 5 to 18 times faster, with better accuracy. In another email test, Gemini was slightly more accurate but cost 10 to 20 times more. TypeSafe calls this a System One Model: built for fast decisions, not chat.

Real limit: you write the options. Poorly written options turn into confident errors. And part of the published tests use another AI answer as reference, not final proof.

Where to try:

1. [Official waitlist with early access](https://console.typesafe.ai/) and [TypeSafe site](https://typesafe.ai/). Full announcement: [Introducing System One Models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
2. [Docs to see how to define options and read output](https://docs.typesafe.ai/)
3. [Jev 1.13 on OpenRouter, to call via API today](https://openrouter.ai/typesafe/jev-1.13)
4. [Vercel AI Gateway, to try at no cost for now](https://vercel.com/ai-gateway)

Start with 1 to join the line and use 3 to test today.

Sources: TypeSafe post 09/18/2026, TechCrunch 09/18/2026, Olhar Digital 09/17/2026.
```

## 4. Spec do diagrama

SVG inline, fileira em 3 passos: entrada bagunçada -> Jev no meio -> decisão com probabilidade. Texto na mesma linha do tag.
- Caixa 1 (contorno): "200 mensagens da loja"
- Caixa 2 (contorno): "JEV escolhe entre opções"
- Caixa 3 (contorno): "troca 94%, encaminha"
- Seta âmbar #e79a39 entre elas. Fonte herda Instrument Sans.

## 5. Spec da automação (sem mudança)

- Keyword: `JEV` contains. postScope specific com mediaId quando sair. Reply + DM 2 msgs já em draft `9100c5c9-c191-4294-93ee-29b5d5a40af3`. DM msg_2 aponta para https://www.oldaque.com/pt-BR/blog/jev-ia-que-decide-sozinha
