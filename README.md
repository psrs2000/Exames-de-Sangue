# Analisador de Exames de Sangue

Aplicativo de página única (um `index.html`) que lê o **PDF de um laudo laboratorial
brasileiro**, extrai os resultados e monta uma análise explicada — em **linguagem simples**
ou em **linguagem técnica**, alternável com um clique.

> ⚕️ **Não é um diagnóstico.** A ferramenta compara resultados com faixas de referência
> gerais e não conhece histórico, sintomas nem medicamentos de quem fez o exame.
> Quem interpreta o seu caso é o seu médico.

## Como usar

Abra o `index.html` no navegador (duplo clique já funciona) ou publique a pasta no
GitHub Pages. Não há build, dependências de projeto nem servidor.

1. **Envie o PDF** do laudo (ou clique em *Ver exemplo*, ou digite os valores à mão).
2. **Confira os valores** lidos e complete seu perfil: sexo, idade, peso, altura,
   circunferência abdominal, pressão arterial, horas de jejum, gestação, atleta.
3. **Analise** e leia o relatório, alternando entre *Explicação simples* e *Técnico*.
   Dá para imprimir, salvar em PDF e baixar os dados em JSON.

A pressão arterial aceita as duas formas de escrever: `120 / 80` ou `12 / 8`.

Os arquivos **não saem do seu computador**: a leitura do PDF acontece dentro do navegador.
A única requisição externa é o download da biblioteca [pdf.js](https://mozilla.github.io/pdf.js/)
por CDN, feita uma vez. Para uso totalmente offline, hospede os dois arquivos do pdf.js
junto ao app e declare-os antes do script do app:

```html
<script>
  window.PDFJS_SOURCES = [{lib:'vendor/pdf.min.mjs', worker:'vendor/pdf.worker.min.mjs'}];
</script>
```

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

- A **data da coleta é lida do próprio laudo** (`DATA DA COLETA`, com vários formatos aceitos;
  na ausência, a data que mais aparece no documento, ignorando datas antigas como a de nascimento).
- Cada valor guarda a **faixa de referência vigente naquela data**. Isso não é preciosismo:
  laboratórios mudam método e faixa — no mesmo laboratório, o T4 livre passou de `0,89–1,61`
  para `0,96–1,73` em quatro meses. Aplicar a faixa de hoje ao passado inventaria alterações
  que nunca existiram.
- A chave é a **data da coleta**, nunca o nome do arquivo. Dois PDFs do mesmo dia (laudos de
  unidades diferentes) **se somam** no mesmo exame em vez de duplicar.
- Com dois ou mais exames, o relatório ganha o card **Evolução**: variações de 10% ou mais, ou
  que cruzaram a faixa, ordenadas por relevância clínica, com sparkline sobre a faixa de referência.
- **O app retoma sozinho de onde parou**: ao abrir, ou logo depois de importar o arquivo, o exame
  mais recente é carregado e a análise com a evolução já aparece — sem precisar reprocessar PDF nenhum.

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

Os PDFs originais **não** são guardados pelo app — você já os tem, e incluí-los no arquivo daria
a falsa impressão de backup completo.

## Limitações conhecidas

- Laudos **escaneados como imagem** (sem camada de texto) não são lidos — não há OCR.
  Nesse caso o app avisa e oferece a digitação manual.
- As faixas de referência são de **adultos**; gestação e pediatria não são contempladas
  (o app avisa quando "gestante" está marcado).
- A leitura automática pode errar em formatos incomuns. Por isso o passo 2 sempre mostra
  os valores lidos, editáveis, com a etiqueta `PDF` no que veio do laudo e `LAB` no que
  usa a faixa do laboratório.

## Estrutura do código

Tudo vive em `index.html`, em seções numeradas dentro do `<script type="module">`:

| Seção | Conteúdo |
|---|---|
| 1 | Base de referência (`ANALYTES`): sinônimos, unidades, faixas por sexo, textos leigo/técnico |
| 2 | Utilidades: normalização, números no formato brasileiro, índice de sinônimos |
| 3 | Leitura do PDF: reconstrução de linhas, extração de valores e das faixas do laboratório |
| 4 | Classificação (normal / abaixo / acima / atenção) |
| 5 | Cálculos derivados |
| 6 | Padrões cruzados (`PADRAO_EXAMES` liga cada padrão aos exames que ele envolve) |
| 6b | Sugestão de exames ausentes (`sugerirExames`) |
| 7–10 | Interface, relatório, exportação e eventos |
| 11 | Histórico: IndexedDB, data da coleta, exportar/importar, evolução e sparkline |
| 12 | Início: carrega o histórico e o último perfil usado |

Para acrescentar um exame, basta adicionar um objeto em `ANALYTES` com `id`, `nome`,
`cat`, `un`, `ali` (sinônimos como aparecem nos laudos), `ref` e os textos `simples`,
`tecnico`, `alto` e `baixo`.

O objeto `window.EXAMES` expõe as funções internas (`extractFromLines`, `classify`,
`computeDerived`, `findPatterns`…) para inspeção no console e para testes automatizados.
