// 1. Configuração do Supabase
// Substitua pelas credenciais do seu projeto no painel do Supabase (Settings > API)
const SUPABASE_URL = 'https://sfjrhiwhphlkozjktupi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmanJoaXdocGhsa296amt0dXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzA5MzYsImV4cCI6MjEwMjgwNjkzNn0.j681cFEmApLMkmlnhe8HrVknShQEWZ6fNr3ofil0-oM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. Elementos da Interface
const fileFarolInput = document.getElementById('fileFarol');
const fileUnibeInput = document.getElementById('fileUnibe');
const fileCsatInput = document.getElementById('fileCsat'); // NOVO
const btnProcessar = document.getElementById('btnProcessar');
const statusDiv = document.getElementById('status');

// 3. Função para ler o Excel
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

// 4. Lógica Principal
btnProcessar.addEventListener('click', async () => {
    const fileFarol = fileFarolInput.files[0];
    const fileUnibe = fileUnibeInput.files[0];
    const fileCsat = fileCsatInput ? fileCsatInput.files[0] : null;

    if (!fileFarol || !fileUnibe) {
        statusDiv.style.color = 'red';
        statusDiv.innerText = "Por favor, selecione FAROL e UNIBÊ.";
        return;
    }

    btnProcessar.disabled = true;
    statusDiv.style.color = '#2563eb';
    statusDiv.innerText = "Lendo planilhas... aguarde.";

    try {
        const dataFarol = await readExcel(fileFarol);
        const dataUnibe = await readExcel(fileUnibe);
        const dataCsat = await readExcel(fileCsat);

        // --- Processamento CSAT (Se existir) ---
        if (dataCsat.length > 0) {
            statusDiv.innerText = "Processando pesquisas de CSAT...";
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

            // Filtra só quem tem nota e envia pro banco
            const csatFinal = Array.from(csatMap.values()).filter(c => c.nota !== null);
            if (csatFinal.length > 0) {
                await supabaseClient.from('avaliacoes_csat').upsert(csatFinal, { onConflict: 'chave_unica' });
            }
        }

        statusDiv.innerText = "Consultando gabarito de Franquias...";

        const { data: franquiasData, error: errFranquias } = await supabaseClient.from('registro_franquias').select('*');
        if (errFranquias) throw errFranquias;

        const mapaFranquias = new Map();
        franquiasData.forEach(item => {
            if (item.nome_cp) mapaFranquias.set(item.nome_cp.trim().toLowerCase(), item);
        });

        statusDiv.innerText = "Cruzando dados principais...";

        const unibeMap = new Map();
        dataUnibe.forEach(row => {
            if (row['Username']) {
                unibeMap.set(row['Username'].toString().trim().toLowerCase(), row);
            }
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

        statusDiv.innerText = `Enviando ${finalData.length} registros...`;

        const { error } = await supabaseClient.from('treinamentos_lideranca').upsert(finalData, { onConflict: 'id_matricula' });
        if (error) throw error;

        statusDiv.style.color = 'green';
        statusDiv.innerText = "Base unificada, CSAT e gabarito salvos com sucesso!";
        
    } catch (error) {
        console.error("Erro completo:", error);
        statusDiv.style.color = 'red';
        statusDiv.innerText = `Erro: ${error.message || 'Verifique o console.'}`;
    } finally {
        btnProcessar.disabled = false;
    }
});