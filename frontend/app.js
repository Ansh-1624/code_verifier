/* ==========================================================================
   CodeSentinel Frontend Logic (Vanilla JS SPA Controller)
   ========================================================================== */

// Client-Side State
const state = {
    currentView: 'dashboard',
    apiKey: localStorage.getItem('codesentinel_gemini_key') || '',
    activeReview: null,
    reviews: [],
    tickets: [],
    charts: {
        scoreTrend: null,
        issueDist: null,
        workflowFunnel: null,
        severity: null
    }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Initialize Lucide Icons
    lucide.createIcons();
    
    // 2. Setup Navigation Event Listeners
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            switchView(target);
        });
    });

    // 3. Setup File Drag and Drop Uploader
    initDropzone();
    
    // 4. Setup API Settings Modal Controls
    initApiSettings();

    // 5. Setup Form Submissions
    initFormHandlers();

    // 6. Setup Kanban Board Drag & Drop and Modals
    initKanbanDragAndDrop();

    // 7. Load Initial Dashboard Metrics and Status
    refreshAppStatus();
    loadDashboardData();
}

/* ==========================================================================
   SPA Navigation Router
   ========================================================================== */
function switchView(viewName) {
    state.currentView = viewName;
    
    // Update navigation sidebar item active state
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        if (item.getAttribute('data-target') === viewName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Hide all panels, display targeted panel
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Handle synthetic view routing
    let targetPanelId = `view-${viewName}`;
    if (viewName === 'new-review') {
        targetPanelId = 'view-new-review';
    } else if (viewName === 'review-inspector') {
        targetPanelId = 'view-review-inspector';
    }
    
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }

    // Update Header Bar
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    
    switch (viewName) {
        case 'dashboard':
            pageTitle.innerText = 'Dashboard';
            pageSubtitle.innerText = 'Aegis Core Code Review and Bug Tracker System';
            loadDashboardData();
            break;
        case 'new-review':
            pageTitle.innerText = 'New Review';
            pageSubtitle.innerText = 'Submit source files for automated AI audit';
            break;
        case 'review-inspector':
            pageTitle.innerText = 'Review Inspector';
            pageSubtitle.innerText = 'Detailed visual review feedback dashboard';
            break;
        case 'history':
            pageTitle.innerText = 'Review History';
            pageSubtitle.innerText = 'Historical audit metrics and reports log';
            loadHistoryData();
            break;
        case 'kanban':
            pageTitle.innerText = 'Kanban Board';
            pageSubtitle.innerText = 'Actionable developer tickets converted from reviews';
            loadKanbanData();
            break;
        case 'analytics':
            pageTitle.innerText = 'Analytics';
            pageSubtitle.innerText = 'Aggregated code health logs and system charts';
            loadAnalyticsData();
            break;
    }
}

// Global accessor so HTML onclick works
window.switchView = switchView;

/* ==========================================================================
   API Key Management
   ========================================================================== */
