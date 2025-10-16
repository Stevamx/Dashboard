// static/js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Variáveis do DOM ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginContainer = document.querySelector('.login-container');

    const companySelectionModal = document.getElementById('company-selection-modal');
    const companyLinksContainer = document.getElementById('modal-company-links');
    const companySelectionLogoutLink = document.getElementById('company-selection-logout-link');
    
    const changePasswordModal = document.getElementById('change-password-modal');
    const closePasswordModalBtn = document.getElementById('close-password-modal-btn');
    const cancelPasswordModalBtn = document.getElementById('cancel-password-modal-btn');
    const confirmPasswordChangeBtn = document.getElementById('confirm-password-change-btn');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    const auth = firebase.auth();

    // --- Funções de Lógica ---
    function showCompanySelection(companies) {
        companyLinksContainer.innerHTML = '';
        companies.forEach(company => {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'panel-card';
            link.dataset.cnpj = company.cnpj;
            link.innerHTML = `
                <div class="panel-icon"><i class='bx bxs-business'></i></div>
                <div class="panel-info">
                    <h3>${company.nome_fantasia}</h3>
                    <p>${company.cnpj}</p>
                </div>
                <div class="panel-arrow"><i class='bx bx-right-arrow-alt'></i></div>
            `;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showLoading();
                localStorage.setItem('savedCompanyId', company.cnpj);
                sessionStorage.setItem('targetCompanyId', company.cnpj);
                window.location.reload(); // Recarrega para acionar a mudança de estado e o redirecionamento
            });
            companyLinksContainer.appendChild(link);
        });

        loginContainer.classList.add('fade-out');
        companySelectionModal.classList.add('visible');
        hideLoading();
    }
    
    async function handleUserLogin(user) {
        try {
            const token = await user.getIdToken(true);
            sessionStorage.setItem('firebaseIdToken', token);
            
            // Se uma empresa já está selecionada na sessão, redireciona imediatamente.
            if (sessionStorage.getItem('targetCompanyId')) {
                window.location.href = '/dashboard-web';
                return;
            }

            showLoading();
            const companyData = await fazerRequisicaoAutenticada('/api/users/my-companies');
            
            if (companyData.is_superadmin) {
                hideLoading();
                const targetCnpj = await showCompanySelectionModal();
                if (targetCnpj) {
                    showLoading();
                    localStorage.setItem('savedCompanyId', targetCnpj);
                    sessionStorage.setItem('targetCompanyId', targetCnpj);
                    window.location.reload();
                } else {
                    auth.signOut(); // Se o superadmin cancelar, faz logout.
                    throw new Error("A seleção de uma empresa é obrigatória para o modo de suporte.");
                }
                return;
            } 
            
            if (companyData.companies.length === 0) {
                throw new Error("Nenhuma empresa associada à sua conta.");
            }

            if (companyData.companies.length === 1) {
                const cnpj = companyData.companies[0].cnpj;
                localStorage.setItem('savedCompanyId', cnpj);
                sessionStorage.setItem('targetCompanyId', cnpj);
                // Empresa definida, redireciona para o dashboard.
                window.location.href = '/dashboard-web';
            } else {
                // Usuário tem múltiplas empresas, mostra a tela de seleção.
                hideLoading();
                showCompanySelection(companyData.companies);
            }
        } catch (error) {
            hideLoading();
            console.error("Erro no fluxo de login:", error);
            showNotification('Falha no Acesso', error.message, 'error');
            // Limpa a sessão e faz logout em caso de erro.
            sessionStorage.removeItem('targetCompanyId');
            auth.signOut();
        }
    }
    
    auth.onAuthStateChanged((user) => {
        hideLoading();
        if (user) {
            // Restaura a seleção de empresa da sessão anterior, se existir.
            const savedCompanyId = localStorage.getItem('savedCompanyId');
            if (savedCompanyId && !sessionStorage.getItem('targetCompanyId')) {
                sessionStorage.setItem('targetCompanyId', savedCompanyId);
            }
            loginContainer.style.display = 'none';
            handleUserLogin(user);
        } else {
            // Se não estiver logado, garante que a UI esteja no estado de login.
            localStorage.removeItem('savedCompanyId');
            sessionStorage.clear();
            loginContainer.style.display = 'block';
            loginContainer.classList.remove('fade-out');
            if(companySelectionModal) companySelectionModal.classList.remove('visible');
        }
    });
    
    if(loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showLoading();
            const email = emailInput.value;
            const password = passwordInput.value;
            auth.signInWithEmailAndPassword(email, password)
                .catch((error) => {
                    // ### ALTERAÇÃO PRINCIPAL APLICADA AQUI ###

                    // 1. Adiciona o log do erro completo no console para depuração
                    console.error('Erro de autenticação Firebase:', error);

                    // 2. Define uma mensagem padrão
                    let message = "Ocorreu um erro inesperado. Tente novamente.";
                    
                    // 3. Verifica o código do erro para fornecer uma mensagem específica
                    switch (error.code) {
                        case 'auth/user-not-found':
                        case 'auth/wrong-password':
                        case 'auth/invalid-credential':
                            message = "E-mail ou senha inválidos.";
                            break;
                        case 'auth/invalid-email':
                            message = "O formato do e-mail digitado é inválido.";
                            break;
                        case 'auth/too-many-requests':
                            message = "Acesso bloqueado temporariamente devido a muitas tentativas. Tente novamente mais tarde.";
                            break;
                    }
                    
                    hideLoading();
                    // 4. Exibe a notificação elegante com a mensagem correta
                    showNotification('Falha no Login', message, 'error');
                });
        });
    }

    if(companySelectionLogoutLink) {
        companySelectionLogoutLink.addEventListener('click', (e) => { 
            e.preventDefault(); 
            auth.signOut(); 
        });
    }
    
    function closeChangePasswordModal() {
        if(changePasswordModal) {
            changePasswordModal.classList.remove('visible');
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
        }
    }
    if(closePasswordModalBtn) closePasswordModalBtn.addEventListener('click', closeChangePasswordModal);
    if(cancelPasswordModalBtn) cancelPasswordModalBtn.addEventListener('click', closeChangePasswordModal);
    if(confirmPasswordChangeBtn) {
        confirmPasswordChangeBtn.addEventListener('click', async () => {
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            if (newPassword.length < 6) {
                showNotification('Senha Inválida', 'A nova senha deve ter no mínimo 6 caracteres.', 'warning'); return;
            }
            if (newPassword !== confirmPassword) {
                showNotification('Senhas não coincidem', 'Os campos de nova senha e confirmação devem ser iguais.', 'warning'); return;
            }
            const user = auth.currentUser;
            if (!user) {
                showNotification('Erro', 'Usuário não autenticado. Por favor, faça login novamente.', 'error'); return;
            }
            showLoading();
            try {
                await user.updatePassword(newPassword);
                hideLoading();
                closeChangePasswordModal();
                showNotification('Sucesso!', 'Sua senha foi alterada com sucesso.', 'success');
            } catch (error) {
                hideLoading();
                console.error('Erro ao alterar senha:', error);
                let errorMessage = 'Ocorreu um erro inesperado. Tente novamente.';
                if (error.code === 'auth/requires-recent-login') {
                    errorMessage = 'Esta é uma operação sensível. Por segurança, por favor, faça logout e login novamente antes de alterar a senha.';
                }
                showNotification('Erro de Segurança', errorMessage, 'error');
            }
        });
    }
});