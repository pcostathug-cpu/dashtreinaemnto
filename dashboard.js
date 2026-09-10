// 1. Configuração do Supabase (Mesmas credenciais do app.js)
const SUPABASE_URL = 'https://sfjrhiwhphlkozjktupi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmanJoaXdocGhsa296amt0dXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzA5MzYsImV4cCI6MjEwMjgwNjkzNn0.j681cFEmApLMkmlnhe8HrVknShQEWZ6fNr3ofil0-oM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
        console.error("Erro:", error);
        alert("Erro ao carregar dados do painel.");
    }
}

function processarTabelaPrincipal() {
    const missoesMap = new Map();

    // Map para CSAT
    csatData.forEach(c => {
        if (!missoesMap.has(c.missao)) {
            missoesMap.set(c.missao, { nome: c.missao, liderancaElegivel: 0, liderancaConcluido: 0, backofficeElegivel: 0, backofficeConcluido: 0, cpsConcluidos: new Set(), csatPromoters: 0, csatTotal: 0 });
        }
        const m = missoesMap.get(c.missao);
        m.csatTotal++;
        if (c.nota >= 4) m.csatPromoters++; // Notas 4 e 5 = CSAT Positivo
    });

    rawData.forEach(row => {
        const missao = row.missao || 'Sem Nome';
        if (!missoesMap.has(missao)) {
            missoesMap.set(missao, { nome: missao, liderancaElegivel: 0, liderancaConcluido: 0, backofficeElegivel: 0, backofficeConcluido: 0, cpsConcluidos: new Set(), csatPromoters: 0, csatTotal: 0 });
        }

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

    let totLidEleg = 0, totLidConc = 0, totBackEleg = 0, totBackConc = 0;
    let totCsatPromoters = 0, totCsatGeral = 0;
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
        
        // Coluna CSAT
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

// Renderização dos Feedbacks CSAT (Apenas quem deixou comentário)
function renderizarFeedbacks() {
    const listMain = document.getElementById('feedbacks-list');
    const listModal = document.getElementById('modal-comments-list');
    
    const comentados = csatData.filter(c => c.comentario && c.comentario.trim().length > 3).sort((a,b) => b.nota - a.nota);

    const renderCard = (c) => `
        <div class="feedback-card">
            <div class="feedback-header">
                <span class="feedback-mission">${c.missao}</span>
                <span class="feedback-score"><i class="bi bi-star-fill"></i> ${c.nota}</span>
            </div>
            <p class="feedback-text">"${c.comentario}"</p>
        </div>
    `;

    // 5 na tela principal (foco na exportação)
    listMain.innerHTML = comentados.slice(0, 5).map(renderCard).join('');
    // Todos no modal
    listModal.innerHTML = comentados.map(renderCard).join('');
}

// Lógicas de UI (Filtros, Modais, Exportar)
// Lógicas de UI (Filtros, Modais, Exportar)
function popularFiltroMissoes() {
    const filtro = document.getElementById('filtro-missao');
    const missoesUnicas = [...new Set(rawData.map(r => r.missao).filter(Boolean))];
    
    missoesUnicas.forEach(missao => {
        const option = document.createElement('option');
        option.value = missao;
        option.textContent = missao;
        filtro.appendChild(option);
    });

    filtro.addEventListener('change', (e) => processarRanking(e.target.value));
}

function processarRanking(missaoFiltro) {
    const list = document.getElementById('ranking-list');
    list.innerHTML = ''; 

    const macrosMap = new Map();

    rawData.forEach(row => {
        if (missaoFiltro !== 'todos' && row.missao !== missaoFiltro) return;
        if (!row.elegivel) return; 

        const macro = row.regional_macro || 'Sem Regional';
        
        if (!macrosMap.has(macro)) {
            macrosMap.set(macro, { nome: macro, elegivel: 0, concluido: 0 });
        }

        const stats = macrosMap.get(macro);
        stats.elegivel++;
        if (row.concluido) stats.concluido++;
    });

    const rankingArray = Array.from(macrosMap.values()).map(macro => {
        return {
            nome: macro.nome,
            aderencia: macro.elegivel ? (macro.concluido / macro.elegivel) * 100 : 0
        };
    }).sort((a, b) => b.aderencia - a.aderencia);

    rankingArray.forEach((item, index) => {
        let rankClass = 'rank-other';
        let icon = '';

        if (index === 0) {
            rankClass = 'rank-1';
            icon = '<i class="bi bi-trophy-fill" style="color: #fbbc82; margin-right: 12px; font-size: 22px;"></i>';
        } else if (index === 1) {
            rankClass = 'rank-2';
            icon = '<i class="bi bi-award-fill" style="color: #94a3b8; margin-right: 12px; font-size: 20px;"></i>';
        } else if (index === 2) {
            rankClass = 'rank-3';
            icon = '<i class="bi bi-award" style="color: #cbd5e1; margin-right: 12px; font-size: 18px;"></i>';
        }

        const div = document.createElement('div');
        div.className = `rank-card ${rankClass}`;
        div.innerHTML = `
            <div class="rank-info">
                <span class="rank-position">${index + 1}º</span>
                <span class="rank-regional">${icon}${item.nome}</span>
            </div>
            <span class="rank-percent">${item.aderencia.toFixed(2)}%</span>
        `;
        list.appendChild(div);
    });
}

// Lógica Ocultar Colunas
document.getElementById('toggleLideranca').addEventListener('change', (e) => {
    document.getElementById('tabela-aderencia').classList.toggle('hide-lideranca', !e.target.checked);
});
document.getElementById('toggleBackoffice').addEventListener('change', (e) => {
    document.getElementById('tabela-aderencia').classList.toggle('hide-backoffice', !e.target.checked);
});

// Lógica Modal
document.getElementById('btnOpenModal').addEventListener('click', () => {
    document.getElementById('modalComments').classList.add('active');
});
document.getElementById('btnCloseModal').addEventListener('click', () => {
    document.getElementById('modalComments').classList.remove('active');
});

// Lógica Exportar
document.getElementById('btnExport').addEventListener('click', () => {
    const btn = document.getElementById('btnExport');
    const container = document.getElementById('relatorio-export');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Gerando...';
    btn.disabled = true;

    setTimeout(() => {
        html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#f5f1eb' }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'Relatorio_EscolaDeNegocios_FDR.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            btn.innerHTML = originalText; btn.disabled = false;
        });
    }, 150);
});

initDashboard();