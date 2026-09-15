// ==========================================
// MÓDULO ISOLADO: INTELIGÊNCIA DE DADOS E FILTROS GLOBAIS
// ==========================================

const _originalSwitchView = window.switchView;
window.switchView = function(viewId) {
    if (_originalSwitchView) _originalSwitchView(viewId);
    
    if (viewId === 'view-analytics') {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(i => i.classList.remove('active'));
        if(navItems.length >= 3) navItems[2].classList.add('active'); 
        
        iniciarAnalytics();
    }
};

let chartMapa, chartFunil, chartHeatmap, chartProgresso;
let mapaCarregado = false;

async function iniciarAnalytics() {
    const selectComp = document.getElementById('filtro-ana-competencia');
    if (selectComp && window.listaCompetencias && selectComp.options.length === 0) {
        selectComp.innerHTML = window.listaCompetencias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    }

    popularGavetaFiltros();
    inicializarGraficosEAtualizar();
}

function inicializarGraficosEAtualizar() {
    if (!chartMapa) chartMapa = echarts.init(document.getElementById('chart-mapa'));
    if (!chartFunil) chartFunil = echarts.init(document.getElementById('chart-funil'));
    if (!chartHeatmap) chartHeatmap = echarts.init(document.getElementById('chart-heatmap'));
    if (!chartProgresso) chartProgresso = echarts.init(document.getElementById('chart-progresso'));

    if (!mapaCarregado) {
        chartMapa.showLoading(); 
        fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson')
            .then(r => r.json())
            .then(geoJson => {
                echarts.registerMap('BR', geoJson);
                chartMapa.hideLoading();
                mapaCarregado = true;
                window.aplicarFiltrosGlobais(); 
            })
            .catch(err => {
                console.error("Erro ao carregar mapa:", err);
                chartMapa.hideLoading();
                window.aplicarFiltrosGlobais();
            });
    } else {
        window.aplicarFiltrosGlobais();
    }
}

// ==========================================
// LÓGICA DA GAVETA DE FILTROS (Global)
// ==========================================
document.getElementById('btnOpenFilters').addEventListener('click', () => document.getElementById('filter-drawer').classList.add('open'));

const btnDashFilters = document.getElementById('btnOpenFiltersDash');
if (btnDashFilters) {
    btnDashFilters.addEventListener('click', () => document.getElementById('filter-drawer').classList.add('open'));
}

document.getElementById('btnCloseFilters').addEventListener('click', () => document.getElementById('filter-drawer').classList.remove('open'));

window.popularGavetaFiltros = function() {
    const dados = window.globalRawData || [];
    const compFiltro = document.getElementById('filtro-ana-competencia').value;
    const base = compFiltro ? dados.filter(d => (d.competencia || 'Gestão de Pessoas') === compFiltro) : dados;

    const extrair = (chave) => [...new Set(base.map(d => d[chave]).filter(Boolean))].sort();

    document.getElementById('filtro-tipo-cargo').innerHTML = extrair('tipo_cargo').map(v => `<label><input type="checkbox" value="${v}" class="chk-tc"> ${v}</label>`).join('');
    document.getElementById('filtro-cargo').innerHTML = extrair('cargo').map(v => `<label><input type="checkbox" value="${v}" class="chk-cg"> ${v}</label>`).join('');
    document.getElementById('filtro-cp').innerHTML = extrair('nome_cp').map(v => `<label><input type="checkbox" value="${v}" class="chk-cp"> ${v}</label>`).join('');
    document.getElementById('filtro-missao-ana').innerHTML = extrair('missao').map(v => `<label><input type="checkbox" value="${v}" class="chk-ms"> ${v}</label>`).join('');
    document.getElementById('filtro-estado').innerHTML = extrair('estado_uf').map(v => `<label><input type="checkbox" value="${v}" class="chk-uf"> ${v}</label>`).join('');
    document.getElementById('filtro-tipo-franquia').innerHTML = extrair('tipo_franquia').map(v => `<label><input type="checkbox" value="${v}" class="chk-tf"> ${v}</label>`).join('');
    document.getElementById('filtro-pdv').innerHTML = extrair('cod_pdv').map(v => `<label><input type="checkbox" value="${v}" class="chk-pdv"> ${v}</label>`).join('');
    
    const consultores = extrair('nome_consultor');
    document.getElementById('filtro-consultor').innerHTML = consultores.map(v => `<label><input type="checkbox" value="${v}" class="chk-resp"> ${v}</label>`).join('');
}

