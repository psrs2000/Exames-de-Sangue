# Analisador de Exames de Sangue

Aplicativo de página única (um `index.html`) que lê o **PDF de um laudo laboratorial
brasileiro**, extrai os resultados e monta uma análise explicada — em **linguagem simples**
ou em **linguagem técnica**, alternável com um clique.

> ⚕️ **Não é um diagnóstico.** A ferramenta compara resultados com faixas de referência
> gerais e não conhece histórico, sintomas nem medicamentos de quem fez o exame.
> Quem interpreta o seu caso é o seu médico.

## Como usar

Abra o `index.html` no navegador (duplo clique já funciona) ou publique a pasta como
site estático. Não há build, dependências de projeto nem servidor.

1. **Envie o PDF** do laudo (ou clique em *Ver exemplo*, ou digite os valores à mão).
2. **Confira os valores** lidos e complete seu perfil: sexo, idade, peso, altura,
   circunferência abdominal, pressão arterial, horas de jejum, gestação, atleta.
3. **Analise** e leia o relatório, alternando entre *Explicação simples* e *Técnico*.
   Dá para imprimir, salvar em PDF e baixar os dados em JSON.

A pressão arterial aceita as duas formas de escrever: `120 / 80` ou `12 / 8`.

Os arquivos **não saem do seu computador**: a leitura do PDF acontece dentro do navegador,
e nada é enviado a servidor nenhum.

