/* Suíte de regressão do Analisador de Exames de Sangue.
 *
 *   npm install && npm test
 *
 * Roda o app de verdade num Chromium headless e confere o comportamento contra
 * fixtures fixos. Nenhum dado pessoal: os laudos são sintéticos e a série longa
 * foi de-identificada (datas deslocadas, perfil substituído, valores perturbados).
 */
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(raiz, 'tests', 'fixtures');
const PORTA = 8121;

/* --- servidor: o app na raiz; /vendor vem da pasta versionada e, se ela faltar,
       do node_modules (assim a suíte roda mesmo sem "npm run vendor") --- */
const MIME = {'.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript',
              '.json':'application/json', '.pdf':'application/pdf'};
const servidor = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let alvo = path.join(raiz, url === '/' ? 'index.html' : url);
  if (url.startsWith('/vendor/') && !fs.existsSync(alvo))
    alvo = path.join(raiz, 'node_modules', 'pdfjs-dist', 'build', url.slice(8));
  if (!alvo.startsWith(raiz) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()){
    res.writeHead(404); return res.end('não encontrado');
  }
  res.writeHead(200, {'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream'});
  fs.createReadStream(alvo).pipe(res);
});

/* --- asserções --- */
let passou = 0; const falhas = [];
function ok(condicao, titulo, detalhe){
  if (condicao){ passou++; console.log('  \x1b[32m✓\x1b[0m ' + titulo); }
  else { falhas.push(titulo + (detalhe ? ` — ${detalhe}` : '')); console.log('  \x1b[31m✗\x1b[0m ' + titulo + (detalhe ? `\n      ${detalhe}` : '')); }
}
const igual = (obtido, esperado, titulo) =>
  ok(JSON.stringify(obtido) === JSON.stringify(esperado), titulo, `esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
const perto = (obtido, esperado, tol, titulo) =>
  ok(Math.abs(obtido - esperado) <= tol, titulo, `esperado ${esperado} ±${tol}, obtido ${obtido}`);

/* --- utilidades de página --- */
async function novaPagina(ctx, erros){
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  await p.addInitScript(() => {
    window.PDFJS_SOURCES = [{lib:'/vendor/pdf.min.mjs', worker:'/vendor/pdf.worker.min.mjs'}];
  });
  await p.goto(`http://localhost:${PORTA}/index.html`);
  return p;
}
const lerPdf = async (p, arquivo) => {
  await p.setInputFiles('#file', path.join(fixtures, arquivo));
  await p.waitForSelector('#card-values:not(.hidden)', {timeout:60000});
  await p.waitForFunction(() => !!document.querySelector('#coleta').value, null, {timeout:60000});
  return p.evaluate(() => ({
    data: document.querySelector('#coleta').value,
    valores: {...window.EXAMES.state.values},
    perfil: {sexo: document.querySelector('#sex').value, idade: +document.querySelector('#age').value},
    labRefs: {...window.EXAMES.state.labRefs}
  }));
};
const importar = async (p, arquivo) => {
  await p.click('#btn-hist-importar2');
  await p.setInputFiles('#file-hist', path.join(fixtures, arquivo));
  await p.waitForSelector('#hist-status .alert');
};
const abrirColeta = async (p, pos) => {
  await p.locator('.hist-item').nth(pos).locator('button.btn').click();
  await p.waitForSelector('#card-report:not(.hidden)');
};
const textoDoCard = async (p, titulo) => {
  const c = p.locator('#card-report .card').filter({hasText: titulo});
  /* textContent (e não innerText) para enxergar também os blocos recolhidos */
  return await c.count() ? (await c.first().textContent()).replace(/\s+/g, ' ') : '';
};

/* ====================== execução ====================== */
if (!fs.existsSync(path.join(raiz, 'node_modules', 'pdfjs-dist'))){
  console.error('Faltam dependências de teste. Rode: npm install');
  process.exit(2);
}
servidor.listen(PORTA);
const navegador = await chromium.launch();
const erros = [];

