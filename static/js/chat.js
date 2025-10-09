// static/js/chat.js

document.addEventListener('DOMContentLoaded', () => {
    // --- SCRIPT DO CHAT ---
    const API_BASE_URL = "";
    let aiSettings = {};
    let lastReportData = null;

    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const pdfBtn = document.getElementById('pdf-btn');

    function addMessageBubble(sender, text) {
        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', sender);
        const avatar = document.createElement('img');
        avatar.classList.add('avatar');
        avatar.src = sender === 'luca' ? '/static/PFia.png' : '/static/user_avatar.png';
        const message = document.createElement('div');
        message.classList.add('message');
        if (text === '...typing...') {
            message.classList.add('typing-indicator');
            message.innerHTML = '<span></span><span></span><span></span>';
        } else {
            const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
            let newText = text.replace(urlRegex, function(url) {
                return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
            });
            message.innerHTML = newText.replace(/\n/g, '<br>');
        }
        bubble.appendChild(avatar);
        bubble.appendChild(message);
        chatHistory.appendChild(bubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return bubble;
    }
    
    async function fetchAiSettings() {
        showLoading();
        try {
            aiSettings = await fazerRequisicaoAutenticada(`${API_BASE_URL}/api/settings`);
            if(aiSettings) {
                addMessageBubble('luca', `Olá! Sou o LUCA. Como posso ajudar a analisar seus dados hoje?`);
            } else {
                 addMessageBubble('luca', 'Não foi possível carregar as configurações da IA. Verifique as permissões e tente novamente.');
                 chatInput.disabled = true;
                 sendBtn.disabled = true;
            }
        } catch (error) {
            console.error(error);
            let errorMessage = 'Desculpe, não consegui carregar minhas configurações.';
            if (error && error.message && error.message.includes("Not authenticated")) {
                errorMessage = 'Sua sessão expirou. Por favor, <a href="/login">faça o login novamente</a> para usar o chat.';
            }
            addMessageBubble('luca', errorMessage);
            chatInput.disabled = true;
            sendBtn.disabled = true;
        } finally {
            hideLoading();
        }
    }

    async function handleSendMessage() {
        const userText = chatInput.value.trim();
        if (!userText) return;

        addMessageBubble('user', userText);
        chatInput.value = '';
        const typingBubble = addMessageBubble('luca', '...typing...');

        chatInput.disabled = true;
        sendBtn.disabled = true;
        pdfBtn.style.display = 'none';

        try {
            const payload = {
                prompt: userText,
                system_prompt: aiSettings.system_prompt,
                schema_info: aiSettings.schema_info
            };
            
            const data = await fazerRequisicaoAutenticada(`${API_BASE_URL}/luca/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            chatHistory.removeChild(typingBubble);
            
            if(data) {
                addMessageBubble('luca', data.answer);
                if (data.report_data) {
                    lastReportData = data.report_data;
                    pdfBtn.style.display = 'flex';
                }
            } else {
                addMessageBubble('luca', 'Desculpe, não recebi uma resposta válida do servidor.');
            }

        } catch (error) {
            if(typingBubble && typingBubble.parentNode) {
                chatHistory.removeChild(typingBubble);
            }
            console.error(error);
            let friendlyError = error && error.message ? error.message : "Erro desconhecido";
             if (friendlyError.includes("Not authenticated") || friendlyError.includes("403")) {
                friendlyError = 'Sua sessão expirou ou você não tem permissão. Por favor, <a href="/login">faça o login novamente</a>.';
            } else if (friendlyError.includes("408")) {
                 friendlyError = 'A requisição demorou demais para responder. Tente novamente ou simplifique a pergunta.'
            }
            addMessageBubble('luca', `Desculpe, ocorreu um erro: ${friendlyError}`);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }

    async function generatePdf() {
        if (!lastReportData) { alert("Não há dados de relatório para gerar."); return; }
        showLoading();
        try {
            const response = await fetch('/static/report_template.html');
            if(!response.ok) throw new Error("Template do relatório não encontrado.");
            let template = await response.text();

            const now = new Date();
            const logo_url = new URL('/static/PFia.png', window.location.origin).href;
            template = template.replace('{{TITLE}}', lastReportData.title);
            template = template.replace('{{SUMMARY}}', lastReportData.summary.replace(/\n/g, '<br>'));
            template = template.replace('{{LOGO_URL}}', logo_url);
            template = template.replace('{{GENERATION_DATE}}', now.toLocaleDateString('pt-BR'));
            template = template.replace('{{CURRENT_YEAR}}', now.getFullYear());

            const headersHtml = lastReportData.table_headers.map(h => `<th>${h}</th>`).join('');
            template = template.replace('{{TABLE_HEADERS}}', headersHtml);
            const rowsHtml = lastReportData.table_rows.map(row => `<tr>${lastReportData.table_headers.map(header => `<td>${row[header] || ''}</td>`).join('')}</tr>`).join('');
            template = template.replace('{{TABLE_ROWS}}', rowsHtml);

            const element = document.createElement('div');
            element.innerHTML = template;
            const options = { margin: 1, filename: `${lastReportData.title.replace(/ /g, '_')}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas:  { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            await html2pdf().from(element).set(options).save();
        } catch(e) { 
            console.error("Erro ao gerar PDF:", e); 
            alert("Ocorreu um erro ao tentar gerar o relatório em PDF."); 
        } finally {
            hideLoading();
        }
    }

    // --- LÓGICA DE EVENTOS ---
    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } });
    pdfBtn.addEventListener('click', generatePdf);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const auth = firebase.auth();
            auth.signOut().then(() => {
                sessionStorage.removeItem('firebaseIdToken');
                window.location.href = '/login';
            }).catch((error) => {
                console.error('Logout Error', error);
                alert('Erro ao tentar sair.');
            });
        });
    }

    fetchAiSettings();
});