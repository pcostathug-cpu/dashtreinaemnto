// 1. Configuração do Supabase
// Substitua pelas credenciais do seu projeto no painel do Supabase (Settings > API)
const SUPABASE_URL = 'https://sfjrhiwhphlkozjktupi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmanJoaXdocGhsa296amt0dXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzA5MzYsImV4cCI6MjEwMjgwNjkzNn0.j681cFEmApLMkmlnhe8HrVknShQEWZ6fNr3ofil0-oM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. Navegação SPA (Sidebar)
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Marca o botão clicado como ativo
    if(viewId === 'view-upload') navItems[0].classList.add('active');
    if(viewId === 'view-dashboard') {
        navItems[1].classList.add('active');
        initDashboard(); // Recarrega os dados fresquinhos sempre que abrir o dashboard
    }
}

// 3. Função Auxiliar de Leitura de Excel
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
// MÓDULO 1: UPLOAD FAROL + UNIBÊ
// ==========================================
document.getElementById('btnProcMatriculas').addEventListener('click', async () => {
    const fileFarol = document.getElementById('fileFarol').files[0];
    const fileUnibe = document.getElementById('fileUnibe').files[0];
    const statusDiv = document.getElementById('statusMatriculas');
    const btn = document.getElementById('btnProcMatriculas');

    if (!fileFarol || !fileUnibe) {
        statusDiv.style.color = 'red';
        statusDiv.innerText = "Selecione os dois arquivos.";
        return;
    }

    btn.disabled = true;
    statusDiv.style.color = '#2563eb';
    statusDiv.innerText = "Processando matrículas...";

    try {
        const dataFarol = await readExcel(fileFarol);
        const dataUnibe = await readExcel(fileUnibe);

        const { data: franquiasData } = await supabaseClient.from('registro_franquias').select('*');
        const mapaFranquias = new Map();
        (franquiasData||[]).forEach(item => {
            if (item.nome_cp) mapaFranquias.set(item.nome_cp.trim().toLowerCase(), item);
        });

        const unibeMap = new Map();
        dataUnibe.forEach(row => {
            if (row['Username']) unibeMap.set(row['Username'].toString().trim().toLowerCase(), row);
        });

        const mergedData = dataFarol.map(farolRow => {
            const rawLogin = farolRow['LOGIN DA EXTRANET'];
            if (!rawLogin) return null; 

            const login = rawLogin.toString().trim().toLowerCase();
            const unibeRow = unibeMap.get(login) || {};

            let nomeMissao = farolRow['MISSÃO'] || unibeRow['Missão'] || 'Sem Nome';
            let idMatricula = `${login}_${nomeMissao.replace(/\s+/g, '').toLowerCase()}`;

            let progresso = unibeRow['Progresso'] ? parseFloat(unibeRow['Progresso'].toString().replace('%', '')) : 0;
            let nota = null; 
            if (unibeRow['Média das notas']) {
                let notaNumero = parseFloat(unibeRow['Média das notas'].toString().replace('%', '').trim());
                if (!isNaN(notaNumero)) nota = notaNumero;
            }

            let dataConclusao = null;
            let dataBruta = unibeRow['Data de Conclusão da Matrícula'];
            if (dataBruta) {
                dataConclusao = (dataBruta instanceof Date && !isNaN(dataBruta)) ? dataBruta.toISOString() : dataBruta;
            }

            let nomeCp = farolRow['NOME CP'] || '';
            let dadosOficiais = mapaFranquias.get(nomeCp.toString().trim().toLowerCase()) || {};

            return {
                id_matricula: idMatricula,
                missao: nomeMissao,
                login: login,
                nome: farolRow['NOME COLABORADOR'] || unibeRow['Nome'],
                cargo: farolRow['CARGO'],
                tipo_cargo: farolRow['TIPO CARGO'],
                nome_cp: nomeCp,
                estado_uf: farolRow['ESTADO (UF)'],
                codigo_cp: dadosOficiais.codigo_cp || farolRow['CÓD PDV'],
                regional: dadosOficiais.regional || farolRow['REGIONAL'],
                regional_macro: dadosOficiais.regional_macro || null,
                nome_consultor: dadosOficiais.nome_consultor || farolRow['CONSULTOR'],
                nome_gerente_regional: dadosOficiais.nome_gerente_regional || farolRow['GERENTE REGIONAL'],
                nome_coordenador: dadosOficiais.nome_coordenador || null,
                status_matricula: unibeRow['Status Detalhado da Matrícula'] || 'NÃO INICIADO',
                progresso_percentual: isNaN(progresso) ? 0 : progresso,
                carga_horaria_min: unibeRow['Carga horária (min)'] || unibeRow['Carga Horaria (Min)'] || farolRow['CARGA HORÁRIA'],
                elegivel: farolRow['ELEGÍVEL'] === 1,
                concluido: farolRow['CONCLUÍDO'] === 1,
                data_conclusao: dataConclusao,
                media_notas: nota
            };
        }).filter(item => item !== null);

        const mapUnicos = new Map();
        mergedData.forEach(item => { if (item) mapUnicos.set(item.id_matricula, item); });
        const finalData = Array.from(mapUnicos.values());

        const { error } = await supabaseClient.from('treinamentos_lideranca').upsert(finalData, { onConflict: 'id_matricula' });
        if (error) throw error;

        statusDiv.style.color = 'green';
        statusDiv.innerText = "Matrículas sincronizadas com sucesso!";
        document.getElementById('fileFarol').value = '';
        document.getElementById('fileUnibe').value = '';
    } catch (error) {
        console.error(error);
        statusDiv.style.color = 'red';
        statusDiv.innerText = "Erro ao processar. Verifique o console.";
    } finally {
        btn.disabled = false;
    }
});

