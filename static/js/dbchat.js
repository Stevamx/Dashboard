// static/js/dbchat.js
(async () => {
    // --- ELEMENTOS DO DOM ---
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const actionsBtn = document.getElementById('actions-btn');
    const micBtn = document.getElementById('mic-btn');
    const chatInputWrapper = document.querySelector('.chat-input-wrapper');
    const recordingOverlay = document.getElementById('recording-overlay');
    const lucaHeaderAvatar = document.getElementById('luca-header-avatar');
    const suggestionsModal = document.getElementById('suggestions-modal');
    const closeSuggestionsModalBtn = document.getElementById('close-suggestions-modal');
    const suggestionsGrid = document.getElementById('suggestions-grid');

    if (!chatHistory || !chatInput || !sendBtn || !lucaHeaderAvatar || !suggestionsModal || !closeSuggestionsModalBtn || !suggestionsGrid || !uploadBtn || !fileInput || !actionsBtn || !micBtn || !recordingOverlay) {
        return;
    }

    // ### LÓGICA DE TRANSCRIÇÃO DE ÁUDIO REESCRITA E APRIMORADA ###
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let isRecording = false;

    // Verifica se a API é suportada e se o contexto é seguro (HTTPS)
    if (SpeechRecognition && window.isSecureContext) {
        micBtn.style.display = 'flex';
    } else {
        micBtn.style.display = 'none';
        console.warn("API de Reconhecimento de Fala não suportada ou contexto não seguro (HTTPS necessário).");
    }
    
    function startRecording() {
        if (isRecording || !SpeechRecognition) return;

        // Cria uma nova instância a cada gravação para evitar problemas em alguns navegadores
        recognition = new SpeechRecognition();
        recognition.continuous = false; // Grava uma frase de cada vez
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;

        let finalTranscript = '';

        recognition.onresult = (event) => {
            finalTranscript = event.results[0][0].transcript;
        };

        recognition.onerror = (event) => {
            console.error('Erro no reconhecimento de fala:', event.error);
            let message = 'Ocorreu um erro durante a gravação. Tente novamente.';
            if (event.error === 'no-speech') {
                message = 'Não detectei nenhuma fala. Por favor, tente falar mais perto do microfone.';
            } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                message = 'A permissão para o microfone foi negada. Por favor, habilite nas configurações do seu navegador.';
            }
            showNotification('Erro de Gravação', message, 'error');
        };
        
        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove('recording');
            chatInputWrapper.classList.remove('is-recording');
            recordingOverlay.classList.remove('visible');

            if (finalTranscript.trim()) {
                chatInput.value = finalTranscript;
                handleSendMessage();
            }
        };

        // Solicita permissão e inicia a gravação
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
                isRecording = true;
                chatInput.placeholder = 'Ouvindo...';
                recognition.start();
                micBtn.classList.add('recording');
                chatInputWrapper.classList.add('is-recording');
                recordingOverlay.classList.add('visible');
            })
            .catch(err => {
                console.error("Erro ao obter acesso ao microfone:", err);
                showNotification('Erro no Microfone', 'Não foi possível acessar o microfone. Verifique se ele está conectado e se você permitiu o acesso a este site (requer HTTPS).', 'error');
            });
    }

    function stopRecording() {
        if (isRecording && recognition) {
            recognition.stop();
        }
    }
 // Implementa o "Pressione e Segure para gravar"
    micBtn.addEventListener('mousedown', startRecording);
    micBtn.addEventListener('mouseup', stopRecording);
    micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
    micBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

    // ### ALTERAÇÃO PRINCIPAL APLICADA AQUI ###
    // --- LÓGICA DE LEITURA DE TEXTO (TEXT-TO-SPEECH) COM GOOGLE CLOUD API ---
    let currentAudio = null; // Guarda a instância do áudio atual
    let currentPlayingButton = null; // Guarda o botão que está tocando

    // Função para parar qualquer áudio que esteja tocando
    function stopCurrentAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        if (currentPlayingButton) {
            currentPlayingButton.classList.remove('playing');
            currentPlayingButton = null;
        }
    }

    // Limpa o texto de emojis e caracteres especiais para a fala
    function cleanTextForSpeech(text) {
        // Remove emojis usando uma expressão regular mais abrangente
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
        // Remove markdown (**, *) e outros caracteres que não devem ser lidos
        const specialCharsRegex = /[\*\_]/g;
        return text.replace(emojiRegex, '').replace(specialCharsRegex, '').trim();
    }
    
    async function speakText(textToSpeak, clickedButton) {
        // Se o botão clicado já estiver tocando, para o áudio e sai da função.
        if (clickedButton.classList.contains('playing')) {
            stopCurrentAudio();
            return;
        }
        
        // Para qualquer outro áudio que possa estar tocando antes de iniciar um novo.
        stopCurrentAudio();

        const cleanText = cleanTextForSpeech(textToSpeak);
        if (!cleanText) {
            showNotification('Atenção', 'Não há texto válido para ser lido.', 'warning');
            return;
        }
        
        clickedButton.classList.add('playing');
        currentPlayingButton = clickedButton;

        try {
            // Chama o novo endpoint no backend para gerar o áudio.
            const response = await fazerRequisicaoAutenticada('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText })
            });

            if (response && response.audioContent) {
                // Cria um objeto de Áudio a partir do base64 recebido.
                const audioSrc = `data:audio/mp3;base64,${response.audioContent}`;
                currentAudio = new Audio(audioSrc);

                // Quando o áudio terminar de tocar, limpa o estado.
                currentAudio.onended = () => {
                    stopCurrentAudio();
                };

                // Em caso de erro na reprodução, também limpa o estado.
                currentAudio.onerror = (e) => {
                    console.error('Erro ao reproduzir o áudio:', e);
                    showNotification('Erro de Áudio', 'Não foi possível reproduzir a resposta.', 'error');
                    stopCurrentAudio();
                };

                currentAudio.play();
            } else {
                throw new Error("A resposta da API de áudio veio vazia.");
            }
        } catch (error) {
            console.error('Erro na síntese de fala:', error);
            showNotification('Erro de Áudio', `Não foi possível gerar a resposta em áudio. Detalhes: ${error.message}`, 'error');
            stopCurrentAudio();
        }
    }


    // --- FUNÇÕES DA INTERFACE ---

    function renderSuggestions() {
        suggestionsGrid.innerHTML = '';
        const suggestions = [
            { text: 'Ranking de Vendedores', prompt: 'Qual o ranking de vendedores do mês?', icon: '🏆' },
            { text: 'Como atingir minha meta?', prompt: 'Como posso atingir a meta?', icon: '🎯' },
            { text: 'Ideias de promoções', prompt: 'Preciso de ideias de promoção', icon: '🏷️' },
            { text: 'Produtos mais vendidos', prompt: 'Quais os produtos mais vendidos?', icon: '📈' },
            { text: 'Produtos com baixo estoque', prompt: 'Quais produtos tenho com baixo estoque?', icon: '📦' },
            { text: 'Me Surpreenda!', prompt: 'Me surpreenda!', icon: '🎲', surprise: true }
        ];
        suggestions.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            if (s.surprise) btn.classList.add('surprise');
            btn.innerHTML = `${s.icon} ${s.text}`;
            btn.addEventListener('click', () => {
                chatInput.value = s.prompt;
                handleSendMessage();
                closeSuggestionsModal();
            });
            suggestionsGrid.appendChild(btn);
        });
    }

    function openSuggestionsModal() {
        renderSuggestions();
        suggestionsModal.classList.add('active');
        lucaHeaderAvatar.classList.add('active');
    }

    function closeSuggestionsModal() {
        suggestionsModal.classList.remove('active');
        lucaHeaderAvatar.classList.remove('active');
    }
    
    lucaHeaderAvatar.addEventListener('click', openSuggestionsModal);
    actionsBtn.addEventListener('click', openSuggestionsModal);
    closeSuggestionsModalBtn.addEventListener('click', closeSuggestionsModal);
    suggestionsModal.addEventListener('click', (e) => {
        if (e.target === suggestionsModal) closeSuggestionsModal();
    });

    function addMessageBubble(sender, text, isHistory = false, type = 'normal') {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${sender}`;
        
        if (type === 'file-info') {
            bubble.classList.add('file-info');
        }

        const avatar = document.createElement('div');
        if (sender === 'luca') {
            avatar.className = 'avatar avatar-luca';
        } else {
            avatar.className = 'avatar avatar-user';
            avatar.innerHTML = `<i class='bx bxs-user'></i>`;
        }

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        if (text === '...typing...') {
            bubble.classList.add('typing-indicator');
            messageContent.innerHTML = '<span></span><span></span><span></span>';
        } else {
            const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
            let newText = text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
            newText = newText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
            messageContent.innerHTML = newText.replace(/\n/g, '<br>');

            if (sender === 'luca') {
                const ttsButton = document.createElement('button');
                ttsButton.className = 'tts-btn';
                ttsButton.title = 'Ouvir resposta';
                ttsButton.innerHTML = `<i class='bx bxs-volume-full'></i>`;
                
                ttsButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cleanText = messageContent.textContent || messageContent.innerText || '';
                    speakText(cleanText, ttsButton);
                });
                
                messageContent.appendChild(ttsButton);
            }
        }

        bubble.appendChild(avatar);
        bubble.appendChild(messageContent);
        chatHistory.appendChild(bubble);
        
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return bubble;
    }
    
    function addDateSeparator(dateString) {
        const separator = document.createElement('div');
        separator.className = 'chat-date-separator';
        separator.textContent = dateString;
        chatHistory.appendChild(separator);
    }

    function getFriendlyDate(dateStr) {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const messageDate = new Date(dateStr + 'T12:00:00');
        if (today.toDateString() === messageDate.toDateString()) return 'Hoje';
        if (yesterday.toDateString() === messageDate.toDateString()) return 'Ontem';
        return messageDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        chatInput.dispatchEvent(new Event('keyup'));
    });

    chatInput.addEventListener('keyup', () => {
        const hasText = chatInput.value.trim().length > 0;
        if (hasText) {
            sendBtn.style.display = 'flex';
            micBtn.style.display = 'none';
        } else {
            sendBtn.style.display = 'none';
            micBtn.style.display = 'flex';
        }
    });

    async function loadChatHistory() {
        try {
            const historyByDate = await fazerRequisicaoAutenticada('/luca/history');
            chatHistory.innerHTML = '';
            const sortedDates = Object.keys(historyByDate).sort();
            if (sortedDates.length > 0) {
                sortedDates.forEach(dateStr => {
                    addDateSeparator(getFriendlyDate(dateStr));
                    historyByDate[dateStr].forEach(message => {
                        const sender = message.role === 'model' ? 'luca' : 'user';
                        addMessageBubble(sender, message.content, true);
                    });
                });
            } else {
                const insightData = await fazerRequisicaoAutenticada('/alerts/daily-insight');
                let insightMessage = "💡 Olá! Eu sou o LUCA, seu assistente de dados. Estou pronto para te ajudar a analisar suas vendas. Como posso te auxiliar hoje?";
                if (insightData && (insightData.comparison_percent !== undefined || insightData.top_product)) {
                    const isUp = insightData.comparison_percent >= 0;
                    const percent = Math.abs(insightData.comparison_percent).toFixed(0);
                    insightMessage = `💡 **Descoberta do Dia:** Analisei seus dados e notei que as vendas de ontem foram <strong class="${isUp ? 'positive' : 'negative'}">${percent}% ${isUp ? 'maiores' : 'menores'}</strong> que a média para este dia da semana.`;
                    if (insightData.top_product) {
                        insightMessage += ` O produto **"${insightData.top_product}"** foi o grande destaque!`;
                    }
                    insightMessage += "<br><br>Estou aqui para te ajudar a entender seu negócio. O que você gostaria de analisar?";
                }
                addMessageBubble('luca', insightMessage);
            }
        } catch (error) {
            console.error("Não foi possível carregar o módulo de chat:", error);
            addMessageBubble('luca', "💡 Olá! Tive um pequeno problema ao carregar meus insights, mas estou pronto para te ajudar. Como posso te auxiliar hoje?");
        } finally {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }

    async function handleSendMessage() {
        stopCurrentAudio(); // Para a fala se uma nova mensagem for enviada
        const userText = chatInput.value.trim();
        if (!userText) return;

        addMessageBubble('user', userText);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.dispatchEvent(new Event('keyup'));
        const typingBubble = addMessageBubble('luca', '...typing...');
        sendBtn.disabled = true;
        try {
            const payload = { prompt: userText };
            const data = await fazerRequisicaoAutenticada('/luca/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (typingBubble.parentNode) typingBubble.remove();
            addMessageBubble('luca', data.answer || 'Desculpe, não recebi uma resposta válida.');
        } catch (error) {
            if (typingBubble.parentNode) typingBubble.remove();
            console.error(error);
            addMessageBubble('luca', `Desculpe, ocorreu um erro: ${error?.message || "Erro desconhecido"}`);
        } finally {
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }
    
    uploadBtn.addEventListener('click', () => {
        stopCurrentAudio(); // Para a fala se um upload for iniciado
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const allowedTypes = [ 'text/plain', 'text/csv', 'application/json', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ];
        if (!allowedTypes.includes(file.type)) {
            showNotification('Arquivo Inválido', 'Por favor, selecione um arquivo .txt, .csv, .json, .pdf, .xlsx ou .docx.', 'warning');
            fileInput.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Arquivo Muito Grande', 'O tamanho máximo do arquivo é de 5MB.', 'warning');
            fileInput.value = '';
            return;
        }

        addMessageBubble('user', `Analisando o arquivo: <strong>${file.name}</strong>`, false, 'file-info');
        const typingBubble = addMessageBubble('luca', '...typing...');
        sendBtn.disabled = true;
        uploadBtn.disabled = true;
        actionsBtn.disabled = true;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const data = await fazerRequisicaoAutenticada('/luca/upload-and-analyze', {
                method: 'POST',
                body: formData 
            });
            
            if (typingBubble.parentNode) typingBubble.remove();
            addMessageBubble('luca', data.answer || 'Não consegui analisar o arquivo.');

        } catch (error) {
            if (typingBubble.parentNode) typingBubble.remove();
            console.error('Erro no upload:', error);
            addMessageBubble('luca', `Desculpe, ocorreu um erro ao analisar o arquivo: ${error?.message || "Erro desconhecido"}`);
        } finally {
            sendBtn.disabled = false;
            uploadBtn.disabled = false;
            actionsBtn.disabled = false;
            fileInput.value = '';
        }
    });

    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            handleSendMessage(); 
        } 
    });
    
    await loadChatHistory();
    chatInput.dispatchEvent(new Event('keyup'));
})();