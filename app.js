// 1. Configuração do Supabase
// Substitua pelas credenciais do seu projeto no painel do Supabase (Settings > API)
const SUPABASE_URL = 'https://sfjrhiwhphlkozjktupi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmanJoaXdocGhsa296amt0dXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzA5MzYsImV4cCI6MjEwMjgwNjkzNn0.j681cFEmApLMkmlnhe8HrVknShQEWZ6fNr3ofil0-oM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.listaCompetencias = [];
window.globalRawData = [];
window.globalCsatData = [];

// Variáveis dinâmicas pós-filtro (Usadas pelo Dashboard)
let rawData = []; 
let csatData = []; 
let totalCPsDistintos = 0;

// ==========================================
// 2. INICIALIZAÇÃO E NAVEGAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await carregarCompetencias();
    window.switchView('view-dashboard');
});

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    if(viewId === 'view-upload') navItems[0].classList.add('active');
    if(viewId === 'view-dashboard') {
        navItems[1].classList.add('active');
        initDashboard(); 
    }
    if(viewId === 'view-settings') navItems[3].classList.add('active'); 
}

function readExcel(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve([]); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0]; 
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            resolve(json);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

// ==========================================
// 3. CONFIGURAÇÕES: GERENCIAR COMPETÊNCIAS
// ==========================================
async function carregarCompetencias() {
    try {
        const { data, error } = await supabaseClient.from('competencias').select('*').order('nome', { ascending: true });
        if (error) throw error;
        window.listaCompetencias = data || []; 
        
        atualizarDropdownsCompetencia();
        renderizarListaConfiguracoes();
    } catch (err) {
        console.error("Erro ao carregar competências:", err);
    }
}

function atualizarDropdownsCompetencia() {
    const selUpload = document.getElementById('upload-competencia');
    const selDash = document.getElementById('dash-competencia');
    const selAna = document.getElementById('filtro-ana-competencia');
    
    let html = '';
    window.listaCompetencias.forEach(c => {
        html += `<option value="${c.nome}">${c.nome}</option>`;
    });

    if(selUpload) selUpload.innerHTML = html;
    if(selDash) selDash.innerHTML = html;
    if(selAna) selAna.innerHTML = html; 
}

function renderizarListaConfiguracoes() {
    const ul = document.getElementById('list-competencias');
    if(ul) ul.innerHTML = window.listaCompetencias.map(c => `<li><i class="bi bi-tag-fill"></i> ${c.nome}</li>`).join('');
}

document.getElementById('btn-add-comp').addEventListener('click', async () => {
    const input = document.getElementById('new-comp-name');
    const status = document.getElementById('statusConfig');
    const nome = input.value.trim();

    if (!nome) return;

    try {
        status.style.color = 'blue'; status.innerText = 'Salvando...';
        const { error } = await supabaseClient.from('competencias').insert([{ nome }]);
        if (error) throw error;

        input.value = '';
        status.style.color = 'green'; status.innerText = 'Competência adicionada!';
        await carregarCompetencias();
        setTimeout(() => status.innerText = '', 3000);
    } catch (err) {
        status.style.color = 'red'; status.innerText = 'Erro ao salvar. Verifique se o nome já existe.';
    }
});