document.getElementById('filtro-ana-competencia').addEventListener('change', (e) => {
    const dashComp = document.getElementById('dash-competencia');
    if (dashComp) dashComp.value = e.target.value;
    
    window.limparFiltrosCascata(true); 
    window.popularGavetaFiltros();
    window.aplicarFiltrosGlobais();
});

document.getElementById('filtro-cp').addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('chk-cp')) { atualizarFiltroPDV(); }
});

function atualizarFiltroPDV() {
    const dados = window.globalRawData || [];
    const compFiltro = document.getElementById('filtro-ana-competencia').value;
    let base = compFiltro ? dados.filter(d => (d.competencia || 'Gestão de Pessoas') === compFiltro) : dados;

    const cpsSelecionados = Array.from(document.querySelectorAll('.chk-cp:checked')).map(el => el.value);
    
    if (cpsSelecionados.length > 0) {
        base = base.filter(d => cpsSelecionados.includes(d.nome_cp));
    }

    const pdvsFiltrados = [...new Set(base.map(d => d.cod_pdv).filter(Boolean))].sort();
    const pdvsMarcadosAntigos = Array.from(document.querySelectorAll('.chk-pdv:checked')).map(el => el.value);

    document.getElementById('filtro-pdv').innerHTML = pdvsFiltrados.map(v => {
        const isChecked = pdvsMarcadosAntigos.includes(v) ? 'checked' : '';
        return `<label><input type="checkbox" value="${v}" class="chk-pdv" ${isChecked}> ${v}</label>`;
    }).join('');
}

document.getElementById('filtro-tipo-cargo').addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('chk-tc')) { atualizarFiltroCargoEspecifico(); }
});

function atualizarFiltroCargoEspecifico() {
    const dados = window.globalRawData || [];
    const compFiltro = document.getElementById('filtro-ana-competencia').value;
    let base = compFiltro ? dados.filter(d => (d.competencia || 'Gestão de Pessoas') === compFiltro) : dados;

    const tiposSelecionados = Array.from(document.querySelectorAll('.chk-tc:checked')).map(el => el.value);
    
    if (tiposSelecionados.length > 0) {
        base = base.filter(d => tiposSelecionados.includes(d.tipo_cargo));
    }

    const cargosFiltrados = [...new Set(base.map(d => d.cargo).filter(Boolean))].sort();
    const cargosMarcadosAntigos = Array.from(document.querySelectorAll('.chk-cg:checked')).map(el => el.value);

    document.getElementById('filtro-cargo').innerHTML = cargosFiltrados.map(v => {
        const isChecked = cargosMarcadosAntigos.includes(v) ? 'checked' : '';
        return `<label><input type="checkbox" value="${v}" class="chk-cg" ${isChecked}> ${v}</label>`;
    }).join('');
}

window.limparFiltrosCascata = function(skipApply = false) {
    document.querySelectorAll('.filter-drawer input[type="checkbox"]').forEach(chk => chk.checked = false);
    document.getElementById('filtro-data-ini').value = '';
    document.getElementById('filtro-data-fim').value = '';
    
    atualizarFiltroPDV(); 
    atualizarFiltroCargoEspecifico();
    
    if (!skipApply) {
        window.aplicarFiltrosGlobais();
    }
};

document.getElementById('btnLimparFiltros').addEventListener('click', () => { window.limparFiltrosCascata(false); });

document.getElementById('btnAplicarFiltros').addEventListener('click', () => {
    window.aplicarFiltrosGlobais();
    document.getElementById('filter-drawer').classList.remove('open');
});