function initApiSettings() {
    const dialog = document.getElementById('modal-settings');
    const btnOpen = document.getElementById('btn-open-settings');
    const inputKey = document.getElementById('settings-api-key');
    const btnSave = document.getElementById('btn-save-api');
    const btnClear = document.getElementById('btn-clear-api');
    const btnTest = document.getElementById('btn-test-api');
    
    // Set initial input value
    inputKey.value = state.apiKey;
    updateApiStatusUI();

    btnOpen.addEventListener('click', () => {
        inputKey.value = state.apiKey;
        dialog.showModal();
    });

    btnSave.addEventListener('click', () => {
        state.apiKey = inputKey.value.trim();
        localStorage.setItem('codesentinel_gemini_key', state.apiKey);
        updateApiStatusUI();
        dialog.close();
        showNotification('Settings saved successfully.');
    });

    btnClear.addEventListener('click', () => {
        state.apiKey = '';
        localStorage.removeItem('codesentinel_gemini_key');
        inputKey.value = '';
        updateApiStatusUI();
        dialog.close();
        showNotification('API key cleared. System will use local fallback static analysis.');
    });

    btnTest.addEventListener('click', async () => {
        const testKey = inputKey.value.trim();
        if (!testKey) {
            alert('Please enter an API Key to test.');
            return;
        }
        
        btnTest.innerText = 'Connecting...';
        btnTest.disabled = true;
        
        try {
            // Call a dummy Gemini API test
            const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${testKey}`;
            const response = await fetch(testUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hello, respond with {"success": true}' }] }],
                    generationConfig: { responseMimeType: 'application/json' }
                })
            });
            
            if (response.ok) {
                alert('Connection Successful! Gemini API key is valid.');
            } else {
                const errText = await response.text();
                alert(`Connection Failed. Google API returned: ${response.status}\n${errText}`);
            }
        } catch (e) {
            alert(`Network Error: ${e.message}`);
        } finally {
            btnTest.innerText = 'Test Connection';
            btnTest.disabled = false;
        }
    });
}

function updateApiStatusUI() {
    const dot = document.getElementById('api-status-dot');
    const label = document.querySelector('#btn-open-settings span:last-child');
    
    if (state.apiKey) {
        dot.className = 'status-dot green';
        label.innerText = 'Gemini Active';
    } else {
        dot.className = 'status-dot gray';
        label.innerText = 'Local Static Fallback';
    }
}

/* ==========================================================================
   File Drag & Drop Zone
   ========================================================================== */
function initDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-uploader');
    const filenameInput = document.getElementById('input-filename');
    const languageSelect = document.getElementById('input-language');
    const textarea = document.getElementById('code-textarea');
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });
    
    function handleUploadedFile(file) {
        filenameInput.value = file.name;
        
        // Infer language from file extension
        const ext = file.name.split('.').pop().toLowerCase();
        switch (ext) {
            case 'py':
                languageSelect.value = 'python';
                break;
            case 'js':
                languageSelect.value = 'javascript';
                break;
            case 'ts':
                languageSelect.value = 'typescript';
                break;
            case 'html':
            case 'css':
                languageSelect.value = 'html';
                break;
            case 'sql':
                languageSelect.value = 'sql';
                break;
            default:
                languageSelect.value = 'other';
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            textarea.value = e.target.result;
            updateEditorGutter();
            showNotification(`Loaded ${file.name} successfully.`);
        };
        reader.readAsText(file);
    }
}

/* ==========================================================================
   Code Editor Custom Gutter Line Numbers
   ========================================================================== */
const textarea = document.getElementById('code-textarea');
const gutter = document.getElementById('editor-gutter');
const btnClear = document.getElementById('btn-clear-editor');

if (textarea && gutter) {
    textarea.addEventListener('input', updateEditorGutter);
    textarea.addEventListener('scroll', () => {
        gutter.scrollTop = textarea.scrollTop;
    });
}

if (btnClear && textarea) {
    btnClear.addEventListener('click', () => {
        textarea.value = '';
        updateEditorGutter();
    });
}

function updateEditorGutter() {
    const linesCount = textarea.value.split('\n').length;
    let gutterHTML = '';
    for (let i = 1; i <= linesCount; i++) {
        gutterHTML += `<div>${i}</div>`;
    }
    gutter.innerHTML = gutterHTML;
}

/* ==========================================================================
   Form Handling & API Submissions
   ========================================================================== */
function initFormHandlers() {
    const form = document.getElementById('code-review-form');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const code = textarea.value.trim();
        const filename = document.getElementById('input-filename').value.trim();
        const language = document.getElementById('input-language').value;
        
        if (!code) {
            alert('Please paste some code to review.');
            return;
        }
        
        // Show loading progress
        loadingOverlay.style.display = 'flex';
        
        const payload = {
            code: code,
            filename: filename,
            language: language,
            custom_api_key: state.apiKey || null
        };
        
        try {
            const response = await fetch('/api/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const result = await response.json();
                state.activeReview = result;
                
                // Refresh app indicators and load results view
                loadReviewIntoInspector(result);
                refreshAppStatus();
                switchView('review-inspector');
            } else {
                const err = await response.json();
                alert(`Error: ${err.detail || 'Review failed'}`);
            }
        } catch (e) {
            alert(`Network Request Failed: ${e.message}`);
        } finally {
            loadingOverlay.style.display = 'none';
        }
    });
}

/* ==========================================================================
   Visual Inspector Feedback Renderer
   ========================================================================== */
let activeIssueFilter = 'all';

function loadReviewIntoInspector(review) {
    // 1. Meta Details
    document.getElementById('report-filename').innerText = review.filename;
    document.getElementById('report-summary-text').innerText = review.summary;
    document.getElementById('viewer-lang-badge').innerText = review.language.toUpperCase();
    
    // Set Engine Badge
    const engineBadge = document.getElementById('report-engine-badge');
    if (review.analysis_source) {
        engineBadge.innerText = review.analysis_source;
        engineBadge.className = review.analysis_source.includes('AI') ? 'badge purple animate-pulse' : 'badge';
    }
    
    // 2. Metrics Score Gauge
    const scoreVal = review.overall_score || 0;
    document.getElementById('report-score-value').innerText = scoreVal;
    
    // Update SVG Circle Ring (Total length = 282.7)
    const ring = document.getElementById('report-score-ring');
    const offset = 282.7 - (282.7 * scoreVal / 100);
    ring.style.strokeDashoffset = offset;
    
    // Set ring color based on score
    if (scoreVal >= 80) ring.style.stroke = 'var(--color-emerald)';
    else if (scoreVal >= 60) ring.style.stroke = 'var(--color-yellow)';
    else ring.style.stroke = 'var(--color-red)';
    
    // Update Count Badges
    const metrics = review.metrics || { bugs_count: 0, security_issues_count: 0, performance_issues_count: 0, readability_issues_count: 0 };
    document.getElementById('report-bugs').innerText = metrics.bugs_count || 0;
    document.getElementById('report-sec').innerText = metrics.security_issues_count || 0;
    document.getElementById('report-perf').innerText = metrics.performance_issues_count || 0;
    document.getElementById('report-style').innerText = metrics.readability_issues_count || 0;
    
    // Filter Badge Counts
    document.getElementById('count-all').innerText = (review.issues || []).length;
    document.getElementById('count-bugs').innerText = review.issues.filter(i => i.type === 'bug').length;
    document.getElementById('count-sec').innerText = review.issues.filter(i => i.type === 'security').length;
    document.getElementById('count-perf').innerText = review.issues.filter(i => i.type === 'performance').length;
    document.getElementById('count-style').innerText = review.issues.filter(i => i.type === 'style').length;
    document.getElementById('count-pos').innerText = (review.positive_feedback || []).length;
    
    // Complexity parameters
    const comp = review.complexity_analysis || { time_complexity: 'N/A', space_complexity: 'N/A' };
    document.getElementById('complexity-time').innerText = comp.time_complexity;
    document.getElementById('complexity-space').innerText = comp.space_complexity;
    
    // 3. Render Annotated Code
    renderAnnotatedCode(review);
    
    // 4. Render Issue Cards
    activeIssueFilter = 'all';
    renderIssueCards(review);
}

function renderAnnotatedCode(review) {
    const codeContainer = document.getElementById('highlighted-code');
    codeContainer.innerHTML = '';
    
    const lines = review.code.split('\n');
    const issues = review.issues || [];
    
    lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const lineIssues = issues.filter(i => i.line === lineNum);
        
        const lineRow = document.createElement('div');
        lineRow.className = 'code-line-wrapper';
        lineRow.id = `line-wrapper-${lineNum}`;
        
        // Line Dot Marker Column
        const markerCol = document.createElement('div');
        markerCol.className = 'code-line-marker';
        
        if (lineIssues.length > 0) {
            // Find highest severity issue for marker dot color
            let highestSev = 'suggestion';
            if (lineIssues.some(i => i.severity === 'critical')) highestSev = 'critical';
            else if (lineIssues.some(i => i.severity === 'warning')) highestSev = 'warning';
            
            const dot = document.createElement('span');
            dot.className = `marker-dot ${getSeverityColorClass(highestSev)}`;
            dot.title = `${lineIssues.length} concern(s). Click to view details.`;
            dot.addEventListener('click', () => {
                highlightIssueCard(lineIssues[0].id);
            });
            markerCol.appendChild(dot);
        }
        
        // Line Number Column
        const numCol = document.createElement('div');
        numCol.className = 'code-line-num';
        numCol.innerText = lineNum;
        
        // Highlight syntax using Prism if possible
        const contentCol = document.createElement('div');
        contentCol.className = 'code-line-content';
        
        let processedLine = escapeHtml(lineText);
        try {
            const lang = (review.language || 'python').toLowerCase();
            const prismLang = Prism.languages[lang];
            if (prismLang) {
                processedLine = Prism.highlight(lineText, prismLang, lang);
            }
        } catch (e) {
            console.warn("Prism formatting error", e);
        }
        
        contentCol.innerHTML = processedLine || '&nbsp;';
        
        lineRow.appendChild(markerCol);
        lineRow.appendChild(numCol);
        lineRow.appendChild(contentCol);
        codeContainer.appendChild(lineRow);
    });
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getSeverityColorClass(sev) {
    if (sev === 'critical') return 'red';
    if (sev === 'warning') return 'orange';
    return 'blue';
}

// Issue card filters click handlers
document.querySelectorAll('.issue-filter-tabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.issue-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        activeIssueFilter = tab.getAttribute('data-target') || tab.getAttribute('data-filter');
        renderIssueCards(state.activeReview);
    });
});

function renderIssueCards(review) {
    const listContainer = document.getElementById('report-issues-list');
    listContainer.innerHTML = '';
    
    if (!review) return;
    
    // Positive feedbacks render in a custom format when selected
    if (activeIssueFilter === 'positive') {
        const positives = review.positive_feedback || [];
        if (positives.length === 0) {
            listContainer.innerHTML = `<div class="empty-state"><p>No positive remarks recorded.</p></div>`;
            return;
        }
        
        positives.forEach(msg => {
            const card = document.createElement('div');
            card.className = 'issue-card';
            card.innerHTML = `
                <div class="issue-card-meta">
                    <span class="badge emerald">Good Practice</span>
                </div>
                <div class="issue-card-desc" style="color: var(--text-main); font-weight: 500;">
                    ${msg}
                </div>
            `;
            listContainer.appendChild(card);
        });
        return;
    }
    
    // Filter issues
    let filteredIssues = review.issues || [];
    if (activeIssueFilter !== 'all') {
        filteredIssues = filteredIssues.filter(i => i.type === activeIssueFilter);
    }
    
    if (filteredIssues.length === 0) {
        listContainer.innerHTML = `<div class="empty-state"><p>No concerns found in this category.</p></div>`;
        return;
    }
    
    filteredIssues.forEach(issue => {
        const card = document.createElement('div');
        card.className = 'issue-card';
        card.id = `issue-card-${issue.id}`;
        card.addEventListener('click', () => {
            selectIssue(issue);
        });
        
        const lineBadge = issue.line ? `<span class="badge purple">Line ${issue.line}</span>` : '';
        const ticketCreated = isTicketCreatedFor(issue.id) ? 
            `<button class="btn btn-outline btn-small" disabled><i data-lucide="check-check"></i> Linked</button>` :
            `<button class="btn btn-primary btn-small btn-convert-ticket" onclick="event.stopPropagation(); createTicket('${issue.id}')"><i data-lucide="trello"></i> Create Ticket</button>`;
            
        card.innerHTML = `
            <div class="issue-card-meta">
                <span class="badge ${getSeverityBadgeClass(issue.severity)}">${issue.severity}</span>
                <div class="flex-end gap-2">
                    ${lineBadge}
                    <span class="badge select-input" style="font-size: 0.65rem;">${issue.type}</span>
                </div>
            </div>
            <h4 class="issue-card-title">${issue.title}</h4>
            <div class="issue-card-desc">${issue.description}</div>
            
            ${issue.snippet ? `<div class="issue-card-snippet">${escapeHtml(issue.snippet)}</div>` : ''}
            ${issue.suggestion ? `<div class="issue-card-fix">💡 Fix Suggestion:\n${escapeHtml(issue.suggestion)}</div>` : ''}
            
            <div class="issue-card-actions mt-2">
                ${ticketCreated}
            </div>
        `;
        
        listContainer.appendChild(card);
    });
    
    // Re-bind Lucide icons for card buttons
    lucide.createIcons();
}

function getSeverityBadgeClass(sev) {
    if (sev === 'critical') return 'red';
    if (sev === 'warning') return 'orange';
    return 'blue';
}

function isTicketCreatedFor(issueId) {
    return state.tickets.some(t => t.issue_id === issueId && t.review_id === state.activeReview.review_id);
}

function selectIssue(issue) {
    // Remove previous highlighted class
    document.querySelectorAll('.issue-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.code-line-wrapper').forEach(l => l.classList.remove('highlighted-concern'));
    
    // Highlight the card
    const card = document.getElementById(`issue-card-${issue.id}`);
    if (card) card.classList.add('selected');
    
    // Highlight code line if line exists
    if (issue.line) {
        const lineWrapper = document.getElementById(`line-wrapper-${issue.line}`);
        if (lineWrapper) {
            lineWrapper.classList.add('highlighted-concern');
            lineWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function highlightIssueCard(issueId) {
    if (!state.activeReview) return;
    const issue = state.activeReview.issues.find(i => i.id === issueId);
    if (!issue) return;
    
    // Switch filter tab to 'all' or issue type to ensure it is visible
    const matchingTab = document.querySelector(`.issue-filter-tabs button[data-filter="all"]`);
    if (matchingTab) matchingTab.click();
    
    // Select issue
    selectIssue(issue);
    
    // Scroll findings pane card into view
    const card = document.getElementById(`issue-card-${issueId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/* ==========================================================================
   Convert issue to ticket
   ========================================================================== */
async function createTicket(issueId) {
    if (!state.activeReview) return;
    
    const issue = state.activeReview.issues.find(i => i.id === issueId);
    if (!issue) return;
    
    const payload = {
        review_id: state.activeReview.review_id,
        issue_id: issue.id,
        title: `[${reviewTypeFormat(issue.type)}] ${issue.title} in ${state.activeReview.filename}`,
        description: `**File**: ${state.activeReview.filename} (Line ${issue.line || 'General'})
**Severity**: ${issue.severity}
**Type**: ${issue.type}

**Issue**: ${issue.description}

**Problem Code**:
\`\`\`
${issue.snippet || ''}
\`\`\`

**Fix Suggestion**:
\`\`\`
${issue.suggestion || ''}
\`\`\`
`,
        severity: issue.severity,
        status: 'backlog',
        assigned_to: 'Developer'
    };
    
    try {
        const response = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const ticket = await response.json();
            state.tickets.push(ticket);
            
            // Refresh counts and views
            refreshAppStatus();
            renderIssueCards(state.activeReview);
            showNotification(`Ticket ${ticket.id} created successfully.`);
        } else {
            alert('Failed to convert issue to ticket.');
        }
    } catch (e) {
        alert(`Error: ${e.message}`);
    }
}

function reviewTypeFormat(type) {
    if (type === 'bug') return 'BUG';
    if (type === 'security') return 'SEC';
    if (type === 'performance') return 'PERF';
    return 'STYLE';
}

// Global accessor for issue card conversion
window.createTicket = createTicket;

/* ==========================================================================
   Review History Page
   ========================================================================== */
async function loadHistoryData() {
    const listContainer = document.getElementById('history-list');
    listContainer.innerHTML = '<div class="empty-state"><p>Loading historical reports...</p></div>';
    
    try {
        const response = await fetch('/api/reviews');
        if (response.ok) {
            state.reviews = await response.json();
            renderHistoryList();
        } else {
            listContainer.innerHTML = '<div class="empty-state"><p>Failed to retrieve review list.</p></div>';
        }
    } catch (e) {
        listContainer.innerHTML = `<div class="empty-state"><p>Network error: ${e.message}</p></div>`;
    }
}

function renderHistoryList() {
    const listContainer = document.getElementById('history-list');
    const searchInput = document.getElementById('history-search');
    
    listContainer.innerHTML = '';
    
    const filterText = searchInput.value.toLowerCase().trim();
    const filtered = state.reviews.filter(r => r.filename.toLowerCase().includes(filterText));
    
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="search-code"></i>
                <p>No code audits matched "${filterText}".</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    filtered.forEach(rev => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.addEventListener('click', () => {
            viewHistoricalReview(rev.id);
        });
        
        const formattedDate = new Date(rev.timestamp).toLocaleString();
        
        card.innerHTML = `
            <div class="history-card-header">
                <span class="history-card-title">${rev.filename}</span>
                <span class="item-score-badge ${getScoreBadgeClass(rev.overall_score)}">${rev.overall_score} pts</span>
            </div>
            <div class="history-card-meta">
                Language: <strong>${rev.language.toUpperCase()}</strong> • Reviewed on ${formattedDate}
            </div>
            <p class="issue-card-desc" style="font-size: 0.8rem; height: 42px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                ${rev.summary}
            </p>
            <div class="history-card-stats">
                <div class="history-stat-bubble score-low">Bugs: ${rev.metrics.bugs_count}</div>
                <div class="history-stat-bubble score-mid">Sec: ${rev.metrics.security_issues_count}</div>
                <div class="history-stat-bubble score-high">Perf: ${rev.metrics.performance_issues_count}</div>
                <div class="history-stat-bubble bg-gray" style="color: #fff">Style: ${rev.metrics.readability_issues_count}</div>
            </div>
        `;
        
        listContainer.appendChild(card);
    });
}

// Bind live search for review history
document.getElementById('history-search').addEventListener('input', renderHistoryList);

async function viewHistoricalReview(reviewId) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    try {
        const response = await fetch(`/api/reviews/${reviewId}`);
        if (response.ok) {
            const review = await response.json();
            state.activeReview = review;
            loadReviewIntoInspector(review);
            switchView('review-inspector');
        } else {
            alert('Could not retrieve audit details.');
        }
    } catch (e) {
        alert(`Error: ${e.message}`);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function getScoreBadgeClass(score) {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-mid';
    return 'score-low';
}

/* ==========================================================================
   Kanban Board Task & Bug Tracking Engine
   ========================================================================== */
async function loadKanbanData() {
    try {
        const response = await fetch('/api/tickets');
        if (response.ok) {
            state.tickets = await response.json();
            renderKanbanBoard();
        }
    } catch (e) {
        console.error("Failed to load tickets", e);
    }
}

function renderKanbanBoard() {
    // Clear all column containers
    const containers = {
        backlog: document.getElementById('cards-backlog'),
        todo: document.getElementById('cards-todo'),
        in_progress: document.getElementById('cards-in-progress'),
        done: document.getElementById('cards-done')
    };
    
    Object.keys(containers).forEach(k => {
        containers[k].innerHTML = '';
        document.getElementById(`count-col-${k}`).innerText = '0';
    });
    
    const colCounts = { backlog: 0, todo: 0, in_progress: 0, done: 0 };
    
    state.tickets.forEach(ticket => {
        const col = ticket.status;
        if (!containers[col]) return;
        
        colCounts[col]++;
        
        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.id = `ticket-card-${ticket.id}`;
        card.setAttribute('draggable', 'true');
        
        // Store ticket ID in card reference for drag listeners
        card.setAttribute('data-ticket-id', ticket.id);
        
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dblclick', () => openTicketDetail(ticket.id));
        
        const sevClass = getSeverityBadgeClass(ticket.severity);
        const nameInitials = ticket.assigned_to ? ticket.assigned_to.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'DV';
        
        card.innerHTML = `
            <div class="k-card-header">
                <span class="k-card-id">${ticket.id}</span>
                <span class="badge ${sevClass}">${ticket.severity}</span>
            </div>
            <div class="k-card-title">${ticket.title}</div>
            <div class="k-card-footer">
                <button class="btn btn-link btn-small" onclick="openTicketDetail('${ticket.id}')">View Details</button>
                <div class="k-card-assignee" title="Assigned to ${ticket.assigned_to || 'Developer'}">${nameInitials}</div>
            </div>
        `;
        
        containers[col].appendChild(card);
    });
    
    // Update headers counts
    Object.keys(colCounts).forEach(k => {
        document.getElementById(`count-col-${k}`).innerText = colCounts[k];
    });
}

// Native HTML5 Drag and Drop Handlers
let draggedCard = null;

function initKanbanDragAndDrop() {
    const columns = document.querySelectorAll('.column-cards-container');
    
    columns.forEach(col => {
        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            col.classList.add('drag-over');
        });
        
        col.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });
        
        col.addEventListener('dragleave', () => {
            col.classList.remove('drag-over');
        });
        
        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');
            
            const ticketId = e.dataTransfer.getData('text/plain');
            const targetStatus = col.parentElement.getAttribute('data-status');
            
            if (ticketId && targetStatus) {
                await updateTicketStatus(ticketId, targetStatus);
            }
        });
    });
}