// ==========================================
// MÓDULO 2: UPLOAD CSAT (Independente)
// ==========================================
document.getElementById('btnProcCsat').addEventListener('click', async () => {
    const fileCsat = document.getElementById('fileCsat').files[0];
    const statusDiv = document.getElementById('statusCsat');
    const btn = document.getElementById('btnProcCsat');

    if (!fileCsat) {
        statusDiv.style.color = 'red';
        statusDiv.innerText = "Selecione o arquivo de CSAT.";
        return;
    }

    btn.disabled = true;
    statusDiv.style.color = '#16a34a';
    statusDiv.innerText = "Lendo CSAT...";

    try {
        const dataCsat = await readExcel(fileCsat);
        const csatMap = new Map();
        
        dataCsat.forEach(row => {
            const user = (row['Username'] || '').toString().trim().toLowerCase();
            const missao = (row['Nome'] || row['Nome do Módulo'] || '').toString().trim();
            if(!user || !missao) return;
            
            const key = `${user}_${missao}`;
            if(!csatMap.has(key)) {
                csatMap.set(key, { username: user, missao: missao, nota: null, comentario: null, chave_unica: key });
            }
            const entry = csatMap.get(key);
            
            const questao = (row['Questão'] || '').toString().toLowerCase();
            const resposta = (row['Texto da Resposta'] || '').toString();
            
            if (questao.includes('escala')) {
                entry.nota = parseInt(resposta.split('-')[0].trim());
            } else if (questao.includes('motivo')) {
                entry.comentario = resposta;
            }
        });

        const csatFinal = Array.from(csatMap.values()).filter(c => c.nota !== null);
        
        if (csatFinal.length > 0) {
            const { error } = await supabaseClient.from('avaliacoes_csat').upsert(csatFinal, { onConflict: 'chave_unica' });
            if (error) throw error;
            
            statusDiv.style.color = 'green';
            statusDiv.innerText = "CSAT atualizado com sucesso!";
            document.getElementById('fileCsat').value = '';
        } else {
            statusDiv.style.color = '#f59e0b';
            statusDiv.innerText = "Nenhuma nota encontrada no arquivo.";
        }
    } catch (error) {
        console.error(error);
        statusDiv.style.color = 'red';
        statusDiv.innerText = "Erro ao processar CSAT.";
    } finally {
        btn.disabled = false;
    }
});

