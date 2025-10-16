// static/js/dashboard-loader.js v1.4

document.addEventListener('DOMContentLoaded', () => {
    const contentPlaceholder = document.getElementById('content-placeholder');
    const modalsPlaceholder = document.getElementById('modals-placeholder');
    const navPlaceholder = document.getElementById('nav-placeholder');
    const sidebarLinks = document.querySelectorAll('.sidebar-link, .sidebar-link-external');
    const head = document.head;
    let currentModule = null;

    const moduleDependencies = {
        'geral': ['/static/js/dbgeral.js'],
        'vendas': ['/static/js/dbvendas-ui.js', '/static/js/dbvendas.js'],
        'estoque': ['/static/js/dbestoque.js'],
        'metas': ['/static/js/dbmetas.js'],
        'chat': ['/static/js/dbchat.js'],
        'configuracoes': ['/static/js/dbconfiguracoes.js']
    };

    function applyUserPermissions(userData) {
        if (userData && userData.access) {
            sidebarLinks.forEach(link => {
                const accessKey = link.getAttribute('data-access-key');
                if (accessKey) {
                    if (userData.access[accessKey] !== true) {
                        link.style.display = 'none';
                    }
                }
            });
        } else if (userData && !userData.is_superadmin) {
            sidebarLinks.forEach(link => {
                const accessKey = link.getAttribute('data-access-key');
                if (accessKey && accessKey !== 'dashboard') {
                    link.style.display = 'none';
                }
            });
        }

        const changeCompanyBtn = document.getElementById('change-company-btn');
        if (changeCompanyBtn) {
            changeCompanyBtn.style.display = 'flex';
        }
    }

    function loadScripts(scripts) {
        return Promise.all(scripts.map(scriptSrc => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = `${scriptSrc}?v=1.4`;
                script.defer = true;
                script.classList.add('module-resource');
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Falha ao carregar o script: ${scriptSrc}`));
                document.body.appendChild(script);
            });
        }));
    }

    // ### FUNÇÃO DE CARREGAMENTO DE CSS APRIMORADA ###
    function loadCss(cssPath) {
        return new Promise((resolve, reject) => {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = `${cssPath}?v=1.4`;
            cssLink.classList.add('module-resource');
            cssLink.onload = resolve;
            cssLink.onerror = () => reject(new Error(`Falha ao carregar o CSS: ${cssPath}`));
            head.appendChild(cssLink);
        });
    }

    async function loadModule(moduleName) {
        if (currentModule === moduleName) return;
        showLoading();

        try {
            document.querySelectorAll('.module-resource').forEach(el => el.remove());

            const response = await fetch(`/static/html/db${moduleName}.html?v=1.4`);
            if (!response.ok) throw new Error(`Módulo ${moduleName} não encontrado.`);
            const moduleHtml = await response.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(moduleHtml, 'text/html');
            const navElement = doc.querySelector('nav.main-nav');
            const contentElement = doc.querySelector('.main-module');
            const modalElements = doc.querySelectorAll('.modal-overlay');

            navPlaceholder.innerHTML = '';
            contentPlaceholder.innerHTML = '';
            modalsPlaceholder.innerHTML = '';

            if (navElement) navPlaceholder.appendChild(navElement);
            if (contentElement) contentPlaceholder.appendChild(contentElement);
            modalElements.forEach(modal => modalsPlaceholder.appendChild(modal));

            // ### ALTERAÇÃO PRINCIPAL APLICADA AQUI ###
            // Agora esperamos explicitamente o CSS e os Scripts serem carregados
            // usando as funções aprimoradas.
            const cssPath = `/static/css/db${moduleName}.css`;
            const scripts = moduleDependencies[moduleName] || [];

            await Promise.all([
                loadCss(cssPath),
                loadScripts(scripts)
            ]);
            
            currentModule = moduleName;
            document.querySelectorAll('.sidebar-link, .sidebar-link-external').forEach(link => {
                const linkModule = link.dataset.module;
                if(linkModule) {
                    link.classList.toggle('active', linkModule === moduleName);
                }
            });

        } catch (error) {
            console.error(`Falha ao carregar o módulo ${moduleName}:`, error);
            contentPlaceholder.innerHTML = `<p style="text-align: center; color: red; margin: 40px;">Erro ao carregar o módulo. Tente novamente.</p>`;
        } finally {
            hideLoading();
        }
    }

    async function initializeDashboard() {
        showLoading();
        try {
            const userData = await fazerRequisicaoAutenticada('/api/users/me');
            if (!userData) {
                throw new Error("Não foi possível verificar os dados do usuário.");
            }

            const companyNameEl = document.getElementById('sidebar-company-name');
            if (companyNameEl && userData.company_name) {
                companyNameEl.textContent = userData.company_name;
                companyNameEl.title = userData.company_name;
            }

            if (userData.is_superadmin) {
                let targetCompanyId = sessionStorage.getItem('targetCompanyId');
                if (!targetCompanyId || targetCompanyId.length < 10) {
                    targetCompanyId = await showCompanySelectionModal();
                    if (targetCompanyId) {
                        sessionStorage.setItem('targetCompanyId', targetCompanyId);
                    } else {
                        contentPlaceholder.innerHTML = `<div class="container"><div class="card" style="text-align: center; padding: 40px;"><p>A seleção de uma empresa é necessária para o modo de suporte.</p></div></div>`;
                        hideLoading();
                        return; 
                    }
                }
            }

            await fazerRequisicaoAutenticada('/dashboard/validate-connection');

            applyUserPermissions(userData);

            const initialModule = sessionStorage.getItem('initialModule') || 'geral';
            sessionStorage.removeItem('initialModule');
            
            const initialLink = document.querySelector(`.sidebar-link[data-module="${initialModule}"]`);
            if (initialLink && initialLink.style.display !== 'none') {
                await loadModule(initialModule);
            } else {
                await loadModule('geral');
            }

        } catch (error) {
            console.error("Falha crítica na inicialização do dashboard:", error);
            hideLoading();
            contentPlaceholder.innerHTML = `
                <div class="container">
                    <div class="card" style="text-align: center; padding: 40px; border-top: 5px solid var(--kpi-red);">
                        <h2 style="color: var(--ink); font-size: 1.5rem; margin-bottom: 1rem;">Ocorreu um Erro ao Carregar o Dashboard</h2>
                        <p style="font-size: 1rem; line-height: 1.6;">${error.message}</p>
                        <p style="margin-top: 1rem;">Por favor, verifique se o CNPJ da empresa está correto nos cadastros ou contate o suporte técnico.</p>
                    </div>
                </div>`;
        }
    }

    document.querySelectorAll('.sidebar-link[data-module]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const moduleName = link.dataset.module;
            if (moduleName) {
                loadModule(moduleName);
                document.body.classList.remove('sidebar-open');
            }
        });
    });

    initializeDashboard();
});