function handleDragStart(e) {
    draggedCard = this;
    this.classList.add('dragging');
    e.dataTransfer.setData('text/plain', this.getAttribute('data-ticket-id'));
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedCard = null;
}

async function updateTicketStatus(ticketId, newStatus) {
    // Optimistic update in state
    const tIdx = state.tickets.findIndex(t => t.id === ticketId);
    if (tIdx === -1) return;
    
    const prevStatus = state.tickets[tIdx].status;
    state.tickets[tIdx].status = newStatus;
    renderKanbanBoard();
    
    try {
        const response = await fetch(`/api/tickets/${ticketId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            // Revert state on failure
            state.tickets[tIdx].status = prevStatus;
            renderKanbanBoard();
            alert('Failed to update ticket status on server.');
        } else {
            const updated = await response.json();
            state.tickets[tIdx] = updated;
            refreshAppStatus();
        }
    } catch (e) {
        state.tickets[tIdx].status = prevStatus;
        renderKanbanBoard();
        console.error("Failed to update status on server", e);
    }
}

// Global accessor for dialogs
window.openTicketDetail = openTicketDetail;

/* ==========================================================================
   Ticket Detail Modal & Action Handlers
   ========================================================================== */
let activeModalTicket = null;

async function openTicketDetail(ticketId) {
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    
    activeModalTicket = ticket;
    
    const dialog = document.getElementById('modal-ticket');
    
    document.getElementById('modal-ticket-id').innerText = ticket.id;
    document.getElementById('modal-ticket-title').innerText = ticket.title;
    
    // Replace markdown block syntax with pre/code formatting for clean presentation in description
    document.getElementById('modal-ticket-description').innerHTML = formatTicketDescription(ticket.description);
    document.getElementById('modal-ticket-status').value = ticket.status;
    document.getElementById('modal-ticket-severity').value = ticket.severity;
    document.getElementById('modal-ticket-assignee').value = ticket.assigned_to || '';
    document.getElementById('modal-ticket-date').innerText = new Date(ticket.created_at).toLocaleString();
    
    renderTicketNotes(ticket.notes);
    
    dialog.showModal();
    lucide.createIcons();
}

function formatTicketDescription(desc) {
    // Simple parser to escape tags and format markdown blocks
    let html = escapeHtml(desc);
    
    // Replace code fences ``` ... ``` with code tags
    html = html.replace(/\`\`\`([\s\S]*?)\`\`\`/g, '<pre class="ticket-description-code"><code>$1</code></pre>');
    
    // Bold **...**
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    
    return html.replace(/\n/g, '<br>');
}

function renderTicketNotes(notes) {
    const container = document.getElementById('modal-ticket-notes');
    container.innerHTML = '';
    
    if (!notes || notes.length === 0) {
        container.innerHTML = `<p class="text-muted text-xs p-2">No updates recorded yet.</p>`;
        return;
    }
    
    notes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'note-bubble';
        
        // Simple regex to parse timestamp from note if format: "Comment [timestamp]"
        let text = note;
        let timeText = '';
        const match = note.match(/^(.*)\s+\[(.*?)\]$/);
        if (match) {
            text = match[1];
            timeText = match[2];
        }
        
        div.innerHTML = `
            <div>${text}</div>
            ${timeText ? `<span class="note-time">${timeText}</span>` : ''}
        `;
        container.appendChild(div);
    });
    
    // Scroll notes container to the bottom
    container.scrollTop = container.scrollHeight;
}

// Add comment note to ticket
document.getElementById('btn-add-note').addEventListener('click', async () => {
    const input = document.getElementById('input-new-note');
    const noteText = input.value.trim();
    if (!noteText || !activeModalTicket) return;
    
    const timestampStr = new Date().toLocaleString();
    const fullNote = `${noteText} [${timestampStr}]`;
    const updatedNotes = [...activeModalTicket.notes, fullNote];
    
    input.value = '';
    
    try {
        const response = await fetch(`/api/tickets/${activeModalTicket.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: updatedNotes })
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Sync with local state
            const tIdx = state.tickets.findIndex(t => t.id === result.id);
            if (tIdx !== -1) {
                state.tickets[tIdx] = result;
                activeModalTicket = result;
            }
            
            renderTicketNotes(result.notes);
            renderKanbanBoard();
        }
    } catch (e) {
        alert('Could not add comment.');
    }
});

