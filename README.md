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
  rejeitando faixas incompatíveis com a ordem de grandeza do resultado.
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
- **Valores de alerta** que sugerem procurar avaliação médica sem esperar a rotina.
- **Perguntas para levar à consulta**, geradas a partir dos padrões encontrados.

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

Para acrescentar um exame, basta adicionar um objeto em `ANALYTES` com `id`, `nome`,
`cat`, `un`, `ali` (sinônimos como aparecem nos laudos), `ref` e os textos `simples`,
`tecnico`, `alto` e `baixo`.

O objeto `window.EXAMES` expõe as funções internas (`extractFromLines`, `classify`,
`computeDerived`, `findPatterns`…) para inspeção no console e para testes automatizados.