// ==========================================
// CÉREBRO GLOBAL DE FILTROS E ROTEAMENTO
// ==========================================
window.aplicarFiltrosGlobais = function() {
    const compFiltro = document.getElementById('filtro-ana-competencia').value;
    
    let base = (window.globalRawData || []).filter(d => (d.competencia || 'Gestão de Pessoas') === compFiltro && d.elegivel);

    const tcs = Array.from(document.querySelectorAll('.chk-tc:checked')).map(el => el.value);
    const cgs = Array.from(document.querySelectorAll('.chk-cg:checked')).map(el => el.value);
    const cps = Array.from(document.querySelectorAll('.chk-cp:checked')).map(el => el.value);
    const ms = Array.from(document.querySelectorAll('.chk-ms:checked')).map(el => el.value);
    const ufs = Array.from(document.querySelectorAll('.chk-uf:checked')).map(el => el.value);
    const resps = Array.from(document.querySelectorAll('.chk-resp:checked')).map(el => el.value);
    const tfs = Array.from(document.querySelectorAll('.chk-tf:checked')).map(el => el.value); 
    const pdvs = Array.from(document.querySelectorAll('.chk-pdv:checked')).map(el => el.value); 

    if (tcs.length > 0) base = base.filter(d => tcs.includes(d.tipo_cargo));
    if (cgs.length > 0) base = base.filter(d => cgs.includes(d.cargo));
    if (cps.length > 0) base = base.filter(d => cps.includes(d.nome_cp));
    if (ms.length > 0) base = base.filter(d => ms.includes(d.missao));
    if (ufs.length > 0) base = base.filter(d => ufs.includes(d.estado_uf));
    if (resps.length > 0) base = base.filter(d => resps.includes(d.nome_consultor));
    if (tfs.length > 0) base = base.filter(d => tfs.includes(d.tipo_franquia)); 
    if (pdvs.length > 0) base = base.filter(d => pdvs.includes(d.cod_pdv)); 

    const dtIni = document.getElementById('filtro-data-ini').value;
    const dtFim = document.getElementById('filtro-data-fim').value;

    let baseDashboard = [...base];
    if (dtIni || dtFim) {
        baseDashboard = baseDashboard.filter(d => {
            const dtI = d.data_inicio ? d.data_inicio.split('T')[0] : null;
            const dtC = d.data_conclusao ? d.data_conclusao.split('T')[0] : null;
            let iniValid = false;
            let concValid = false;
            
            if (dtI && (!dtIni || dtI >= dtIni) && (!dtFim || dtI <= dtFim)) iniValid = true;
            if (dtC && (!dtIni || dtC >= dtIni) && (!dtFim || dtC <= dtFim)) concValid = true;
            
            return iniValid || concValid;
        });
    }

    window.filteredRawData = baseDashboard;

    const matriculasDashboard = new Set(baseDashboard.map(d => d.id_matricula));
    window.filteredCsatData = (window.globalCsatData || []).filter(c => matriculasDashboard.has(c.chave_unica));

    if (window.atualizarComponentesDashboard) {
        window.atualizarComponentesDashboard();
    }
    
    const viewAnalytics = document.getElementById('view-analytics');
    if (viewAnalytics && viewAnalytics.style.display === 'block') {
        renderizarPainel(baseDashboard, dtIni, dtFim);
    }
}