// Update ticket attributes from modal controls
const bindTicketModalControl = (elementId, field) => {
    document.getElementById(elementId).addEventListener('change', async (e) => {
        if (!activeModalTicket) return;
        const val = e.target.value.trim();
        
        try {
            const payload = {};
            payload[field] = val;
            
            const response = await fetch(`/api/tickets/${activeModalTicket.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Sync local state
                const tIdx = state.tickets.findIndex(t => t.id === result.id);
                if (tIdx !== -1) {
                    state.tickets[tIdx] = result;
                    activeModalTicket = result;
                }
                
                renderKanbanBoard();
                refreshAppStatus();
            }
        } catch (err) {
            console.error(`Failed to update field ${field}`, err);
        }
    });
};

bindTicketModalControl('modal-ticket-status', 'status');
bindTicketModalControl('modal-ticket-severity', 'severity');
bindTicketModalControl('modal-ticket-assignee', 'assigned_to');

// Delete ticket handler
document.getElementById('btn-delete-ticket').addEventListener('click', async () => {
    if (!activeModalTicket) return;
    
    if (!confirm(`Are you sure you want to permanently delete ticket ${activeModalTicket.id}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/tickets/${activeModalTicket.id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            state.tickets = state.tickets.filter(t => t.id !== activeModalTicket.id);
            document.getElementById('modal-ticket').close();
            renderKanbanBoard();
            refreshAppStatus();
            showNotification(`Ticket deleted successfully.`);
        }
    } catch (e) {
        alert('Failed to delete ticket.');
    }
});

// Manual ticket creation
document.getElementById('btn-create-manual-ticket').addEventListener('click', () => {
    document.getElementById('create-ticket-form').reset();
    document.getElementById('modal-create-ticket').showModal();
});

document.getElementById('create-ticket-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
        title: document.getElementById('create-ticket-title').value.trim(),
        description: document.getElementById('create-ticket-desc').value.trim(),
        severity: document.getElementById('create-ticket-severity').value,
        assigned_to: document.getElementById('create-ticket-assignee').value.trim() || 'Developer',
        status: 'backlog'
    };
    
    try {
        const response = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const ticket = await response.json();
            state.tickets.push(ticket);
            document.getElementById('modal-create-ticket').close();
            
            renderKanbanBoard();
            refreshAppStatus();
            showNotification(`Ticket ${ticket.id} created.`);
        }
    } catch (err) {
        alert('Failed to create ticket.');
    }
});