// ==========================================
// 4. UPLOAD DE DADOS
// ==========================================
document.getElementById('btnProcMatriculas').addEventListener('click', async () => {
    const compSelecionada = document.getElementById('upload-competencia').value;
    if (!compSelecionada) { alert("Cadastre ou selecione uma competência."); return; }

    const fileFarol = document.getElementById('fileFarol').files[0];
    const fileUnibe = document.getElementById('fileUnibe').files[0];
    const statusDiv = document.getElementById('statusMatriculas');
    const btn = document.getElementById('btnProcMatriculas');

    if (!fileFarol || !fileUnibe) { statusDiv.style.color = 'red'; statusDiv.innerText = "Selecione os dois arquivos."; return; }

    btn.disabled = true;
    statusDiv.style.color = '#2563eb';
    statusDiv.innerText = "Processando matrículas...";

    try {
        const dataFarol = await readExcel(fileFarol);
        const dataUnibe = await readExcel(fileUnibe);

        const { data: franquiasData } = await supabaseClient.from('registro_franquias').select('*');
        const mapaFranquias = new Map();
        (franquiasData||[]).forEach(item => { if (item.nome_cp) mapaFranquias.set(item.nome_cp.trim().toLowerCase(), item); });

        const unibeMap = new Map();
        dataUnibe.forEach(row => { if (row['Username']) unibeMap.set(row['Username'].toString().trim().toLowerCase(), row); });

        const mergedData = dataFarol.map(farolRow => {
            const rawLogin = farolRow['LOGIN DA EXTRANET'];
            if (!rawLogin) return null; 

            const login = rawLogin.toString().trim().toLowerCase();
            const unibeRow = unibeMap.get(login) || {};
            let nomeMissao = farolRow['MISSÃO'] || unibeRow['Missão'] || 'Sem Nome';
            
            const compKey = compSelecionada.replace(/\s+/g, '').toLowerCase();
            const missaoKey = nomeMissao.replace(/\s+/g, '').toLowerCase();
            let idMatricula = `${login}_${compKey}_${missaoKey}`;

            let progresso = unibeRow['Progresso'] ? parseFloat(unibeRow['Progresso'].toString().replace('%', '')) : 0;
            let nota = null; 
            if (unibeRow['Média das notas']) {
                let notaNumero = parseFloat(unibeRow['Média das notas'].toString().replace('%', '').trim());
                if (!isNaN(notaNumero)) nota = notaNumero;
            }

            let nomeCp = farolRow['NOME CP'] || '';
            let dadosOficiais = mapaFranquias.get(nomeCp.toString().trim().toLowerCase()) || {};
            
            let dataConclusao = null;
            let dataBrutaConc = unibeRow['Data de Conclusão da Matrícula'];
            if (dataBrutaConc) dataConclusao = (dataBrutaConc instanceof Date && !isNaN(dataBrutaConc)) ? dataBrutaConc.toISOString() : dataBrutaConc;

            let dataInicio = null;
            let dataBrutaIni = unibeRow['Data da Matrícula'];
            if (dataBrutaIni) dataInicio = (dataBrutaIni instanceof Date && !isNaN(dataBrutaIni)) ? dataBrutaIni.toISOString() : dataBrutaIni;

            return {
                id_matricula: idMatricula,
                competencia: compSelecionada,
                missao: nomeMissao,
                login: login,
                nome: farolRow['NOME COLABORADOR'] || unibeRow['Nome'],
                cargo: farolRow['CARGO'],
                tipo_cargo: farolRow['TIPO CARGO'],
                nome_cp: nomeCp,
                codigo_cp: dadosOficiais.codigo_cp || '',
                cod_pdv: farolRow['CÓD PDV'] || '',
                tipo_franquia: farolRow['TIPO FRANQUIA'] || '',
                regional: dadosOficiais.regional || farolRow['REGIONAL'],
                regional_macro: dadosOficiais.regional_macro || null,
                status_matricula: unibeRow['Status Detalhado da Matrícula'] || 'NÃO INICIADO',
                progresso_percentual: isNaN(progresso) ? 0 : progresso,
                elegivel: farolRow['ELEGÍVEL'] === 1,
                concluido: farolRow['CONCLUÍDO'] === 1,
                data_inicio: dataInicio,
                data_conclusao: dataConclusao,
                media_notas: nota
            };
        }).filter(item => item !== null);

        const mapUnicos = new Map();
        mergedData.forEach(item => { if (item) mapUnicos.set(item.id_matricula, item); });
        const finalData = Array.from(mapUnicos.values());

        const { error } = await supabaseClient.from('treinamentos_lideranca').upsert(finalData, { onConflict: 'id_matricula' });
        if (error) throw error;

        statusDiv.style.color = 'green'; statusDiv.innerText = "Matrículas sincronizadas!";
        document.getElementById('fileFarol').value = ''; document.getElementById('fileUnibe').value = '';
    } catch (error) {
        console.error(error);
        statusDiv.style.color = 'red'; statusDiv.innerText = "Erro ao processar.";
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btnProcCsat').addEventListener('click', async () => {
    const compSelecionada = document.getElementById('upload-competencia').value;
    if (!compSelecionada) { alert("Cadastre ou selecione uma competência."); return; }

    const fileCsat = document.getElementById('fileCsat').files[0];
    const statusDiv = document.getElementById('statusCsat');
    const btn = document.getElementById('btnProcCsat');

    if (!fileCsat) { statusDiv.style.color = 'red'; statusDiv.innerText = "Selecione o arquivo de CSAT."; return; }

    btn.disabled = true; statusDiv.style.color = '#16a34a'; statusDiv.innerText = "Lendo CSAT...";

    try {
        const dataCsat = await readExcel(fileCsat);
        const csatMap = new Map();
        
        dataCsat.forEach(row => {
            const user = (row['Username'] || '').toString().trim().toLowerCase();
            const missao = (row['Nome'] || row['Nome do Módulo'] || '').toString().trim();
            if(!user || !missao) return;
            
            const compKey = compSelecionada.replace(/\s+/g, '').toLowerCase();
            const missaoKey = missao.replace(/\s+/g, '').toLowerCase();
            const key = `${user}_${compKey}_${missaoKey}`;

            if(!csatMap.has(key)) {
                csatMap.set(key, { username: user, missao: missao, competencia: compSelecionada, nota: null, comentario: null, chave_unica: key });
            }
            const entry = csatMap.get(key);
            
            const questao = (row['Questão'] || '').toString().toLowerCase();
            const resposta = (row['Texto da Resposta'] || '').toString();
            
            if (questao.includes('escala')) entry.nota = parseInt(resposta.split('-')[0].trim());
            else if (questao.includes('motivo')) entry.comentario = resposta;
        });

        const csatFinal = Array.from(csatMap.values()).filter(c => c.nota !== null);
        
        if (csatFinal.length > 0) {
            const { error } = await supabaseClient.from('avaliacoes_csat').upsert(csatFinal, { onConflict: 'chave_unica' });
            if (error) throw error;
            statusDiv.style.color = 'green'; statusDiv.innerText = "CSAT atualizado!";
            document.getElementById('fileCsat').value = '';
        } else {
            statusDiv.style.color = '#f59e0b'; statusDiv.innerText = "Nenhuma nota encontrada.";
        }
    } catch (error) {
        statusDiv.style.color = 'red'; statusDiv.innerText = "Erro ao processar CSAT.";
    } finally {
        btn.disabled = false;
    }
});

// ==========================================
// 5. DASHBOARD (Sincronizado com Analytics)
// ==========================================
async function initDashboard() {
    try {
        if (!window.globalRawData || window.globalRawData.length === 0) {
            const [resTreinos, resCsat] = await Promise.all([
                supabaseClient.from('treinamentos_lideranca').select('*').limit(30000),
                supabaseClient.from('avaliacoes_csat').select('*').limit(10000)
            ]);
            
            window.globalRawData = resTreinos.data || [];
            window.globalCsatData = resCsat.data || [];
        }
        
        if(window.popularGavetaFiltros) window.popularGavetaFiltros();
        
        const dashComp = document.getElementById('dash-competencia');
        const anaComp = document.getElementById('filtro-ana-competencia');
        if (dashComp && dashComp.options.length > 0 && anaComp) {
            anaComp.value = dashComp.value;
        }

        if (window.aplicarFiltrosGlobais) {
            window.aplicarFiltrosGlobais();
        } else {
            window.atualizarComponentesDashboard(); 
        }
    } catch (error) {
        console.error("Erro no Dashboard:", error);
    }
}

document.getElementById('dash-competencia').addEventListener('change', (e) => {
    const anaComp = document.getElementById('filtro-ana-competencia');
    if (anaComp) anaComp.value = e.target.value;
    
    if (window.limparFiltrosCascata) window.limparFiltrosCascata(true); 
    if (window.popularGavetaFiltros) window.popularGavetaFiltros();
    if (window.aplicarFiltrosGlobais) window.aplicarFiltrosGlobais();
});

window.atualizarComponentesDashboard = function() {
    const compSelecionada = document.getElementById('dash-competencia').value;
    document.getElementById('dash-title').innerText = `Trilhas ${compSelecionada || 'Carregando...'}`;

    if(!compSelecionada) return;

    rawData = window.filteredRawData || [];
    csatData = window.filteredCsatData || [];
    
    const uniqueCPs = new Set(rawData.map(row => row.codigo_cp).filter(Boolean));
    totalCPsDistintos = uniqueCPs.size;

    processarTabelaPrincipal();
    popularFiltrosDashboard();
    processarRanking('todos');
    renderizarFeedbacksResumo();
    popularFiltrosModalCsat();
    filtrarModalFeedbacks();
}

function processarTabelaPrincipal() {
    const missoesMap = new Map();
    
    // CORREÇÃO: Filtra o CSAT global com base na competência selecionada atualmente
    const compAtual = document.getElementById('dash-competencia').value;
    const csatFiltradoPorComp = (window.globalCsatData || []).filter(c => (c.competencia || 'Gestão de Pessoas') === compAtual);

    csatFiltradoPorComp.forEach(c => {
        if (!missoesMap.has(c.missao)) missoesMap.set(c.missao, { nome: c.missao, liderancaElegivel: 0, liderancaConcluido: 0, backofficeElegivel: 0, backofficeConcluido: 0, matriculados: 0, cpsConcluidos: new Set(), csatPromoters: 0, csatTotal: 0 });
        const m = missoesMap.get(c.missao);
        m.csatTotal++;
        if (c.nota >= 4) m.csatPromoters++;
    });

    rawData.forEach(row => {
        const missao = row.missao || 'Sem Nome';
        if (!missoesMap.has(missao)) missoesMap.set(missao, { nome: missao, liderancaElegivel: 0, liderancaConcluido: 0, backofficeElegivel: 0, backofficeConcluido: 0, matriculados: 0, cpsConcluidos: new Set(), csatPromoters: 0, csatTotal: 0 });
        
        const stats = missoesMap.get(missao);
        const isLider = (row.tipo_cargo || '').toLowerCase().includes('lider');

        if (row.elegivel) {
            if (isLider) { stats.liderancaElegivel++; if (row.concluido) stats.liderancaConcluido++; } 
            else { stats.backofficeElegivel++; if (row.concluido) stats.backofficeConcluido++; }
            
            const status = (row.status_matricula || '').toString().toUpperCase().trim();
            const isIniciado = row.concluido || row.progresso_percentual > 0 || (status !== 'NÃO INICIADO' && status !== 'NOT_STARTED' && status !== '');
            if (isIniciado) stats.matriculados++;
        }
        if (row.concluido && row.codigo_cp) stats.cpsConcluidos.add(row.codigo_cp);
    });

    renderizarTabela(Array.from(missoesMap.values()));
}

function renderizarTabela(dadosMissoes) {
    const tbody = document.getElementById('tabela-body');
    const tfoot = document.getElementById('tabela-footer');
    tbody.innerHTML = '';

    let totLidEleg = 0, totLidConc = 0, totBackEleg = 0, totBackConc = 0, totMatriculados = 0, totCsatPromoters = 0, totCsatGeral = 0;
    let allCpsConcluidosGeral = new Set();

    dadosMissoes.forEach(missao => {
        totLidEleg += missao.liderancaElegivel; totLidConc += missao.liderancaConcluido;
        totBackEleg += missao.backofficeElegivel; totBackConc += missao.backofficeConcluido;
        totMatriculados += missao.matriculados; totCsatPromoters += missao.csatPromoters; totCsatGeral += missao.csatTotal;
        missao.cpsConcluidos.forEach(cp => allCpsConcluidosGeral.add(cp));

        const pcLid = missao.liderancaElegivel ? ((missao.liderancaConcluido / missao.liderancaElegivel) * 100).toFixed(2) : '-';
        const pcBack = missao.backofficeElegivel ? ((missao.backofficeConcluido / missao.backofficeElegivel) * 100).toFixed(2) : '-';
        const totElegGeral = missao.liderancaElegivel + missao.backofficeElegivel;
        const totConcGeral = missao.liderancaConcluido + missao.backofficeConcluido;
        const pcMatriculados = totElegGeral ? ((missao.matriculados / totElegGeral) * 100).toFixed(2) : '-';
        const pcGeral = totElegGeral ? ((totConcGeral / totElegGeral) * 100).toFixed(2) : '0.00';
        const pcCp = totalCPsDistintos ? ((missao.cpsConcluidos.size / totalCPsDistintos) * 100).toFixed(2) : '0.00';
        const pcCsat = missao.csatTotal ? ((missao.csatPromoters / missao.csatTotal) * 100).toFixed(2) : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="missao-nome col-missao">${missao.nome}</td>
            <td class="col-lideranca"><span class="big-percent">${pcLid !== '-' ? pcLid + '%' : '-'}</span>${missao.liderancaElegivel > 0 ? `<span class="small-count">${missao.liderancaConcluido} | ${missao.liderancaElegivel}</span>` : ''}</td>
            <td class="col-backoffice"><span class="big-percent">${pcBack !== '-' ? pcBack + '%' : '-'}</span>${missao.backofficeElegivel > 0 ? `<span class="small-count">${missao.backofficeConcluido} | ${missao.backofficeElegivel}</span>` : ''}</td>
            <td class="col-matriculados"><span class="big-percent">${pcMatriculados !== '-' ? pcMatriculados + '%' : '-'}</span>${totElegGeral > 0 ? `<span class="small-count">${missao.matriculados} | ${totElegGeral}</span>` : ''}</td>
            <td class="col-conclusao"><span class="big-percent">${pcGeral}%</span><span class="small-count">${totConcGeral} | ${totElegGeral}</span></td>
            <td class="dotted-col col-cp"><span class="big-percent">${pcCp}%</span><span class="small-count">${missao.cpsConcluidos.size} | ${totalCPsDistintos} CP's</span></td>
            <td class="highlight-col col-csat"><span class="big-percent" style="color:#16a34a">${pcCsat !== '-' ? pcCsat + '%' : '-'}</span><span class="small-count">${missao.csatTotal} avaliações</span></td>
        `;
        tbody.appendChild(tr);
    });

    const totEleg = totLidEleg + totBackEleg;
    const pcTotMatriculados = totEleg ? ((totMatriculados / totEleg) * 100).toFixed(2) : 0;
    const pcCsatTotal = totCsatGeral ? ((totCsatPromoters / totCsatGeral) * 100).toFixed(2) : 0;
    
    tfoot.innerHTML = `
        <tr>
            <td class="missao-nome col-missao"><i class="bi bi-calculator-fill" style="color: #fbbc82; margin-right: 8px;"></i> Aderência Total</td>
            <td class="col-lideranca"><span class="big-percent">${totLidEleg ? ((totLidConc / totLidEleg) * 100).toFixed(2) : 0}%</span></td>
            <td class="col-backoffice"><span class="big-percent">${totBackEleg ? ((totBackConc / totBackEleg) * 100).toFixed(2) : 0}%</span></td>
            <td class="col-matriculados"><span class="big-percent">${pcTotMatriculados}%</span></td>
            <td class="col-conclusao"><span class="big-percent">${totEleg ? (((totLidConc + totBackConc) / totEleg) * 100).toFixed(2) : 0}%</span></td>
            <td class="dotted-col col-cp"><span class="big-percent">${totalCPsDistintos ? ((allCpsConcluidosGeral.size / totalCPsDistintos) * 100).toFixed(2) : 0}%</span></td>
            <td class="highlight-col col-csat"><span class="big-percent" style="color:#16a34a">${pcCsatTotal}%</span></td>
        </tr>
    `;
}

function popularFiltrosDashboard() {
    const filtro = document.getElementById('filtro-missao');
    filtro.innerHTML = '<option value="todos">Geral (Todos)</option>';
    const missoesUnicas = [...new Set(rawData.map(r => r.missao).filter(Boolean))];
    missoesUnicas.forEach(missao => {
        const option = document.createElement('option');
        option.value = missao; option.textContent = missao;
        filtro.appendChild(option);
    });
    const novoFiltro = filtro.cloneNode(true);
    filtro.parentNode.replaceChild(novoFiltro, filtro);
    novoFiltro.addEventListener('change', (e) => processarRanking(e.target.value));
}

function processarRanking(missaoFiltro) {
    const list = document.getElementById('ranking-list');
    list.innerHTML = ''; 
    const macrosMap = new Map();

    rawData.forEach(row => {
        if (missaoFiltro !== 'todos' && row.missao !== missaoFiltro) return;
        if (!row.elegivel) return; 
        const macro = row.regional_macro || 'Sem Regional';
        if (!macrosMap.has(macro)) macrosMap.set(macro, { nome: macro, elegivel: 0, concluido: 0 });
        const stats = macrosMap.get(macro);
        stats.elegivel++;
        if (row.concluido) stats.concluido++;
    });

    const rankingArray = Array.from(macrosMap.values())
        .map(macro => ({ nome: macro.nome, aderencia: macro.elegivel ? (macro.concluido / macro.elegivel) * 100 : 0 }))
        .sort((a, b) => b.aderencia - a.aderencia);

    rankingArray.forEach((item, index) => {
        let rankClass = 'rank-other', icon = '';
        if (index === 0) { rankClass = 'rank-1'; icon = '<i class="bi bi-trophy-fill" style="color: #fbbc82; margin-right: 12px; font-size: 22px;"></i>'; } 
        else if (index === 1) { rankClass = 'rank-2'; icon = '<i class="bi bi-award-fill" style="color: #94a3b8; margin-right: 12px; font-size: 20px;"></i>'; } 
        else if (index === 2) { rankClass = 'rank-3'; icon = '<i class="bi bi-award" style="color: #cbd5e1; margin-right: 12px; font-size: 18px;"></i>'; }

        const div = document.createElement('div');
        div.className = `rank-card ${rankClass}`;
        div.innerHTML = `<div class="rank-info"><span class="rank-position">${index + 1}º</span><span class="rank-regional">${icon}${item.nome}</span></div><span class="rank-percent">${item.aderencia.toFixed(2)}%</span>`;
        list.appendChild(div);
    });
}

function renderCardFeedback(c) {
    return `<div class="feedback-card"><div class="feedback-header"><span class="feedback-mission">${c.missao}</span><span class="feedback-score"><i class="bi bi-star-fill"></i> ${c.nota}</span></div><p class="feedback-text">"${c.comentario}"</p></div>`;
}

function renderizarFeedbacksResumo() {
    const listMain = document.getElementById('feedbacks-list');
    const compAtual = document.getElementById('dash-competencia').value;
    const csatBase = (window.globalCsatData || []).filter(c => (c.competencia || 'Gestão de Pessoas') === compAtual);

    const comentados = csatBase.filter(c => c.comentario && c.comentario.trim().length > 3);
    const elogios = comentados.filter(c => c.nota >= 4).sort((a,b) => b.nota - a.nota);
    const oportunidades = comentados.filter(c => c.nota < 4).sort((a,b) => a.nota - b.nota);

    let qtdElogios = Math.min(3, elogios.length);
    let qtdOports = Math.min(2, oportunidades.length);
    if (qtdElogios < 3) qtdOports = Math.min(oportunidades.length, 5 - qtdElogios);
    if (qtdOports < 2) qtdElogios = Math.min(elogios.length, 5 - qtdOports);

    const top5 = [...elogios.slice(0, qtdElogios), ...oportunidades.slice(0, qtdOports)];
    listMain.innerHTML = top5.length > 0 ? top5.map(renderCardFeedback).join('') : '<p style="color:#64748b; font-size:14px;">Sem comentários no momento.</p>';
}

function popularFiltrosModalCsat() {
    const filtroMissao = document.getElementById('modal-filtro-missao');
    filtroMissao.innerHTML = '<option value="todos">Todos os Treinamentos</option>';
    const compAtual = document.getElementById('dash-competencia').value;
    const csatBase = (window.globalCsatData || []).filter(c => (c.competencia || 'Gestão de Pessoas') === compAtual);

    const missoesUnicas = [...new Set(csatBase.map(r => r.missao).filter(Boolean))];
    missoesUnicas.forEach(missao => {
        const option = document.createElement('option');
        option.value = missao; option.textContent = missao;
        filtroMissao.appendChild(option);
    });
}

function filtrarModalFeedbacks() {
    const listModal = document.getElementById('modal-comments-list');
    const missaoSel = document.getElementById('modal-filtro-missao').value;
    const notaSel = document.getElementById('modal-filtro-nota').value;
    const compAtual = document.getElementById('dash-competencia').value;
    const csatBase = (window.globalCsatData || []).filter(c => (c.competencia || 'Gestão de Pessoas') === compAtual);

    let filtrados = csatBase.filter(c => c.comentario && c.comentario.trim().length > 3);
    if (missaoSel !== 'todos') filtrados = filtrados.filter(c => c.missao === missaoSel);
    if (notaSel !== 'todos') {
        if (notaSel === 'positivos') filtrados = filtrados.filter(c => c.nota >= 4);
        else if (notaSel === 'oportunidades') filtrados = filtrados.filter(c => c.nota < 4);
        else filtrados = filtrados.filter(c => c.nota == parseInt(notaSel));
    }

    filtrados.sort((a,b) => b.nota - a.nota);
    listModal.innerHTML = filtrados.length > 0 ? filtrados.map(renderCardFeedback).join('') : '<p style="color:#64748b;">Nenhum feedback encontrado.</p>';
}

document.getElementById('modal-filtro-missao').addEventListener('change', filtrarModalFeedbacks);
document.getElementById('modal-filtro-nota').addEventListener('change', filtrarModalFeedbacks);

const toggleColunas = [
    { id: 'toggleMissao', cls: 'hide-missao' },
    { id: 'toggleLideranca', cls: 'hide-lideranca' },
    { id: 'toggleBackoffice', cls: 'hide-backoffice' },
    { id: 'toggleMatriculados', cls: 'hide-matriculados' },
    { id: 'toggleConclusao', cls: 'hide-conclusao' },
    { id: 'toggleCp', cls: 'hide-cp' },
    { id: 'toggleCsat', cls: 'hide-csat' }
];

toggleColunas.forEach(col => {
    const el = document.getElementById(col.id);
    if(el) { el.addEventListener('change', (e) => { document.getElementById('tabela-aderencia').classList.toggle(col.cls, !e.target.checked); }); }
});

document.getElementById('btnOpenModal').addEventListener('click', () => document.getElementById('modalComments').classList.add('active'));
document.getElementById('btnCloseModal').addEventListener('click', () => document.getElementById('modalComments').classList.remove('active'));

document.getElementById('btnExport').addEventListener('click', () => {
    const btn = document.getElementById('btnExport');
    const container = document.getElementById('relatorio-export');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Gerando...';
    btn.disabled = true;

    setTimeout(() => {
        html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#f5f1eb' }).then(canvas => {
            const link = document.createElement('a'); link.download = 'Relatorio_EscolaDeNegocios_FDR.png'; link.href = canvas.toDataURL('image/png'); link.click();
            btn.innerHTML = originalText; btn.disabled = false;
        });
    }, 150);
});