function renderizarPainel(dados, dtIni, dtFim) {
    if (dados.length === 0) {
        document.getElementById('kpi-matriculas').innerText = "0";
        document.getElementById('kpi-aderencia').innerText = "0%";
        document.getElementById('kpi-nota').innerText = "-";
        if(chartFunil) chartFunil.clear(); 
        if(chartMapa) chartMapa.clear(); 
        if(chartHeatmap) chartHeatmap.clear(); 
        if(chartProgresso) chartProgresso.clear();
        
        renderizarTabelaNominal(dados);
        return;
    }

    const totalElegiveis = dados.length;
    let iniciadosPeriodo = 0, concluidosPeriodo = 0, somaNotas = 0, qtdNotas = 0;
    let b0 = 0, b25 = 0, b75 = 0, b99 = 0, b100 = 0;

    dados.forEach(d => {
        let iniciouNoPeriodo = false;
        
        const status = (d.status_matricula || '').toUpperCase().trim();
        const isIniciado = d.concluido || d.progresso_percentual > 0 || (status !== 'NÃO INICIADO' && status !== 'NOT_STARTED' && status !== '');
        
        if (isIniciado) {
            if (dtIni || dtFim) {
                if (d.data_inicio) {
                    const dataIniCard = d.data_inicio.split('T')[0];
                    if ((!dtIni || dataIniCard >= dtIni) && (!dtFim || dataIniCard <= dtFim)) {
                        iniciouNoPeriodo = true;
                    }
                }
            } else {
                iniciouNoPeriodo = true; 
            }
        }

        if (iniciouNoPeriodo) iniciadosPeriodo++;

        let concluiuNoPeriodo = false;
        if (d.concluido) {
            if (dtIni || dtFim) {
                if (d.data_conclusao) {
                    const dataConcCard = d.data_conclusao.split('T')[0];
                    if ((!dtIni || dataConcCard >= dtIni) && (!dtFim || dataConcCard <= dtFim)) {
                        concluiuNoPeriodo = true;
                    }
                }
            } else {
                concluiuNoPeriodo = true;
            }
        }

        if (concluiuNoPeriodo) {
            concluidosPeriodo++;
            if (d.media_notas !== null && d.media_notas !== undefined) { 
                somaNotas += d.media_notas; qtdNotas++; 
            }
        }

        const prog = d.progresso_percentual || 0;
        if (d.concluido || prog === 100) b100++;
        else if (prog >= 76) b99++;
        else if (prog >= 26) b75++;
        else if (prog > 0 || isIniciado) b25++;
        else b0++;
    });

    document.getElementById('kpi-matriculas').innerText = iniciadosPeriodo;
    document.getElementById('kpi-aderencia').innerText = totalElegiveis ? ((concluidosPeriodo / totalElegiveis) * 100).toFixed(1) + '%' : '0%';
    document.getElementById('kpi-nota').innerText = qtdNotas ? (somaNotas / qtdNotas).toFixed(1) : '-';

    chartProgresso.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function(params) {
            let res = '<b>Volume por Estágio:</b><br/>';
            params.forEach(p => res += `${p.marker} ${p.seriesName}: <b>${p.value}</b> pessoas<br/>`);
            return res;
        }},
        legend: { bottom: 0, textStyle: { color: '#64748b' } },
        grid: { left: '2%', right: '2%', bottom: '25%', top: '10%', containLabel: true },
        xAxis: { type: 'value', max: totalElegiveis, show: false }, 
        yAxis: { type: 'category', data: ['Colaboradores'], show: false },
        series: [
            { name: 'Não Iniciou (0%)', type: 'bar', stack: 'total', itemStyle: { color: '#e2e8f0' }, data: [b0] },
            { name: 'Iniciou (1-25%)', type: 'bar', stack: 'total', itemStyle: { color: '#fca5a5' }, data: [b25] },
            { name: 'Andamento (26-75%)', type: 'bar', stack: 'total', itemStyle: { color: '#fde047' }, data: [b75] },
            { name: 'Reta Final (76-99%)', type: 'bar', stack: 'total', itemStyle: { color: '#86efac' }, data: [b99] },
            { name: 'Concluído (100%)', type: 'bar', stack: 'total', itemStyle: { color: '#16a34a' }, data: [b100] }
        ]
    }, true);

    chartFunil.setOption({
        tooltip: { trigger: 'item', formatter: '{b} : {c} pessoas' },
        color: ['#011e38', '#fbbc82', '#16a34a'],
        series: [{
            type: 'funnel', left: '10%', width: '80%', sort: 'descending',
            label: { show: true, position: 'outside', formatter: '{b}\n{c}', color: '#475569', fontWeight: 'bold' },
            labelLine: { show: true, length: 20, lineStyle: { width: 1, type: 'solid' } },
            data: [
                { value: totalElegiveis, name: 'Elegíveis' },
                { value: iniciadosPeriodo, name: 'Iniciaram' },
                { value: concluidosPeriodo, name: 'Concluíram' }
            ]
        }]
    }, true);

    if (mapaCarregado) {
        const estados = {};
        const deParaUF = { 'AC':'Acre','AL':'Alagoas','AP':'Amapá','AM':'Amazonas','BA':'Bahia','CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás','MA':'Maranhão','MT':'Mato Grosso','MS':'Mato Grosso do Sul','MG':'Minas Gerais','PA':'Pará','PB':'Paraíba','PR':'Paraná','PE':'Pernambuco','PI':'Piauí','RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RS':'Rio Grande do Sul','RO':'Rondônia','RR':'Roraima','SC':'Santa Catarina','SP':'São Paulo','SE':'Sergipe','TO':'Tocantins' };

        dados.forEach(d => {
            if (!d.estado_uf) return;
            const nomeEstado = deParaUF[d.estado_uf.toUpperCase()] || d.estado_uf;
            if (!estados[nomeEstado]) estados[nomeEstado] = { elegiveis: 0, concluidos: 0, somaNota: 0, countNota: 0 };
            
            estados[nomeEstado].elegiveis++;
            
            let concluiuNoPeriodo = false;
            if (d.concluido) {
                if (dtIni || dtFim) {
                    if (d.data_conclusao) {
                        const dataConcCard = d.data_conclusao.split('T')[0];
                        if ((!dtIni || dataConcCard >= dtIni) && (!dtFim || dataConcCard <= dtFim)) {
                            concluiuNoPeriodo = true;
                        }
                    }
                } else {
                    concluiuNoPeriodo = true;
                }
            }

            if (concluiuNoPeriodo) { 
                estados[nomeEstado].concluidos++;
                if (d.media_notas !== null) { estados[nomeEstado].somaNota += d.media_notas; estados[nomeEstado].countNota++; }
            }
        });

        const mapData = Object.keys(estados).map(key => {
            const est = estados[key];
            const ad = est.elegiveis ? ((est.concluidos / est.elegiveis)*100).toFixed(1) : 0;
            const nt = est.countNota ? (est.somaNota / est.countNota).toFixed(1) : '-';
            return { name: key, value: parseFloat(ad), nota: nt, concluidos: est.concluidos };
        });

        chartMapa.setOption({
            tooltip: { trigger: 'item', formatter: p => p.name ? `<b>${p.name}</b><br/>Aderência (Período): ${p.value}%<br/>Nota Média: ${p.data.nota}<br/>Concluídos: ${p.data.concluidos}` : '' },
            visualMap: { min: 0, max: 100, text: ['Alto', 'Baixo'], calculable: true, inRange: { color: ['#f5f1eb', '#fbbc82', '#011e38'] } },
            series: [{ type: 'map', map: 'BR', roam: true, label: { show: false }, data: mapData }]
        }, true);
    }

    const datas = {};
    const datasConclusao = [];
    
    dados.filter(d => d.concluido && d.data_conclusao).forEach(d => {
        const dataFormatada = d.data_conclusao.split('T')[0]; 
        
        let passaFiltro = true;
        if (dtIni && dataFormatada < dtIni) passaFiltro = false;
        if (dtFim && dataFormatada > dtFim) passaFiltro = false;

        if (passaFiltro) {
            datas[dataFormatada] = (datas[dataFormatada] || 0) + 1;
            datasConclusao.push(dataFormatada);
        }
    });

    let anoDinamico = new Date().getFullYear().toString();
    if (datasConclusao.length > 0) {
        datasConclusao.sort();
        anoDinamico = datasConclusao[datasConclusao.length - 1].substring(0, 4);
    }

    const heatmapData = Object.keys(datas).map(dt => [dt, datas[dt]]);
    
    chartHeatmap.setOption({
        tooltip: { position: 'top', formatter: p => `Data: ${p.value[0]}<br/>Conclusões: ${p.value[1]}` },
        visualMap: { min: 0, max: Math.max(1, ...Object.values(datas)), type: 'piecewise', orient: 'horizontal', left: 'center', top: 0, inRange: { color: ['#e2e8f0', '#fbbc82', '#011e38'] } },
        calendar: { 
            top: 60, left: 30, right: 30, cellSize: ['auto', 20], 
            range: anoDinamico, 
            itemStyle: { borderWidth: 0.5 },
            dayLabel: { nameMap: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], color: '#64748b' },
            monthLabel: { nameMap: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'], color: '#011e38', fontWeight: 'bold' }
        },
        series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: heatmapData }]
    }, true);
    
    renderizarTabelaNominal(dados);
}