/* ==========================================================================
   Dashboard Overview Fetch and Stats Sync
   ========================================================================== */
async function loadDashboardData() {
    try {
        const response = await fetch('/api/metrics');
        if (response.ok) {
            const data = await response.json();
            
            // Sync statistics display widgets
            document.getElementById('dash-score-value').innerText = data.total_reviews > 0 ? `${data.average_score} %` : 'N/A';
            
            // Open tickets count (backlog + todo + in_progress)
            const openCount = (data.tickets_by_status.backlog || 0) + (data.tickets_by_status.todo || 0) + (data.tickets_by_status.in_progress || 0);
            document.getElementById('dash-bugs-value').innerText = openCount;
            document.getElementById('dash-resolved-value').innerText = data.tickets_by_status.done || 0;
            
            // Render Recent Reviews
            await syncDashboardRecentReviews();
            
            // Render High Priority Tickets
            await syncDashboardHotTickets();
        }
    } catch (e) {
        console.error("Dashboard metrics sync error", e);
    }
}

async function syncDashboardRecentReviews() {
    const list = document.getElementById('dash-recent-reviews');
    
    try {
        const response = await fetch('/api/reviews');
        if (response.ok) {
            const reviews = await response.json();
            list.innerHTML = '';
            
            if (reviews.length === 0) {
                list.innerHTML = `<div class="empty-state"><i data-lucide="search-code"></i><p>No recent code reviews.</p></div>`;
                lucide.createIcons();
                return;
            }
            
            // Take the 3 latest reviews
            reviews.slice(0, 3).forEach(r => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.addEventListener('click', () => viewHistoricalReview(r.id));
                
                div.innerHTML = `
                    <div class="item-info">
                        <div class="item-icon purple"><i data-lucide="file-text"></i></div>
                        <div class="item-details">
                            <h4>${r.filename}</h4>
                            <p>${r.language.toUpperCase()} • ${new Date(r.timestamp).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <span class="item-score-badge ${getScoreBadgeClass(r.overall_score)}">${r.overall_score}%</span>
                `;
                list.appendChild(div);
            });
            lucide.createIcons();
        }
    } catch (e) {
        console.error(e);
    }
}