// ==========================================
// MÓDULO 3: DASHBOARD LOGIC
// ==========================================
let rawData = [];
let csatData = [];
let totalCPsDistintos = 0;

async function initDashboard() {
    try {
        const [resTreinos, resCsat] = await Promise.all([
            supabaseClient.from('treinamentos_lideranca').select('*').limit(20000),
            supabaseClient.from('avaliacoes_csat').select('*').limit(5000)
        ]);
        if (resTreinos.error) throw resTreinos.error;
        if (resCsat.error) throw resCsat.error;
        
        rawData = resTreinos.data || [];
        csatData = resCsat.data || [];
        
        const uniqueCPs = new Set(rawData.map(row => row.codigo_cp).filter(Boolean));
        totalCPsDistintos = uniqueCPs.size;

        processarTabelaPrincipal();
        popularFiltroMissoes();
        processarRanking('todos');
        renderizarFeedbacks();
    } catch (error) {
        console.error("Erro no Dashboard:", error);
    }
}

function processarTabelaPrincipal() {
    const missoesMap = new Map();
    csatData.forEach(c => {
        if (!missoesMap.has(c.missao)) missoesMap.set(c.missao, { nome: c.missao, liderancaElegivel: 0, liderancaConcluido: 0, backofficeElegivel: 0, backofficeConcluido: 0, cpsConcluidos: new Set(), csatPromoters: 0, csatTotal: 0 });
        const m = missoesMap.get(c.missao);
        m.csatTotal++;
        if (c.nota >= 4) m.csatPromoters++;
    });

    rawData.forEach(row => {
        const missao = row.missao || 'Sem Nome';
        if (!missoesMap.has(missao)) missoesMap.set(missao, { nome: missao, liderancaElegivel: 0, liderancaConcluido: 0, backofficeElegivel: 0, backofficeConcluido: 0, cpsConcluidos: new Set(), csatPromoters: 0, csatTotal: 0 });
        const stats = missoesMap.get(missao);
        const isLider = (row.tipo_cargo || '').toLowerCase().includes('lider');

        if (row.elegivel) {
            if (isLider) { stats.liderancaElegivel++; if (row.concluido) stats.liderancaConcluido++; } 
            else { stats.backofficeElegivel++; if (row.concluido) stats.backofficeConcluido++; }
        }
        if (row.concluido && row.codigo_cp) stats.cpsConcluidos.add(row.codigo_cp);
    });

    renderizarTabela(Array.from(missoesMap.values()));
}