// ==========================================
// FUNÇÕES DA NOVA TABELA NOMINAL
// ==========================================
function renderizarTabelaNominal(dados) {
    const tbody = document.getElementById('tabela-nominal-body');
    if(!tbody) return;
    
    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 20px;">Nenhum colaborador encontrado com os filtros atuais.</td></tr>';
        return;
    }

    // Ordena alfabeticamente pelo nome para ficar organizado
    const dadosOrdenados = [...dados].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    let html = '';
    dadosOrdenados.forEach(d => {
        // Tratamento da data para DD/MM/YYYY
        let dataConc = '-';
        if (d.data_conclusao) {
            const datePart = d.data_conclusao.split('T')[0]; // Pega YYYY-MM-DD
            dataConc = datePart.split('-').reverse().join('/'); // Vira DD/MM/YYYY
        }
        
        const nota = (d.media_notas !== null && d.media_notas !== undefined) ? d.media_notas : '-';
        const progresso = d.progresso_percentual !== null ? Math.round(d.progresso_percentual) + '%' : '0%';
        
        // Etiqueta visual de status
        let corStatus = '#f1f5f9'; let corTexto = '#475569';
        if (d.concluido) { corStatus = '#dcfce7'; corTexto = '#16a34a'; }
        else if (d.progresso_percentual > 0 || (d.status_matricula && d.status_matricula.toUpperCase() !== 'NÃO INICIADO')) { corStatus = '#fef9c3'; corTexto = '#ca8a04'; }

        html += `
            <tr>
                <td>${d.missao || '-'}</td>
                <td style="font-weight: 500; color: var(--brand-dark);">${d.nome || '-'}</td>
                <td>${d.nome_cp || '-'}</td>
                <td>${d.tipo_cargo || '-'}</td>
                <td>${d.cargo || '-'}</td>
                <td><span style="background: ${corStatus}; color: ${corTexto}; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${d.status_matricula || '-'}</span></td>
                <td>${progresso}</td>
                <td>${nota}</td>
                <td>${dataConc}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Botão de Download CSV
document.addEventListener('DOMContentLoaded', () => {
    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', exportarCSVNominal);
    }
});

function exportarCSVNominal() {
    // Puxa exatamente os dados que estão com os filtros aplicados neste momento
    const dados = window.filteredRawData || [];
    
    if (dados.length === 0) {
        alert('Não há dados para exportar com os filtros selecionados.');
        return;
    }

    // Formata o pacote de dados para o SheetJS traduzir para Excel/CSV
    const dadosPlanilha = dados.map(d => {
        let dataConcFormatada = '-';
        if (d.data_conclusao) {
            dataConcFormatada = d.data_conclusao.split('T')[0].split('-').reverse().join('/');
        }

        return {
            'Missão': d.missao || '-',
            'Nome': d.nome || '-',
            'CP': d.nome_cp || '-',
            'Tipo de Cargo': d.tipo_cargo || '-',
            'Cargo': d.cargo || '-',
            'Status Matrícula': d.status_matricula || '-',
            'Progresso (%)': d.progresso_percentual || 0,
            'Nota de Avaliação': d.media_notas !== null && d.media_notas !== undefined ? d.media_notas : '-',
            'Data Conclusão': dataConcFormatada
        };
    });

    // Cria e baixa o arquivo CSV
    const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio Nominal");
    
    // Gera o arquivo com a data de hoje no nome
    const dataHoje = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Relatorio_Nominal_Escola_Negocios_${dataHoje}.csv`, { bookType: 'csv' });
}

window.addEventListener('resize', () => {
    if (chartMapa) chartMapa.resize();
    if (chartFunil) chartFunil.resize();
    if (chartHeatmap) chartHeatmap.resize();
    if (chartProgresso) chartProgresso.resize();
});