async function syncDashboardHotTickets() {
    const list = document.getElementById('dash-hot-tickets');
    
    try {
        const response = await fetch('/api/tickets');
        if (response.ok) {
            const tickets = await response.json();
            list.innerHTML = '';
            
            // Filter out completed ones, and sort critical first, then warning
            const active = tickets
                .filter(t => t.status !== 'done')
                .sort((a, b) => {
                    const weight = { critical: 3, warning: 2, suggestion: 1 };
                    return weight[b.severity] - weight[a.severity];
                });
                
            if (active.length === 0) {
                list.innerHTML = `<div class="empty-state"><i data-lucide="shield-check"></i><p>Clean build! All bug tickets resolved.</p></div>`;
                lucide.createIcons();
                return;
            }
            
            active.slice(0, 3).forEach(t => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.addEventListener('click', () => {
                    switchView('kanban');
                    openTicketDetail(t.id);
                });
                
                let iconClass = 'blue';
                if (t.severity === 'critical') iconClass = 'red';
                else if (t.severity === 'warning') iconClass = 'orange';
                
                div.innerHTML = `
                    <div class="item-info">
                        <div class="item-icon ${iconClass}"><i data-lucide="bug"></i></div>
                        <div class="item-details">
                            <h4>${t.title}</h4>
                            <p>${t.id} • Assigned to ${t.assigned_to || 'Developer'}</p>
                        </div>
                    </div>
                    <span class="badge ${getSeverityBadgeClass(t.severity)}">${t.status.replace('_', ' ')}</span>
                `;
                list.appendChild(div);
            });
            lucide.createIcons();
        }
    } catch (e) {
        console.error(e);
    }
}