A biblioteca [pdf.js](https://mozilla.github.io/pdf.js/), que faz a leitura, vem da pasta
`vendor/` — versionada junto com o app justamente para que ele funcione **sem internet** e
sem depender de CDN. Se por algum motivo ela faltar, o app recorre a três CDNs em sequência.
Para regravá-la a partir do `node_modules`:

```bash
npm install && npm run vendor
```

**Para usar no celular sem publicar nada**, sirva a pasta na sua rede local:

```bash
npx serve .        # mostra um endereço como http://192.168.0.10:3000
```

Abra esse endereço no celular, com os dois aparelhos no mesmo Wi-Fi. O histórico de cada
aparelho é independente — quem viaja entre eles é o arquivo `historico-exames-*.json`.

## Publicar na Cloudflare

Publicar dá ao app um endereço fixo, que abre no celular em qualquer lugar, sem depender de
computador ligado. O repositório **continua privado**: o que fica acessível é só o app, que
não carrega dado nenhum dentro de si.

A Cloudflare hoje importa repositórios como **Worker com assets estáticos** (não como Pages).
No painel: **Workers & Pages → Create → Import a repository**, escolha este repositório e
deixe as configurações como vierem. Não é preciso preencher comando de build.

Quem manda no que é publicado são dois arquivos versionados aqui:

- **`wrangler.jsonc`** — diz que é um site estático servido da raiz do repositório
- **`.assetsignore`** — tira da publicação tudo que não é o site

O `.assetsignore` não é detalhe: sem ele o `wrangler` tenta subir a pasta inteira, inclusive o
`node_modules` que ele mesmo acabou de instalar, e o build morre em
`Asset too large … workerd with a size of 127 MiB`. Com ele, sobem só quatro arquivos:

```
index.html
robots.txt
vendor/pdf.min.mjs
vendor/pdf.worker.min.mjs
```

O `_headers` é lido à parte, como metarquivo: aplica os cabeçalhos de segurança sem ser servido.
O `robots.txt` mantém a ferramenta fora dos buscadores.

Para conferir o que seria publicado, sem publicar nada:

```bash
npx wrangler deploy --dry-run
```

Cada `git push` no `main` republica sozinho. Depois, no iPhone: abra o endereço no Safari →
**Compartilhar → Adicionar à Tela de Início**.

O histórico do celular é separado do histórico do computador: cada navegador guarda o seu.
Para levar um para o outro, use *Baixar histórico* e *Importar histórico*.

## O que ele faz

- **Leitura do PDF** reconstruindo as linhas pelas coordenadas do texto, o que cobre os
  dois formatos mais comuns nos laudos brasileiros: tabela (`Hemoglobina: 12,3 g/dl 13,0 A 17,5 g/dl`)
  e bloco (`TÍTULO DO EXAME` … `RESULTADO: 596 pg/mL`).
- **~70 exames reconhecidos** por sinônimos (hemograma, lipídios, glicemia, função renal
  e hepática, tireoide, vitaminas, ferro, minerais, inflamação, marcadores cardiovasculares).
- **Faixas do próprio laboratório**: quando o laudo declara a referência, ela é extraída e
  usada no lugar da faixa genérica — respeitando sexo, descartando faixas pediátricas e
  rejeitando faixas incompatíveis com a ordem de grandeza do resultado. Exames cuja referência
  é uma **meta** (LDL, ApoB, triglicerídeos: "desejável até X") não aceitam faixa populacional
  de dois lados no lugar do alvo — a ApoB de 128 mg/dL cabe no 46–174 do laboratório e ainda
  assim está acima de qualquer alvo terapêutico.
- **Conversão de unidades** (mmol/L, µmol/L, nmol/L, mcg/dL, 10³/µL, mil/mm³ etc.).
- **Checagem de coerência interna**: um laudo tem relações fixas entre os próprios números —
  HCM é hemoglobina ÷ hemácias, VCM é hematócrito ÷ hemácias, o colesterol total é a soma das
  frações, a bilirrubina direta não passa da total, os percentuais do diferencial somam 100.
  Quando as contas não fecham, a tela de conferência avisa, marca os campos envolvidos e aponta
  o valor que entra em mais contas erradas. É o único jeito de pegar um erro de leitura cujo
  número, isolado, parece plausível.
- **Defesas contra ler o número errado**: tabelas de *resultados anteriores* são ignoradas (os números
  são reais, mas de outras coletas), números seguidos de palavras que não são unidade ("12 horas") são
  descartados, linhas de referência continuadas pertencem ao exame da linha anterior, e a etiqueta
  `PDF` de cada valor mostra, ao passar o mouse, a linha exata do laudo de onde ele saiu.
- **Cálculos derivados**: IMC, LDL por Friedewald, colesterol não-HDL, índice de Castelli,
  razão TG/HDL, **relação ureia/creatinina**, **relação ApoB/ApoA-1**, HOMA-IR, glicemia média
  estimada, TFG por CKD-EPI 2021, saturação de transferrina, bilirrubina indireta, relação
  AST/ALT, cálcio corrigido, razão neutrófilos/linfócitos.
- **Padrões cruzados** apresentados como hipóteses para discutir com o médico: anemia
  ferropriva, anemia macrocítica, pré-diabetes e diabetes, resistência à insulina,
  dislipidemia aterogênica, critérios laboratoriais de síndrome metabólica, hipo e
  hipertireoidismo, padrão hepatocelular e colestático, filtração renal reduzida,
  deficiência de vitamina D, entre outros.
- **Ordenação por relevância clínica**, e não por tamanho do desvio: cada exame tem um peso
  (`PESO_CLINICO`) e sobe de prioridade quando participa de um padrão encontrado
  (`PADRAO_EXAMES`). O que raramente decide conduta sozinho — CHCM, hemácias, percentuais do
  diferencial — fica recolhido num bloco de "menor peso clínico".
- **Exames que faltaram**: a partir dos achados, o app lista o que *não* foi medido e ajudaria,
  com o motivo de cada sugestão (anemia sem saturação de transferrina, reticulócitos ou PCR;
  dislipidemia sem ApoB ou Lp(a); alteração metabólica sem albuminúria na urina; e assim por diante).
- **Impressão pensada para levar ao médico**: o formulário de conferência fica fora do papel,
  os blocos recolhidos são abertos e entra uma tabela compacta com todos os exames, resultado,
  referência e situação.
- **Valores de alerta** que sugerem procurar avaliação médica sem esperar a rotina.
- **Perguntas para levar à consulta**, geradas a partir dos padrões encontrados.

## Histórico de exames

O histórico vive em **duas camadas**, e a distinção importa:

- **IndexedDB do navegador** — a conveniência do dia a dia: abriu o app, seus exames estão lá.
- **O arquivo `historico-exames-AAAA-MM-DD.json`** — a **fonte de verdade**. Armazenamento de
  navegador é cache, não arquivo: limpar os dados do site apaga tudo. Baixe o arquivo de tempos
  em tempos e guarde junto dos PDFs originais. É ele que atravessa trocas de computador.

Como funciona:

- **Sexo e idade são lidos do cabeçalho do laudo** quando estão lá (`Sexo: M`, `(45 anos)`,
  `Data de Nascimento`), porque decidem faixas de referência — deixar isso no padrão do formulário
  já trocou a faixa de TGP de um paciente.
- A **data da coleta é lida do próprio laudo** (`DATA DA COLETA`, com vários formatos aceitos;
  na ausência, a data que mais aparece no documento, ignorando datas antigas como a de nascimento).
- Cada valor guarda a **faixa de referência vigente naquela data**. Isso não é preciosismo:
  laboratórios mudam método e faixa — no mesmo laboratório, o T4 livre passou de `0,89–1,61`
  para `0,96–1,73` em quatro meses. Aplicar a faixa de hoje ao passado inventaria alterações
  que nunca existiram.
- A chave é a **data da coleta**, nunca o nome do arquivo. Dois PDFs do mesmo dia (laudos de
  unidades diferentes) **se somam** no mesmo exame em vez de duplicar.
- Com dois ou mais exames, o relatório ganha o card **Evolução**, com **todos** os exames do laudo
  e sparkline sobre a faixa de referência. Nada é filtrado: a ordem é que trabalha, trazendo para
  cima o que mudou mais do que aquele exame costuma oscilar (o limiar é por exame — 5% no PSA e na
  creatinina, 25% no ferro sérico e na CPK), o que cruzou a faixa e o que segue alterado. Exames sem
  par no laudo anterior aparecem como *primeira medida*.
- **Qual exame analisar é escolha sua.** O app não abre nada sozinho: no histórico, "Abrir análise"
  leva direto ao relatório daquele exame, com a evolução calculada **até a data dele**. Abrir um
  exame do meio mostra a evolução até aquele ponto, e não a história inteira.

O arquivo exportado:

```jsonc
{ "versao": 1,
  "exames": [
    { "data": "2026-05-08",
      "perfil": { "sexo": "M", "idade": 67, "peso": 78, "cintura": 98, "pa": "120/80" },
      "valores": {
        "t4_livre": { "v": 1.25, "un": "ng/dL", "ref": [0.89, 1.61], "refLab": true, "origem": "pdf" }
      } } ] }
```

### Leitura da série

Com histórico, o relatório ganha um segundo card com três análises que exame isolado nenhum
responde. O que separa sinal de ruído nelas é o **RCV** (valor de mudança de referência, ou
diferença crítica), `RCV = 1,41 × 1,96 × √(CVa² + CVi²)`, onde `CVi` é a variação biológica
intraindividual do exame. Os CVi usados são estimativas de literatura e o CVa entra como uma
constante conservadora — por isso o app trata os resultados como suporte, não como veredito.

1. **Achados persistentes**, com a direção junto — "hemoglobina abaixo da referência em 11 coletas
   seguidas, **em melhora**: 9,2 → 12,1 g/dL". Dizer só "sempre abaixo" esconderia uma recuperação
   de 3 g/dL. É a repetição que transforma um achado isolado em algo a investigar; a própria
   definição de doença renal crônica exige persistência por ≥3 meses.
2. **Tendências**, separadas pela natureza do exame antes de qualquer estatística:
   - **exames sentinela** (`SENTINELA`) — PSA, creatinina e TFG, TSH e T4 livre, PTH e cálcio,
     hemoglobina e plaquetas, enzimas hepáticas, HbA1c: aqui a tendência **é** o sinal, e uma
     direção sustentada pode anteceder doença mesmo com tudo dentro da faixa. Cada um traz uma
     linha dizendo por que acompanhar, e o critério é mais sensível;
   - **exames que respondem a hábito, tratamento ou variação natural** — lipídios, glicose,
     ferro, vitaminas, CPK: a tendência importa, mas conta outra história. Ficam num bloco
     recolhido e exigem variação bem maior para aparecer;
   - **exames em que tendência não diz nada** (`SEM_TENDENCIA`) — percentuais do diferencial,
     índices derivados de outro exame: ficam fora da análise, porque ali uma "tendência" é
     aritmética ou ruído.

   Dentro disso, três formas possíveis, escolhidas por comparação de modelos — descrever
   um salto como "subindo X por ano" mente sobre o formato da série:
   - **reta** — inclinação em **unidades por ano**; para o PSA, também o **tempo de duplicação**;
   - **mudança de patamar** — subiu (ou caiu) e estabilizou noutro nível, com a data do salto;
   - **reversão** — subiu e voltou a cair (ou o contrário), com o pico e o quanto recuou desde ele,
     dizendo se a volta já supera a oscilação esperada ou ainda não.

   Em todos os casos: ≥3 coletas, ≥6 meses e variação total acima do RCV. Uma tendência que
   atravessa uma troca de faixa do laboratório vem marcada, porque parte da variação pode ser
   troca de método.
3. **Fora do seu padrão** — a partir de 5 coletas, compara o valor de hoje com a sua própria média e
   dispersão. Para exames de baixo *índice de individualidade* (`CVi/CVg < 0,6`, caso de hemoglobina,
   creatinina, cálcio e sódio), a faixa populacional é um guia ruim: um valor "normal" que foge do seu
   histórico diz mais que a faixa impressa no laudo.

Há ainda um aviso automático de **troca de método**: quando a faixa declarada pelo laboratório muda
entre duas coletas, o método provavelmente mudou, e valores de métodos diferentes não são
diretamente comparáveis. Foi o que aconteceu com o T4 livre entre maio e setembro de 2026.

Os PDFs originais **não** são guardados pelo app — você já os tem, e incluí-los no arquivo daria
a falsa impressão de backup completo.

## Limitações conhecidas

- Laudos **escaneados como imagem** (sem camada de texto) não são lidos — não há OCR.
  Nesse caso o app avisa e oferece a digitação manual.
- As faixas de referência são de **adultos**; gestação e pediatria não são contempladas
  (o app avisa quando "gestante" está marcado).
- **O leitor de PDF foi calibrado em poucos formatos.** Dois laudos reais de um laboratório e dois
  sintéticos cobrem os leiautes mais comuns (blocos e tabela), mas cada laboratório inventa o seu.
  Em formato desconhecido a leitura pode vir incompleta — por isso o passo 2 existe.
- A leitura automática pode errar em formatos incomuns. Por isso o passo 2 sempre mostra
  os valores lidos, editáveis, com a etiqueta `PDF` no que veio do laudo e `LAB` no que
  usa a faixa do laboratório.

## Testes

```bash
npm install
npx playwright install chromium   # só na primeira vez
npm test
```

A suíte roda o app de verdade num Chromium headless e confere 87 comportamentos. Ela existe
principalmente para **não deixar o app viciar num único laudo e num único paciente**:

| Fixture | O que protege |
|---|---|
| `laudo-blocos.pdf` | formato de laudo em blocos (`TÍTULO` … `RESULTADO:`), com as armadilhas que já causaram bugs: rodapé entre o cabeçalho e o resultado, `(A1C)`, seção pediátrica, faixas por sexo, percentual e absoluto na mesma linha, meta terapêutica × faixa populacional |
| `laudo-tabela.pdf` | formato de laudo em tabela, de outro laboratório fictício, com abreviações pontuadas (`V.C.M.`) — foi ele que revelou que o leitor estava preso a um único leiaute |
| `laudo-bullets.pdf` | resultados marcados com hífen (`- COLESTEROL HDL : 32 mg/dL`), nota com "jejum de 12 horas", referência continuada em outra linha e **tabela de resultados anteriores** — três formas diferentes de o leitor pegar o número errado |
| `casos/*.json` | sete perfis clínicos que o autor do app não tem: anemia ferropriva em mulher jovem, gestante, diabetes com síndrome metabólica, atleta com hipertireoidismo, padrão colestático com plaquetopenia, potássio crítico com função renal reduzida, e um hemograma internamente incoerente |
| `serie-longa.json` | série de 11 coletas em 2,7 anos: persistência com direção, reversão, mudança de patamar, tendência com tempo de duplicação, troca de método, valores calculados no histórico |

Um último bloco carrega o app com **toda a rede bloqueada** e exige que ele ainda leia o PDF, sem
nenhuma requisição externa. Foi ele que revelou que o `vendor/` nunca havia funcionado: o import
sem `./` virava um *bare specifier*, falhava calado e o app caía no CDN.

Os três laudos em PDF são **sintéticos** — foram gerados a partir dos `.html` ao lado deles e não
correspondem a nenhuma pessoa. A série longa foi **de-identificada** a partir de um histórico real:
datas deslocadas por um valor fixo (mantendo os intervalos), perfil substituído por um sintético e
valores perturbados em ±2%, bem abaixo de qualquer RCV. Ela preserva os *formatos* das séries, que
é o que a suíte precisa testar, e não os resultados de ninguém.

## Estrutura do código

Tudo vive em `index.html`, em seções numeradas dentro do `<script type="module">`:

| Seção | Conteúdo |
|---|---|
| 1 | Base de referência (`ANALYTES`): sinônimos, unidades, faixas por sexo, textos leigo/técnico |
| 2 | Utilidades: normalização, números no formato brasileiro, índice de sinônimos |
| 3 | Leitura do PDF: reconstrução de linhas, extração de valores e das faixas do laboratório |
| 4 | Classificação (normal / abaixo / acima / atenção) |
| 4b | Coerência interna do laudo (`COERENCIA`, `checarCoerencia`) |
| 5 | Cálculos derivados |
| 6 | Padrões cruzados (`PADRAO_EXAMES` liga cada padrão aos exames que ele envolve) |
| 6b | Sugestão de exames ausentes (`sugerirExames`) |
| 7–10 | Interface, relatório, exportação e eventos |
| 11 | Histórico: IndexedDB, data da coleta, exportar/importar, evolução e sparkline |
| 13 | Leitura da série: persistência, tendência com inclinação por ano, faixa pessoal, RCV |
| 12 | Início: carrega o histórico e o último perfil usado |

Para acrescentar um exame, basta adicionar um objeto em `ANALYTES` com `id`, `nome`,
`cat`, `un`, `ali` (sinônimos como aparecem nos laudos), `ref` e os textos `simples`,
`tecnico`, `alto` e `baixo`.

O objeto `window.EXAMES` expõe as funções internas (`extractFromLines`, `classify`,
`computeDerived`, `findPatterns`…) para inspeção no console e para testes automatizados.