function renderizarTabela(dadosMissoes) {
    const tbody = document.getElementById('tabela-body');
    const tfoot = document.getElementById('tabela-footer');
    tbody.innerHTML = '';

    let totLidEleg = 0, totLidConc = 0, totBackEleg = 0, totBackConc = 0, totCsatPromoters = 0, totCsatGeral = 0;
    let allCpsConcluidosGeral = new Set();

    dadosMissoes.forEach(missao => {
        totLidEleg += missao.liderancaElegivel; totLidConc += missao.liderancaConcluido;
        totBackEleg += missao.backofficeElegivel; totBackConc += missao.backofficeConcluido;
        totCsatPromoters += missao.csatPromoters; totCsatGeral += missao.csatTotal;
        missao.cpsConcluidos.forEach(cp => allCpsConcluidosGeral.add(cp));

        const pcLid = missao.liderancaElegivel ? ((missao.liderancaConcluido / missao.liderancaElegivel) * 100).toFixed(2) : '-';
        const pcBack = missao.backofficeElegivel ? ((missao.backofficeConcluido / missao.backofficeElegivel) * 100).toFixed(2) : '-';
        const totElegGeral = missao.liderancaElegivel + missao.backofficeElegivel;
        const pcGeral = totElegGeral ? (((missao.liderancaConcluido + missao.backofficeConcluido) / totElegGeral) * 100).toFixed(2) : '0.00';
        const pcCp = totalCPsDistintos ? ((missao.cpsConcluidos.size / totalCPsDistintos) * 100).toFixed(2) : '0.00';
        const pcCsat = missao.csatTotal ? ((missao.csatPromoters / missao.csatTotal) * 100).toFixed(2) : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="missao-nome">${missao.nome}</td>
            <td class="col-lideranca"><span class="big-percent">${pcLid !== '-' ? pcLid + '%' : '-'}</span></td>
            <td class="col-backoffice"><span class="big-percent">${pcBack !== '-' ? pcBack + '%' : '-'}</span></td>
            <td><span class="big-percent">${pcGeral}%</span></td>
            <td class="dotted-col"><span class="big-percent">${pcCp}%</span></td>
            <td class="highlight-col"><span class="big-percent" style="color:#16a34a">${pcCsat !== '-' ? pcCsat + '%' : '-'}</span><span class="small-count">${missao.csatTotal} avaliações</span></td>
        `;
        tbody.appendChild(tr);
    });

    const totEleg = totLidEleg + totBackEleg;
    const pcCsatTotal = totCsatGeral ? ((totCsatPromoters / totCsatGeral) * 100).toFixed(2) : 0;
    
    tfoot.innerHTML = `
        <tr>
            <td class="missao-nome"><i class="bi bi-calculator-fill" style="color: #fbbc82; margin-right: 8px;"></i> Aderência Total</td>
            <td class="col-lideranca"><span class="big-percent">${totLidEleg ? ((totLidConc / totLidEleg) * 100).toFixed(2) : 0}%</span></td>
            <td class="col-backoffice"><span class="big-percent">${totBackEleg ? ((totBackConc / totBackEleg) * 100).toFixed(2) : 0}%</span></td>
            <td><span class="big-percent">${totEleg ? (((totLidConc + totBackConc) / totEleg) * 100).toFixed(2) : 0}%</span></td>
            <td class="dotted-col"><span class="big-percent">${totalCPsDistintos ? ((allCpsConcluidosGeral.size / totalCPsDistintos) * 100).toFixed(2) : 0}%</span></td>
            <td class="highlight-col"><span class="big-percent" style="color:#16a34a">${pcCsatTotal}%</span></td>
        </tr>
    `;
}

function popularFiltroMissoes() {
    const filtro = document.getElementById('filtro-missao');
    filtro.innerHTML = '<option value="todos">Geral (Todos)</option>';
    const missoesUnicas = [...new Set(rawData.map(r => r.missao).filter(Boolean))];
    missoesUnicas.forEach(missao => {
        const option = document.createElement('option');
        option.value = missao; option.textContent = missao;
        filtro.appendChild(option);
    });
    // Remove listeners duplicados se a tela recarregar
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

function renderizarFeedbacks() {
    const listMain = document.getElementById('feedbacks-list');
    const listModal = document.getElementById('modal-comments-list');
    const comentados = csatData.filter(c => c.comentario && c.comentario.trim().length > 3).sort((a,b) => b.nota - a.nota);

    const renderCard = (c) => `
        <div class="feedback-card">
            <div class="feedback-header"><span class="feedback-mission">${c.missao}</span><span class="feedback-score"><i class="bi bi-star-fill"></i> ${c.nota}</span></div>
            <p class="feedback-text">"${c.comentario}"</p>
        </div>`;

    listMain.innerHTML = comentados.slice(0, 5).map(renderCard).join('');
    listModal.innerHTML = comentados.map(renderCard).join('');
}

document.getElementById('toggleLideranca').addEventListener('change', (e) => {
    document.getElementById('tabela-aderencia').classList.toggle('hide-lideranca', !e.target.checked);
});
document.getElementById('toggleBackoffice').addEventListener('change', (e) => {
    document.getElementById('tabela-aderencia').classList.toggle('hide-backoffice', !e.target.checked);
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