async function refreshAppStatus() {
    try {
        const response = await fetch('/api/metrics');
        if (response.ok) {
            const data = await response.json();
            
            // Sync top header bar quick indicators
            document.getElementById('quick-score').innerText = data.total_reviews > 0 ? `${data.average_score}%` : '-';
            
            const openCount = (data.tickets_by_status.backlog || 0) + (data.tickets_by_status.todo || 0) + (data.tickets_by_status.in_progress || 0);
            const bugPill = document.getElementById('quick-bugs');
            bugPill.innerText = openCount;
            
            if (openCount > 0) {
                bugPill.className = 'pill-value text-red animate-pulse';
            } else {
                bugPill.className = 'pill-value text-muted';
            }
            
            // Sync sidebar kanban ticket counter badge
            document.getElementById('sidebar-ticket-count').innerText = openCount;
            document.getElementById('sidebar-ticket-count').style.display = openCount > 0 ? 'inline-block' : 'none';
        }
    } catch (e) {
        console.error("Status check fail", e);
    }
}

/* ==========================================================================
   Analytics Reporting & Chart.js Controllers
   ========================================================================== */
async function loadAnalyticsData() {
    try {
        const response = await fetch('/api/metrics');
        if (response.ok) {
            const data = await response.json();
            renderCharts(data);
        }
    } catch (e) {
        console.error("Analytics load error", e);
    }
}