try {
  /* ---------- 1. leitura de PDF: formato em blocos ---------- */
  console.log('\n\x1b[1mLaudo sintético em blocos (armadilhas conhecidas do formato)\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    const r = await lerPdf(p, 'laudo-blocos.pdf');
    igual(r.data, '2026-05-22', 'data da coleta vem do laudo, não da impressão');
    ok(Object.keys(r.valores).length >= 22, 'ao menos 22 exames extraídos', `extraiu ${Object.keys(r.valores).length}`);
    igual(r.valores.hba1c, 6, 'HbA1c lê 6,0 e não o "1" de "(A1C)"');
    igual(r.valores.glicose, 118, 'rodapé "Resultado impresso" não rouba o RESULTADO seguinte');
    igual(r.valores.neutrofilos_pct, 62, 'percentual do diferencial não pega o valor absoluto');
    perto(r.valores.hemacias, 4.98, 0.001, 'hemácias convertidas de /mm³ para milhões/mm³');
    igual(r.valores.potassio, 6.2, 'potássio lido');
    igual(r.labRefs.ldl, undefined, 'meta de LDL não é trocada pela faixa pediátrica do laudo');
    igual(r.labRefs.apo_b, undefined, 'meta de ApoB não é trocada pela faixa populacional do laudo');
    igual(r.labRefs.tsh, [0.48, 5.6], 'TSH usa a faixa de adultos, não a pediátrica');
    igual(r.labRefs.vitamina_d, undefined, 'faixas ambíguas de vitamina D não são adotadas');
    igual(r.labRefs.tgp, [null, 58], 'faixa de TGP escolhida pelo sexo lido no laudo');
    igual(r.perfil, {sexo:'M', idade:45}, 'sexo e idade vêm do cabeçalho do laudo');

    await p.click('#btn-analyze');
    await p.waitForSelector('#card-report:not(.hidden)');
    const resumo = await textoDoCard(p, 'Resultado da análise');
    ok(/pedem atenção rápida/.test(resumo), 'potássio 6,2 dispara o aviso de valor crítico');
    const padroes = await textoDoCard(p, 'Padrões encontrados');
    ok(/pré-diabetes/i.test(padroes), 'padrão de pré-diabetes reconhecido');
    ok(/hipotireoidismo subclínico/i.test(padroes), 'TSH alto com T4 livre normal = subclínico');
    await ctx.close();
  }

  /* ---------- 2. leitura de PDF: formato em tabela (outro laboratório) ---------- */
  console.log('\n\x1b[1mLaudo sintético em tabela (leiaute diferente, para não viciar o leitor)\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    const r = await lerPdf(p, 'laudo-tabela.pdf');
    igual(r.data, '2026-03-14', 'data da coleta em laudo sem marcação de bloco');
    ok(Object.keys(r.valores).length >= 22, 'ao menos 22 exames extraídos do formato em tabela',
       `extraiu ${Object.keys(r.valores).length}`);
    igual(r.valores.vcm, 72.4, 'abreviação pontuada "V.C.M." é reconhecida');
    igual(r.valores.rdw, 17.8, 'abreviação pontuada "R.D.W." é reconhecida');
    igual(r.valores.hemacias, 4.5, '"Eritrócitos" é sinônimo de hemácias');
    igual(r.labRefs.hemoglobina, [12, 15.5], 'faixa do laboratório lida da coluna de referência');
    igual(r.valores.sat_transferrina, 8, 'saturação de transferrina extraída');
    await ctx.close();
  }

  /* ---------- 2b. laudo com resultados em marcador e tabela de coletas anteriores ---------- */
  console.log('\n\x1b[1mLaudo com resultados em marcador, notas e tabela de resultados anteriores\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    const r = await lerPdf(p, 'laudo-bullets.pdf');
    igual(r.data, '2024-08-14', 'data da coleta');
    igual(r.valores.hdl, 32, 'resultado marcado com hífen não é confundido com nota de rodapé');
    igual(r.valores.ldl, 161, 'LDL vem do resultado, não da tabela de coletas anteriores');
    igual(r.valores.nao_hdl, 203, 'não-HDL vem do resultado, não da tabela de anteriores');
    igual(r.valores.vldl, 42, 'VLDL vem do resultado, não da tabela de anteriores');
    igual(r.valores.triglicerideos, 256, '"com jejum de 12 horas" não vira resultado de triglicerídeos');
    igual(r.labRefs.ldl, undefined, 'meta pediátrica de LDL não é adotada para adulto');
    igual(r.labRefs.triglicerideos, undefined, 'duas metas de triglicerídeos (com e sem jejum) = ambíguo, usa a geral');
    igual(r.labRefs.hdl, [40, null], 'faixa de HDL do laudo é adotada');
    igual(await p.locator('#values .alert.warn').count(), 0, 'laudo coerente não dispara falso alarme');
    await ctx.close();
  }

  /* ---------- 2c. coagulação e imunologia ---------- */
  console.log('\n\x1b[1mLaudo de coagulação e imunologia (mesmo exame impresso em três escalas)\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    const r = await lerPdf(p, 'laudo-coagulacao.pdf');
    igual(r.data, '2025-03-05', 'data da coleta');

    /* O bloco da protrombina sai em segundos, em % e em INR ao mesmo tempo.
       Ler o número errado trocaria 12,5 s por 98%: o app fica só com INR e
       atividade, e ignora o tempo em segundos de propósito. */
    igual(r.valores.inr, 1.05, 'INR lido do bloco da protrombina');
    igual(r.valores.tap_atividade, 98, 'atividade de protrombina lida em %');
    ok(!('tap' in r.valores), 'tempo de protrombina em segundos não vira exame nenhum');

    /* Valor sob o cabeçalho, sem a palavra "resultado" na linha. */
    igual(r.valores.ttpa, 41.3, 'TTPA vem da linha abaixo do cabeçalho, pela unidade');
    ok(r.valores.ttpa !== 1.31, 'a "Relação (R)" logo abaixo não sobrescreve o TTPA');
    igual(r.labRefs.ttpa, [25, 35], 'faixa do laboratório para o TTPA');

    igual(r.valores.fibrinogenio, 460, 'fibrinogênio convertido de g/L sem ruído de ponto flutuante');

    igual(r.valores.fator_reumatoide, 28.4, 'fator reumatoide');
    igual(r.valores.igg, 1840, 'IgG');
    igual(r.valores.iga, 210, 'IgA');
    igual(r.valores.igm, 96, 'IgM');
    igual(r.valores.ige, 340, 'IgE total não é confundida com as outras imunoglobulinas');
    igual(r.valores.c3, 72, 'complemento C3');
    igual(r.valores.c4, 8, 'complemento C4');
    igual(r.valores.anti_tpo, 212, 'anti-TPO, que fica no grupo da tireoide');

    const grupos = await p.evaluate(() => {
      const ids = Object.keys(window.EXAMES.state.values);
      return [...new Set(ids.map(i => window.EXAMES.byId[i].cat))];
    });
    ok(grupos.includes('coagulacao'), 'grupo Coagulação em uso');
    ok(grupos.includes('imunologia'), 'grupo Imunologia em uso');
    await ctx.close();
  }

  /* ---------- 3. casos clínicos sintéticos ---------- */
  console.log('\n\x1b[1mCasos clínicos sintéticos (perfis que o autor do app não tem)\x1b[0m');
  for (const arquivo of fs.readdirSync(path.join(fixtures, 'casos')).sort()){
    const caso = JSON.parse(fs.readFileSync(path.join(fixtures, 'casos', arquivo), 'utf8'));
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    await importar(p, path.join('casos', arquivo));
    await abrirColeta(p, 0);
    const padroes = await textoDoCard(p, 'Padrões encontrados');
    const sugestoes = await textoDoCard(p, 'O que não foi medido');
    const resumo = await textoDoCard(p, 'Resultado da análise');
    console.log(`  \x1b[2m${caso.descricao}\x1b[0m`);
    for (const t of caso.espera.padroes || [])
      ok(padroes.includes(t), `  ${arquivo}: padrão "${t}"`);
    for (const t of caso.espera.semPadroes || [])
      ok(!padroes.includes(t), `  ${arquivo}: NÃO dispara "${t}"`);
    for (const t of caso.espera.sugestoes || [])
      ok(sugestoes.toLowerCase().includes(t.toLowerCase()), `  ${arquivo}: sugere exame com "${t}"`);
    if (caso.espera.criticos)
      ok(/pedem atenção rápida/.test(resumo), `  ${arquivo}: aviso de valor crítico`);
    if (caso.espera.incoerencias){
      const avisos = await p.locator('#values .alert.warn li').allTextContents();
      ok(avisos.length >= caso.espera.incoerencias, `  ${arquivo}: laudo incoerente é sinalizado`,
         `avisos: ${avisos.length}`);
      ok(/Hemácias/.test(await p.locator('#values .alert.warn').innerText()),
         `  ${arquivo}: aponta o valor com mais chance de estar errado`);
      ok(await p.locator('.vrow.suspeito').count() > 0, `  ${arquivo}: campos suspeitos ficam marcados`);
    }
    await ctx.close();
  }

  /* ---------- 4. série longa: evolução e leitura longitudinal ---------- */
  console.log('\n\x1b[1mSérie longa de-identificada (11 coletas em 2,7 anos)\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    await importar(p, 'serie-longa.json');
    igual(await p.locator('.hist-item').count(), 11, '11 coletas importadas');
    await abrirColeta(p, 0);

    const evo = await textoDoCard(p, 'Evolução —');
    ok(/coleta de 06\/09\/2024/.test(evo), 'título traz a coleta aberta');
    ok(/comparam com a coleta anterior, 25\/04\/2024/.test(evo), 'subtítulo traz a coleta de comparação');
    ok(/11 coletas desde 30\/12\/2021/.test(evo), 'subtítulo separa a série inteira da comparação');
    const linhas = await p.locator('table.evo tbody tr:not(.cat)').count();
    ok(linhas >= 50, 'evolução lista todos os exames do laudo', `listou ${linhas}`);
    ok(/PSA total/.test(evo.slice(0, 700)), 'exame que segue alterado aparece no topo mesmo variando pouco');

    /* Agrupar por sistema não pode desfazer a ordem por relevância: os grupos saem
       na ordem da primeira aparição, então o grupo do exame mais relevante vem
       primeiro. E agrupar não pode duplicar nem sumir com linha nenhuma. */
    const grupos = await p.locator('table.evo tbody tr.cat').allTextContents();
    ok(grupos.length >= 5, 'evolução vem agrupada por sistema', `${grupos.length} grupo(s)`);
    ok(/Próstata/.test(grupos[0]), 'o grupo do exame mais relevante vem primeiro', `primeiro: ${grupos[0]}`);
    const nomes = await p.locator('table.evo tbody tr:not(.cat) td:first-child').allTextContents();
    igual(nomes.length, new Set(nomes.map(t => t.trim())).size, 'agrupar não duplica exame');

    const gNormais = await p.locator('details.normais h3.grp').allTextContents();
    ok(gNormais.length >= 5, 'os resultados dentro da referência também vêm agrupados',
       `${gNormais.length} grupo(s)`);

    const serie = await textoDoCard(p, 'Leitura da série');
    ok(/Hemoglobina — abaixo da referência em 11 coleta\(s\) seguida\(s\), em melhora/.test(serie),
       'persistência informa a direção (em melhora)');
    ok(/Paratormônio \(PTH\) — subiu e voltou a cair/.test(serie), 'reversão reconhecida (pico e recuo)');
    ok(/PSA total — subindo/.test(serie) && /duplicação/.test(serie), 'tendência linear com tempo de duplicação');
    ok(/Paratormônio \(PTH\) — subiu e voltou a cair/.test(serie), 'reversão preservada nos exames sentinela');
    ok(/Por que acompanhar/.test(serie), 'tendência sentinela explica por que acompanhar');
    ok(!/Basófilos/.test(serie), 'percentual do diferencial não vira tendência');
    ok(/respondem a\s+hábito, tratamento ou varia/.test(serie), 'tendências de estilo de vida ficam em bloco separado');
    ok(/troca de método|mudou a faixa de referência/.test(serie), 'aviso de troca de método presente');
    /* a série de referência é limpa: nenhuma das 11 coletas pode disparar incoerência */
    const sujeira = await p.evaluate(() => {
      const h = window.EXAMES.state.historico;
      return h.map(reg => {
        const v = {}; for (const [id,i] of Object.entries(reg.valores)) v[id] = i.v;
        return {data: reg.data, n: window.EXAMES.checarCoerencia(v, {sex:reg.perfil.sexo, age:reg.perfil.idade}).length};
      }).filter(x => x.n > 0);
    });
    igual(sujeira, [], 'as 11 coletas da série de referência são internamente coerentes');

    /* a ordem das seções é decisão de leitura, não acidente */
    const ordem = await p.locator('#card-report > .card > h2, #card-report > details > summary')
      .evaluateAll(ns => ns.map(n => n.textContent.trim().split(' ')[0] + ' ' + (n.textContent.trim().split(' ')[1] || '')));
    igual(ordem.slice(0, 8).map(t => t.replace(/[0-9]/g, '#')),
      ['# Resultado', '📈 Evolução', '📊 Resultados', '🔹 #', '🧮 Cálculos', '🔎 Padrões', '🔭 Leitura', '🔬 O'],
      'ordem das seções do relatório');
    const recolhiveis = await p.locator('details.recolhivel').evaluateAll(ns =>
      ns.map(n => ({titulo: n.querySelector('summary').textContent.trim().split('\n')[0].trim(), aberto: n.open})));
    igual(recolhiveis.map(r => r.aberto), [false, false], 'persistentes e tendências começam recolhidos');
    ok(recolhiveis.length === 2 && /Achados persistentes/.test(recolhiveis[0].titulo) && /Tendências/.test(recolhiveis[1].titulo),
       'os dois blocos recolhíveis são achados persistentes e tendências',
       JSON.stringify(recolhiveis.map(r => r.titulo)));

    /* valores calculados precisam ser gravados, senão nunca formam série */
    await p.click('#btn-salvar');
    await p.waitForTimeout(500);
    const calculados = await p.evaluate(() => {
      const h = window.EXAMES.state.historico;
      const ultimo = h[h.length-1];
      return Object.entries(ultimo.valores).filter(([,v]) => v.origem === 'calculado').map(([k]) => k);
    });
    ok(calculados.length > 0, 'valores calculados entram no histórico', `calculados: ${calculados.join(', ') || 'nenhum'}`);
    await ctx.close();
  }

  /* ---------- 4b. formas da tendência numa série curta e controlada ---------- */
  console.log('\n\x1b[1mSérie sintética: degrau limpo, exame estável e exame ruidoso\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    await importar(p, 'serie-degrau.json');
    await abrirColeta(p, 0);
    const serie = await textoDoCard(p, 'Leitura da série');
    ok(/Hemoglobina — mudou de patamar/.test(serie), 'degrau limpo é reconhecido como mudança de patamar');
    ok(!/PSA total —/.test(serie), 'exame estável não vira tendência');
    ok(!/Basófilos/.test(serie), 'exame ruidoso não vira tendência');
    ok(/Hemoglobina — abaixo da referência em 7 coleta\(s\) seguida\(s\), em melhora/.test(serie),
       'persistência em melhora mesmo com a tendência em degrau');
    await ctx.close();
  }

  /* ---------- 5. cada coleta enxerga só até a sua data ---------- */
  console.log('\n\x1b[1mEscolha da coleta\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await novaPagina(ctx, erros);
    await importar(p, 'serie-longa.json');
    ok(!(await p.locator('#card-report').isVisible()), 'importar não abre análise nenhuma sozinho');
    await abrirColeta(p, 5);
    const evo = await textoDoCard(p, 'Evolução —');
    ok(/6 coletas desde/.test(evo), 'coleta do meio enxerga apenas as anteriores a ela');
    await abrirColeta(p, 10);
    ok((await textoDoCard(p, 'Evolução —')) === '', 'coleta mais antiga não tem evolução');
    await ctx.close();
  }

  /* ---------- 6. o app se vira sem internet ----------
     Aqui NÃO sobrescrevemos window.PDFJS_SOURCES: é a lista de verdade que está
     sendo testada. Tudo que não for do próprio site é bloqueado, então só passa
     se a cópia em vendor/ for encontrada e carregada. Foi assim que apareceu o
     bug do import sem "./", que caía calado no CDN. */
  console.log('\n\x1b[1mAutonomia: funciona sem internet\x1b[0m');
  {
    const ctx = await navegador.newContext();
    const p = await ctx.newPage();
    const errosOff = [], externas = [];
    p.on('pageerror', e => errosOff.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errosOff.push('console: ' + m.text()); });
    await p.route('**/*', rota => {
      const u = rota.request().url();
      if (u.startsWith(`http://localhost:${PORTA}`) || u.startsWith('blob:') || u.startsWith('data:'))
        return rota.continue();
      externas.push(u);
      return rota.abort();
    });
    await p.goto(`http://localhost:${PORTA}/index.html`);
    await p.setInputFiles('#file', path.join(fixtures, 'laudo-blocos.pdf'));
    let leu = true;
    try { await p.waitForSelector('#card-values:not(.hidden)', {timeout:60000}); }
    catch { leu = false; }
    ok(leu, 'lê o PDF com a rede bloqueada', errosOff.slice(0,2).join(' | '));
    igual(externas, [], 'não faz nenhuma requisição externa');
    if (leu){
      const n = await p.evaluate(() => Object.keys(window.EXAMES.state.values).length);
      ok(n >= 20, 'extração completa mesmo offline', `${n} exames`);
    }
    ok(errosOff.length === 0, 'nenhum erro de console offline', errosOff.slice(0,2).join(' | '));
    await ctx.close();
  }

  ok(erros.length === 0, 'nenhum erro de console durante a suíte', erros.slice(0,3).join(' | '));
} finally {
  await navegador.close();
  servidor.close();
}

console.log(`\n${passou} verificação(ões) passaram, ${falhas.length} falharam.`);
if (falhas.length){ console.log('\nFalhas:'); falhas.forEach(f => console.log(' - ' + f)); process.exit(1); }