function renderCharts(metricsData) {
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.font.family = "'Inter', sans-serif";
    
    // Destroy previous chart contexts if they exist to prevent memory leaks
    Object.keys(state.charts).forEach(c => {
        if (state.charts[c]) {
            state.charts[c].destroy();
        }
    });

    // 1. CODE QUALITY SCORE LINE CHART
    const lineCtx = document.getElementById('chart-score-trend').getContext('2d');
    const lineData = metricsData.score_progression || [];
    
    state.charts.scoreTrend = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: lineData.map((d, idx) => `Audit #${idx+1}`),
            datasets: [{
                label: 'Overall Code Score',
                data: lineData.map(d => d.score),
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#fff',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const audit = lineData[index];
                            return ` Score: ${context.parsed.y}% (${audit.filename})`;
                        }
                    }
                }
            },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // 2. ISSUE BREAKDOWN DONUT CHART
    const donutCtx = document.getElementById('chart-issue-dist').getContext('2d');
    const issueTotals = metricsData.issue_totals || { bugs: 0, security: 0, performance: 0, readability: 0 };
    
    state.charts.issueDist = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
            labels: ['Bugs', 'Security', 'Performance', 'Style'],
            datasets: [{
                data: [
                    issueTotals.bugs,
                    issueTotals.security,
                    issueTotals.performance,
                    issueTotals.readability
                ],
                backgroundColor: [
                    '#ef4444', // Red
                    '#f97316', // Orange
                    '#f59e0b', // Yellow
                    '#3b82f6'  // Blue
                ],
                borderWidth: 1,
                borderColor: 'var(--bg-panel-solid)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            },
            cutout: '65%'
        }
    });

    // 3. WORKFLOW FUNNEL BAR CHART
    const barCtx = document.getElementById('chart-ticket-funnel').getContext('2d');
    const colStats = metricsData.tickets_by_status || { backlog: 0, todo: 0, in_progress: 0, done: 0 };
    
    state.charts.workflowFunnel = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: ['Backlog', 'To Do', 'In Progress', 'Resolved'],
            datasets: [{
                label: 'Bug Tickets Count',
                data: [
                    colStats.backlog,
                    colStats.todo,
                    colStats.in_progress,
                    colStats.done
                ],
                backgroundColor: [
                    'rgba(107, 114, 128, 0.4)',
                    'rgba(59, 130, 246, 0.4)',
                    'rgba(249, 115, 22, 0.4)',
                    'rgba(16, 185, 129, 0.4)'
                ],
                borderColor: [
                    '#6b7280',
                    '#3b82f6',
                    '#f97316',
                    '#10b981'
                ],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // 4. SEVERITY RATIO PIE CHART
    const severityCtx = document.getElementById('chart-severity').getContext('2d');
    const sevStats = metricsData.tickets_by_severity || { critical: 0, warning: 0, suggestion: 0 };
    
    state.charts.severity = new Chart(severityCtx, {
        type: 'pie',
        data: {
            labels: ['Critical', 'Warning', 'Suggestion'],
            datasets: [{
                data: [
                    sevStats.critical,
                    sevStats.warning,
                    sevStats.suggestion
                ],
                backgroundColor: [
                    '#ef4444',
                    '#f97316',
                    '#3b82f6'
                ],
                borderWidth: 1,
                borderColor: 'var(--bg-panel-solid)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}

/* ==========================================================================
   Toast Notifications System
   ========================================================================== */
function showNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-alert';
    toast.innerText = message;
    
    document.body.appendChild(toast);
    
    // Animate display and fade out
    setTimeout(() => { toast.classList.add('visible'); }, 50);
    
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => { toast.remove(); }, 300);
    }, 3000);
}

// Append CSS rules for Toast and preformatted boxes directly (avoids file pollution)
const sheet = window.document.styleSheets[0];
sheet.insertRule(`
    .toast-alert {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background-color: var(--bg-panel-solid);
        border: 1px solid var(--color-primary);
        color: #fff;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 500;
        box-shadow: var(--shadow-neon);
        z-index: 2000;
        transform: translateY(100px);
        opacity: 0;
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
    }
`, sheet.cssRules.length);
sheet.insertRule(`
    .toast-alert.visible {
        transform: translateY(0);
        opacity: 1;
    }
`, sheet.cssRules.length);
sheet.insertRule(`
    .ticket-description-code {
        background-color: #111;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 6px;
        padding: 10px;
        margin: 8px 0;
        font-family: 'Fira Code', monospace;
        font-size: 0.75rem;
        overflow-x: auto;
        color: #a88;
        white-space: pre-wrap;
    }
`, sheet.cssRules.length);
sheet.insertRule(`
    .ticket-description-code code {
        white-space: pre-wrap;
    }
`, sheet.cssRules.length);
sheet.insertRule(`
    .animate-pulse {
        animation: pulseAnimation 2s infinite ease-in-out;
    }
`, sheet.cssRules.length);
sheet.insertRule(`
    @keyframes pulseAnimation {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`, sheet.cssRules.length);
