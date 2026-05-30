const DB_POSTS = "posts";
const DB_LOGS = "admin_logs";
const DB_USERS = "yuho_users";
const DB_CURRENT_USER = "yuho_current_user";
const DB_CONTACTS = "contact_messages";

// 마크다운 렌더링 함수
function escapeHtml(text) {
    return (text || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function renderInlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1">')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderBasicMarkdown(content) {
    const lines = (content || "").split(/\r?\n/);
    let html = "";
    let inUl = false;
    let inOl = false;
    let inCode = false;
    let codeLines = [];
    let inTable = false;

    const closeLists = () => {
        if (inUl) {
            html += "</ul>";
            inUl = false;
        }
        if (inOl) {
            html += "</ol>";
            inOl = false;
        }
    };

    const closeTable = () => {
        if (inTable) {
            html += "</tbody></table>";
            inTable = false;
        }
    };

    lines.forEach((line, index) => {
        if (line.trim().startsWith("```")) {
            if (inCode) {
                html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
                codeLines = [];
                inCode = false;
            } else {
                closeLists();
                closeTable();
                inCode = true;
            }
            return;
        }

        if (inCode) {
            codeLines.push(line);
            return;
        }

        const trimmed = line.trim();
        const nextLine = lines[index + 1]?.trim() || "";

        if (!trimmed) {
            closeLists();
            closeTable();
            return;
        }

        if (/^\|.+\|$/.test(trimmed) && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(nextLine)) {
            closeLists();
            closeTable();
            const headers = trimmed.split("|").filter(Boolean).map((cell) => `<th>${renderInlineMarkdown(cell.trim())}</th>`).join("");
            html += `<table><thead><tr>${headers}</tr></thead><tbody>`;
            inTable = true;
            return;
        }

        if (inTable && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) {
            return;
        }

        if (inTable && /^\|.+\|$/.test(trimmed)) {
            const cells = trimmed.split("|").filter(Boolean).map((cell) => `<td>${renderInlineMarkdown(cell.trim())}</td>`).join("");
            html += `<tr>${cells}</tr>`;
            return;
        }

        closeTable();

        if (/^---+$/.test(trimmed)) {
            closeLists();
            html += "<hr>";
            return;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            closeLists();
            const level = heading[1].length;
            html += `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`;
            return;
        }

        if (/^>\s+/.test(trimmed)) {
            closeLists();
            html += `<blockquote>${renderInlineMarkdown(trimmed.replace(/^>\s+/, ""))}</blockquote>`;
            return;
        }

        const unordered = trimmed.match(/^[-*]\s+(.+)$/);
        if (unordered) {
            if (!inUl) {
                closeLists();
                html += "<ul>";
                inUl = true;
            }
            html += `<li>${renderInlineMarkdown(unordered[1])}</li>`;
            return;
        }

        const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
        if (ordered) {
            if (!inOl) {
                closeLists();
                html += "<ol>";
                inOl = true;
            }
            html += `<li>${renderInlineMarkdown(ordered[1])}</li>`;
            return;
        }

        closeLists();
        html += `<p>${renderInlineMarkdown(trimmed)}</p>`;
    });

    if (inCode) {
        html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
    }
    closeLists();
    closeTable();

    return html;
}

function renderMarkdown(content) {
    const fallback = renderBasicMarkdown(content);

    if (!window.marked || !window.DOMPurify) {
        return fallback; // 라이브러리 로드 안 됐으면 기본 마크다운 렌더링
    }
    
    try {
        // GFM (GitHub Flavored Markdown) 확장 활성화
        marked.setOptions({
            breaks: true,           // 줄바꿈을 <br>로 변환
            gfm: true,              // GitHub Flavored Markdown 활성화
            pedantic: false,
            async: false
        });

        const html = marked.parse(content);
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'p', 'br', 'strong', 'em', 'u', 's', 'del', 'ins',
                'a', 'blockquote', 'code', 'pre',
                'ul', 'ol', 'li',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'img', 'hr', 'div', 'span'
            ],
            ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'id', 'class', 'target', 'rel']
        });
    } catch (e) {
        console.warn('Markdown parsing error:', e);
        return fallback;
    }
}

function updateMarkdownPreview() {
    const contentInput = document.getElementById("content");
    const preview = document.getElementById("markdownPreview");
    if (!contentInput || !preview) return;

    const value = contentInput.value.trim();
    preview.innerHTML = value
        ? renderMarkdown(value)
        : '<span class="markdown_empty">마크다운 미리보기가 여기에 표시됩니다.</span>';
}

const typingText = "웹 개발을 배우고 있는 학생으로, 다양한 기술을 익히며\n꾸준히 성장하는 프론트엔드 개발자를 목표로 하고 있습니다.";
const typingTarget = document.getElementById("typing");

let index = 0;
let isDeleting = false;

function typingLoop() {
    if (!typingTarget) return;

    if (!isDeleting) {
        typingTarget.textContent = typingText.substring(0, index + 1);
        index++;

        if (index === typingText.length) {
            isDeleting = true;
            setTimeout(typingLoop, 3000);
            return;
        }
    } else {
        typingTarget.textContent = typingText.substring(0, index - 1);
        index--;

        if (index === 0) {
            isDeleting = false;
            setTimeout(typingLoop, 3000);
            return;
        }
    }

    setTimeout(typingLoop, isDeleting ? 50 : 100);
}

typingLoop();

const themebtn = document.getElementById("themebtn");

if (themebtn) {
    themebtn.addEventListener("click", function () {
        document.body.classList.toggle("dark");
        themebtn.textContent = document.body.classList.contains("dark")
            ? "light모드"
            : "dark모드";
    });
}


const navButtons = document.querySelectorAll(".nav_btn");
const pages = document.querySelectorAll(".page");
let currentPageIndex = 0;
let isChanging = false;

function showPage(target) {
    let pageToShow = null;

    if (typeof target === "number") {
        pageToShow = pages[target];
    } else if (typeof target === "string") {
        pageToShow = document.getElementById(target);
    }

    if (!pageToShow) return;

    if (pageToShow.id === "login") {
        clearLoginForm();
    }

    navButtons.forEach((btn) => btn.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    pageToShow.classList.add("active");

    const pageId = pageToShow.id;
    const matchedBtn = [...navButtons].find((btn) => btn.dataset.page === pageId);

    if (matchedBtn) {
        matchedBtn.classList.add("active");
        currentPageIndex = [...pages].findIndex((page) => page.id === pageId);
    }
    // board 페이지로 이동할 때 기본 탭을 posts로 표시
    if (pageId === "board") {
        try { showBoardTab("posts"); } catch (e) {}
    }
}

navButtons.forEach((button) => {
    button.addEventListener("click", function () {
        showPage(button.dataset.page);
    });
});

// 로고 클릭 시 홈으로 이동
const logoLink = document.querySelector(".logo a");
if (logoLink) {
    logoLink.addEventListener("click", function (e) {
        e.preventDefault();
        showPage("home");
    });
}

window.addEventListener(
    "wheel",
    function (event) {
        // ❌ 페이지 이동 막기
        event.stopPropagation();
        return;
    },
    { passive: true }
);

window.addEventListener("keydown", function (event) {
    if (isChanging) return;

    if (event.key === "PageDown" && currentPageIndex < pages.length - 1) {
        isChanging = true;
        showPage(currentPageIndex + 1);
        setTimeout(() => {
            isChanging = false;
        }, 700);
    }

    if (event.key === "PageUp" && currentPageIndex > 0) {
        isChanging = true;
        showPage(currentPageIndex - 1);
        setTimeout(() => {
            isChanging = false;
        }, 700);
    }
});

showPage(0);

// ✅ 여기다 넣어라 (이 위치가 정답)
const myName = document.getElementById("myName");
const myInfo = document.getElementById("myInfo");

if (myName && myInfo) {
    myName.addEventListener("click", function () {
        if (myInfo.style.display === "none") {
            myInfo.style.display = "block";
        } else {
            myInfo.style.display = "none";
        }
    });
}

const contactEmailLink = document.querySelector('#contact a[href^="mailto:"]');
if (contactEmailLink) {
    contactEmailLink.addEventListener("click", function (event) {
        event.preventDefault();
        window.location.href = this.href;
    });
}

const contactForm = document.getElementById("contactForm");
if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const name = document.getElementById("contact-name").value.trim();
        const email = document.getElementById("contact-email").value.trim();
        const message = document.getElementById("contact-message").value.trim();
        const statusText = document.getElementById("contactStatus");

        if (!name || !email || !message) {
            if (statusText) {
                statusText.textContent = "모든 항목을 입력해주세요.";
                statusText.style.color = "#ff4d4d";
            }
            return;
        }

        addContactMessage(name, email, message);

        if (statusText) {
            statusText.textContent = "문의가 정상적으로 접수되었습니다.";
            statusText.style.color = "#2b7cff";
        }

        contactForm.reset();
        loadAdminPanel();
    });
}

function showPageById(pageId) {
    const pageIndex = [...pages].findIndex((page) => page.id === pageId);
    if (pageIndex !== -1) {
        showPage(pageIndex);
    }
}

/* 로그인 / 회원가입 / 관리자 */

if (!localStorage.getItem(DB_USERS)) {
    localStorage.setItem(
        DB_USERS,
        JSON.stringify([
            { name: "김유호", email: "test@test.com", password: "1234", role: "admin" }
        ])
    );
}
function getCurrentUser() { return JSON.parse(localStorage.getItem(DB_CURRENT_USER)); }
function renderHeaderAuth() {
    const user = getCurrentUser();
    const authArea = document.getElementById("header-auth-area");
    const adminNavBtn = document.getElementById("adminNavBtn");

    if (!authArea) return;

    if (user) {
        authArea.innerHTML = `<span>${user.name}</span> <a onclick="handleLogout()">Logout</a>`;

        if (adminNavBtn) {
            if (user.role === "admin") {
                adminNavBtn.classList.remove("hidden");
            } else {
                adminNavBtn.classList.add("hidden");
            }
        }
    } else {
        authArea.innerHTML = `<a class="login-btn" onclick="goLogin()">Login</a>`;

        if (adminNavBtn) {
            adminNavBtn.classList.add("hidden");
        }
    }
}

renderHeaderAuth();

function clearLoginForm() {
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const loginError = document.getElementById("login-error");

    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (loginError) loginError.style.display = "none";
}

window.goLogin = function () {
    clearLoginForm();
    showPage("login");
};

window.goRegister = function () {
    showPage("signup");
};

function fillAuthorName() {
    const user = getCurrentUser();
    const input = document.getElementById("author");

    if (user && input && !input.value.trim()) {
        input.value = user.name || user.username;
    }
}

window.goBoardWrite = function () {
    const idx = [...pages].findIndex((page) => page.id === "board-write");
    if (idx !== -1) {
        showPage(idx);
        fillAuthorName();
    }
};

window.handleSignup = function () {
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value.trim();
    const confirmPassword = document.getElementById("signup-password-confirm").value.trim();
    const signupError = document.getElementById("signup-error");

    if (signupError) signupError.style.display = "none";

    if (!name || !email || !password || !confirmPassword) {
        signupError.textContent = "모든 항목을 입력해주세요.";
        signupError.style.display = "block";
        return;
    }

    if (password !== confirmPassword) {
        signupError.textContent = "비밀번호가 일치하지 않습니다.";
        signupError.style.display = "block";
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];

    if (users.find(u => u.email === email)) {
        signupError.textContent = "이미 존재하는 이메일입니다.";
        signupError.style.display = "block";
        return;
    }

    users.push({ name, email, password, role: "user" });

    localStorage.setItem(DB_USERS, JSON.stringify(users));

    alert("회원가입이 완료되었습니다.");
    goLogin();
};

window.handleLogin = function () {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();
    const loginError = document.getElementById("login-error");

    if (loginError) loginError.style.display = "none";

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        loginError.textContent = "이메일 또는 비밀번호가 일치하지 않습니다.";
        loginError.style.display = "block";
        return;
    }

    localStorage.setItem(DB_CURRENT_USER, JSON.stringify(user));

    renderHeaderAuth();
    loadPosts();
    loadAdminPanel();
    alert("로그인되었습니다.");
    showPage(0);
};

window.handleSocialLogin = function (provider) {
    if (!provider) {
        alert("지원하지 않는 소셜 로그인입니다.");
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const email = `${String(provider).toLowerCase()}@social.local`;
    let user = users.find((u) => u.email === email);

    if (!user) {
        user = {
            name: `${provider} User`,
            email,
            password: "",
            role: "user",
            provider
        };
        users.push(user);
        localStorage.setItem(DB_USERS, JSON.stringify(users));
    }

    localStorage.setItem(DB_CURRENT_USER, JSON.stringify(user));
    renderHeaderAuth();
    loadPosts();
    loadAdminPanel();
    showPage(0);
};

window.handleLogout = function () {
    localStorage.removeItem(DB_CURRENT_USER);
    clearLoginForm();
    renderHeaderAuth();
    loadPosts();
    loadAdminPanel();
    alert("로그아웃 되었습니다.");
    showPage(0);
};

const postForm = document.getElementById("postForm");
const postList = document.getElementById("postList");
let editingPostId = null;

function setPostFormMode(mode) {
    const formTitle = document.getElementById("postFormTitle");
    const submitBtn = document.getElementById("postSubmitBtn");

    if (mode === "edit") {
        if (formTitle) formTitle.textContent = "게시글 수정";
        if (submitBtn) submitBtn.textContent = "수정 저장";
        return;
    }

    editingPostId = null;
    if (formTitle) formTitle.textContent = "새 글 작성";
    if (submitBtn) submitBtn.textContent = "등록";
}

function resetPostForm() {
    postForm?.reset();
    const authorInput = document.getElementById("author");
    if (authorInput) authorInput.disabled = false;
    setPostFormMode("create");
    updateMarkdownPreview();
}

function getPosts() {
    return JSON.parse(localStorage.getItem(DB_POSTS)) || [];
}

function savePosts(posts) {
    localStorage.setItem(DB_POSTS, JSON.stringify(posts));
}

function getAdminLogs() {
    return JSON.parse(localStorage.getItem(DB_LOGS)) || [];
}

function saveAdminLogs(logs) {
    localStorage.setItem(DB_LOGS, JSON.stringify(logs));
}

function getContactMessages() {
    return JSON.parse(localStorage.getItem(DB_CONTACTS)) || [];
}

function saveContactMessages(messages) {
    localStorage.setItem(DB_CONTACTS, JSON.stringify(messages));
}

function addContactMessage(name, email, message) {
    const messages = getContactMessages();
    messages.unshift({
        id: Date.now(),
        name,
        email,
        message,
        reply: "",
        repliedBy: "",
        repliedAt: "",
        createdAt: new Date().toLocaleString("ko-KR")
    });
    saveContactMessages(messages);
}

function saveContactReply(messageId, reply) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 답글을 남길 수 있습니다.");
        return;
    }

    const messages = getContactMessages();
    const updated = messages.map((msg) => {
        if (msg.id === messageId) {
            return {
                ...msg,
                reply,
                repliedBy: currentUser.name,
                repliedAt: new Date().toLocaleDateString("ko-KR")
            };
        }
        return msg;
    });
    saveContactMessages(updated);
    loadInquiries();
}

function toggleReplyForm(messageId) {
    const form = document.getElementById(`replyForm-${messageId}`);
    if (!form) return;
    form.classList.toggle("hidden");
}

function submitInquiryReply(messageId) {
    const textarea = document.getElementById(`replyText-${messageId}`);
    if (!textarea) return;
    const reply = textarea.value.trim();
    if (!reply) {
        alert("답글을 입력해주세요.");
        return;
    }
    saveContactReply(messageId, reply);
}

window.editInquiry = function (messageId) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 문의를 수정할 수 있습니다.");
        return;
    }

    const messages = getContactMessages();
    const message = messages.find((msg) => msg.id === messageId);
    if (!message) {
        alert("문의 내역을 찾을 수 없습니다.");
        return;
    }

    const newMessage = prompt("수정할 문의 내용을 입력하세요.", message.message);
    if (newMessage === null) return;

    const trimmed = newMessage.trim();
    if (!trimmed) {
        alert("문의 내용을 입력해주세요.");
        return;
    }

    message.message = trimmed;
    saveContactMessages(messages);
    addAdminLog("문의 수정", `작성자: ${message.name} / 문의 내용: ${trimmed}`);
    loadInquiries();
    loadAdminPanel();
    alert("문의가 수정되었습니다.");
};

window.deleteInquiry = function (messageId) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 문의를 삭제할 수 있습니다.");
        return;
    }

    const messages = getContactMessages();
    const message = messages.find((msg) => msg.id === messageId);
    if (!message) {
        alert("문의 내역을 찾을 수 없습니다.");
        return;
    }

    const ok = confirm("이 문의를 삭제하시겠습니까?");
    if (!ok) return;

    const filtered = messages.filter((msg) => msg.id !== messageId);
    saveContactMessages(filtered);
    addAdminLog("문의 삭제", `작성자: ${message.name} / 문의 내용: ${message.message}`);
    loadInquiries();
    loadAdminPanel();
    alert("문의가 삭제되었습니다.");
};

function addAdminLog(action, detail) {
    const currentUser = getCurrentUser();
    const logs = getAdminLogs();

    logs.unshift({
        id: Date.now(),
        action,
        actor: currentUser ? currentUser.name : "알 수 없음",
        actorEmail: currentUser ? currentUser.email : "",
        detail,
        createdAt: new Date().toLocaleString("ko-KR")
    });

    saveAdminLogs(logs);
}

function loadPosts() {
    if (!postList) return;

    const posts = getPosts()
        .slice()
        .sort((a, b) => {
            if ((b.isPinned ? 1 : 0) !== (a.isPinned ? 1 : 0)) {
                return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
            }
            if ((b.isNotice ? 1 : 0) !== (a.isNotice ? 1 : 0)) {
                return (b.isNotice ? 1 : 0) - (a.isNotice ? 1 : 0);
            }
            return b.id - a.id;
        });

    const boardEmptyState = document.getElementById("boardEmptyState");
    const boardListWrap = document.getElementById("boardListWrap");

    postList.innerHTML = "";

    if (posts.length === 0) {
        if (boardEmptyState) boardEmptyState.classList.remove("hidden");
        if (boardListWrap) boardListWrap.classList.add("hidden");
        return;
    }

    if (boardEmptyState) boardEmptyState.classList.add("hidden");
    if (boardListWrap) boardListWrap.classList.remove("hidden");


    const currentUser = getCurrentUser();

    posts.forEach((post) => {
        const canView = !post.isSecret || (currentUser && (currentUser.role === "admin" || currentUser.email === post.email));

        // 수정/삭제 권한: 관리자 또는 작성자 본인
        const canManage = currentUser && (currentUser.role === "admin" || currentUser.email === post.email);

        const div = document.createElement("div");
        div.className = `post_item ${post.isNotice ? "notice" : ""}`;

        // 마크다운 렌더링
        const renderedContent = canView ? renderMarkdown(post.content) : "작성자와 관리자만 볼 수 있습니다.";

        div.innerHTML = `
      <h4>${post.isPinned ? "📌 " : ""}${canView ? post.title : "비밀글입니다."}</h4>
      <div class="post_content">${renderedContent}</div>
      <div class="post_meta">
        작성자: ${post.author} · ${post.date}
        ${post.isSecret ? " · 비밀글" : ""}
        ${post.isNotice ? " · 공지" : ""}
      </div>
      ${canManage
                ? `
        <div class="post_actions">
          <button class="small_btn" onclick="editPost(${post.id})">수정</button>
          <button class="small_btn" onclick="deletePost(${post.id})">삭제</button>
        </div>
      `
                : ""
            }
    `;

        postList.appendChild(div);
    });
}

function loadInquiries() {
    const inquiryListWrap = document.getElementById("inquiryListWrap");
    const inquiryList = document.getElementById("inquiryList");
    if (!inquiryListWrap || !inquiryList) return;

    const currentUser = getCurrentUser();
    const messages = getContactMessages();

    if (messages.length === 0) {
        inquiryList.innerHTML = `<div class="admin_box"><h4>문의 내역 없음</h4><div class="admin_user_row">접수된 문의가 없습니다.</div></div>`;
        inquiryListWrap.classList.remove("hidden");
        return;
    }

    inquiryList.innerHTML = messages.map((entry, idx) => {
        const isAdmin = currentUser && currentUser.role === "admin";
        const hasReply = entry.reply && entry.reply.trim().length > 0;
        return `
            <div class="post_item">
                <h4>문의 #${idx + 1}</h4>
                <div class="inquiry_section">
                    <p><strong>작성자:</strong> ${entry.name}</p>
                    <p><strong>문의 내용:</strong> ${entry.message.replace(/\n/g, "<br>")}</p>
                </div>
                ${hasReply ? `
                    <div class="reply_section">
                        <h5>답글</h5>
                        <p>${entry.reply.replace(/\n/g, "<br>")}</p>
                    </div>
                ` : ""}
                ${isAdmin ? `
                    <div class="post_actions" style="gap:10px; margin-bottom:12px; align-items:center;">
                        <button class="small_btn" onclick="editInquiry(${entry.id})">문의 수정</button>
                        <button class="small_btn" onclick="deleteInquiry(${entry.id})">문의 삭제</button>
                        <button class="small_btn" onclick="toggleReplyForm(${entry.id})">
                            ${hasReply ? "답글 수정" : "답글 달기"}
                        </button>
                    </div>
                    <div id="replyForm-${entry.id}" class="reply_form hidden" style="margin-top:12px;">
                        <textarea id="replyText-${entry.id}" rows="4" placeholder="답글을 입력하세요">${entry.reply || ""}</textarea>
                        <button class="board_submit" type="button" onclick="submitInquiryReply(${entry.id})">답글 저장</button>
                    </div>
                ` : ""}
            </div>
        `;
    }).join("");

    inquiryListWrap.classList.remove("hidden");
}

// 탭 전환 처리
function showBoardTab(tab) {
    const boardListWrap = document.getElementById("boardListWrap");
    const inquiryListWrap = document.getElementById("inquiryListWrap");
    const boardWriteWrap = document.getElementById("boardWriteWrap");
    const boardEmptyState = document.getElementById("boardEmptyState");
    const openWriteBtn = document.getElementById("openWriteBtn");
    const title = document.getElementById("boardPageTitle");

    if (tab === "posts") {
        if (boardListWrap) boardListWrap.classList.remove("hidden");
        if (inquiryListWrap) inquiryListWrap.classList.add("hidden");
        if (openWriteBtn) openWriteBtn.style.display = "inline-block";
        if (title) title.textContent = "POSTS";
        loadPosts();
    } else if (tab === "inquiry") {
        if (boardListWrap) boardListWrap.classList.add("hidden");
        if (inquiryListWrap) inquiryListWrap.classList.remove("hidden");
        if (boardEmptyState) boardEmptyState.classList.add("hidden");
        if (openWriteBtn) openWriteBtn.style.display = "none";
        if (boardWriteWrap) boardWriteWrap.classList.add("hidden");
        if (title) title.textContent = "INQUIRY";
        loadInquiries();
    }
}

// 초기 탭/이벤트 바인딩
document.addEventListener("DOMContentLoaded", function () {
    const tabPosts = document.getElementById("tabPosts");
    const tabInquiry = document.getElementById("tabInquiry");
    if (tabPosts) tabPosts.addEventListener("click", () => showBoardTab("posts"));
    if (tabInquiry) tabInquiry.addEventListener("click", () => showBoardTab("inquiry"));

    // 기본: posts 탭
    // 단, 페이지가 이미 보이는 상태에서 loadPosts가 호출될 수 있으므로 안전하게 호출
    if (document.getElementById("board")) showBoardTab("posts");
});

postForm?.addEventListener("submit", function (e) {
    e.preventDefault();

    const title = document.getElementById("title").value.trim();
    const content = document.getElementById("content").value.trim();
    const authorInput = document.getElementById("author");
    const anonymousInput = document.getElementById("isAnonymous");

    if (!title || !content) {
        alert("제목과 내용을 입력해주세요.");
        return;
    }

    if (!anonymousInput.checked && !authorInput.value.trim()) {
        alert("작성자 이름을 입력해주세요.");
        return;
    }

    const posts = getPosts();
    const user = getCurrentUser();
    const author = anonymousInput.checked ? "익명" : authorInput.value.trim();

    if (editingPostId !== null) {
        const post = posts.find((p) => p.id === editingPostId);

        if (!post) {
            alert("게시글을 찾을 수 없습니다.");
            resetPostForm();
            return;
        }

        if (!user || (user.role !== "admin" && user.email !== post.email)) {
            alert("수정 권한이 없습니다.");
            return;
        }

        post.title = title;
        post.content = content;
        post.author = author;

        savePosts(posts);
        addAdminLog("게시글 수정", `${user.name} / 제목: ${post.title}`);
        resetPostForm();
        loadPosts();
        loadAdminPanel();
        const boardWriteWrap = document.getElementById("boardWriteWrap");
        if (boardWriteWrap) boardWriteWrap.classList.add("hidden");
        showPage("board");
        return;
    }

    posts.push({
        id: Date.now(),
        title,
        content,
        author,
        email: user ? user.email : "",
        isNotice: false,
        isPinned: false,
        date: new Date().toLocaleDateString("ko-KR")
    });

    savePosts(posts);
    addAdminLog("게시글 등록", `${author} / 제목: ${title} / 내용: ${content}`);
    resetPostForm();
    loadPosts();
    loadAdminPanel();
    const boardWriteWrap = document.getElementById("boardWriteWrap");
    if (boardWriteWrap) boardWriteWrap.classList.add("hidden");
    showPage("board");
    alert("게시글이 등록되었습니다.");
});

const noticeForm = document.getElementById("noticeForm");

noticeForm?.addEventListener("submit", function (e) {
    e.preventDefault();

    const user = getCurrentUser();
    if (!user) {
        alert("로그인이 필요합니다.");
        goLogin();
        return;
    }

    if (user.role !== "admin") {
        alert("관리자만 공지를 등록할 수 있습니다.");
        return;
    }

    const title = document.getElementById("noticeTitle").value.trim();
    const content = document.getElementById("noticeContent").value.trim();
    const isPinned = document.getElementById("noticePinned").checked;

    if (!title || !content) {
        alert("공지 제목과 내용을 입력해주세요.");
        return;
    }

    const posts = getPosts();

    posts.push({
        id: Date.now(),
        title,
        content,
        author: user.name,
        email: user.email,
        role: user.role,
        isSecret: false,
        isNotice: true,
        isPinned: isPinned,
        date: new Date().toLocaleDateString("ko-KR")
    });

    savePosts(posts);
    // 공지 등록 시에는 detail에 제목과 내용을 명확히 저장합니다.
    addAdminLog("공지 등록", `제목: ${title} / 내용: ${content}`);
    noticeForm.reset();
    loadPosts();
    loadAdminPanel();

    alert("공지사항이 등록되었습니다.");
});

window.editPost = function (postId) {
    const currentUser = getCurrentUser();
    const posts = getPosts();
    const post = posts.find((p) => p.id === postId);

    if (!post) {
        alert("게시글을 찾을 수 없습니다.");
        return;
    }

    if (!currentUser || (currentUser.role !== "admin" && currentUser.email !== post.email)) {
        alert("수정 권한이 없습니다.");
        return;
    }

    editingPostId = postId;
    setPostFormMode("edit");

    const titleInput = document.getElementById("title");
    const contentInput = document.getElementById("content");
    const authorInput = document.getElementById("author");
    const anonymousInput = document.getElementById("isAnonymous");
    const boardWriteWrap = document.getElementById("boardWriteWrap");

    if (titleInput) titleInput.value = post.title || "";
    if (contentInput) contentInput.value = post.content || "";
    if (anonymousInput) anonymousInput.checked = post.author === "익명";
    if (authorInput) {
        authorInput.value = post.author === "익명" ? "" : (post.author || "");
        authorInput.disabled = post.author === "익명";
    }

    updateMarkdownPreview();
    if (boardWriteWrap) boardWriteWrap.classList.remove("hidden");
};

window.deletePost = function (postId) {
    const currentUser = getCurrentUser();
    const posts = getPosts();
    const post = posts.find((p) => p.id === postId);

    if (!post) {
        alert("게시글을 찾을 수 없습니다.");
        return;
    }

    if (!currentUser || (currentUser.role !== "admin" && currentUser.email !== post.email)) {
        alert("삭제 권한이 없습니다.");
        return;
    }

    const ok = confirm(
        post.isNotice ? "공지사항을 삭제하시겠습니까?" : "게시글을 삭제하시겠습니까?"
    );
    if (!ok) return;

    const filtered = posts.filter((p) => p.id !== postId);
    savePosts(filtered);
    addAdminLog(
        post.isNotice ? "공지 삭제" : "게시글 삭제",
        `${currentUser.name} / 제목: ${post.title}`
    );
    loadPosts();
    loadAdminPanel();
    alert(post.isNotice ? "공지사항이 삭제되었습니다." : "게시글이 삭제되었습니다.");
};

const adminPanel = document.getElementById("adminPanel");

function loadAdminPanel() {
    if (!adminPanel) return;

    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        adminPanel.innerHTML = "<p>관리자만 볼 수 있습니다.</p>";
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const logs = getAdminLogs();

    const userCards = users.map((user, index) => {
        const isAdmin = user.role === "admin";

        return `
      <div class="admin_box">
        <h4>계정 ${index + 1} ${user.role === "admin" ? "👑" : "👤"} </h4>
        <div class="admin_user_row"><strong>이름:</strong> ${user.name}</div>
        <div class="admin_user_row"><strong>이메일:</strong> ${user.email}</div>
        <div class="admin_user_row">
          <strong>권한:</strong>
          <span class="role_badge ${user.role === "admin" ? "admin_badge" : "user_badge"}">
            ${user.role === "admin" ? "관리자" : "일반 사용자"}
          </span>
        </div>
        <div class="post_actions">
          <button class="small_btn" onclick="adminEditUser('${user.email}')">계정 수정</button>
          ${isAdmin
                ? `<button class="small_btn" onclick="adminRemoveAdmin('${user.email}')">관리자 해제</button>`
                : `<button class="small_btn" onclick="adminMakeAdmin('${user.email}')">관리자 지정</button>`
            }
          ${isAdmin
                ? ""
                : `<button class="small_btn" onclick="adminDeleteUser('${user.email}')">계정 삭제</button>`
            }
        </div>
      </div>
    `;
    }).join("");

        const logCards = logs.length
                ? logs.map((log) => {
                        // 공지 등록 항목은 제목/내용을 분리하여 제목을 먼저 보여줍니다.
                        if (log.action === "공지 등록") {
                                const parts = (log.detail || "").split("/").map(p => p.trim());
                                let titlePart = parts.find(p => p.startsWith("제목:")) || "";
                                let contentPart = parts.find(p => p.startsWith("내용:")) || "";
                                titlePart = titlePart.replace(/^제목:\s*/,'');
                                contentPart = contentPart.replace(/^내용:\s*/,'').replace(/\n/g, "<br>");

                                return `
                <div class="admin_box">
                    <h4>${log.action}</h4>
                    <div class="admin_user_row"><strong>처리자:</strong> ${log.actor}</div>
                    <div class="admin_user_row"><strong>제목:</strong> ${titlePart}</div>
                    <div class="admin_user_row"><strong>내용:</strong> ${contentPart}</div>
                    <div class="admin_user_row"><strong>시간:</strong> ${log.createdAt}</div>
                </div>
            `;
                        } else if (log.action === "게시글 등록") {
                                // 게시글 등록은 작성자(사용자), 제목, 내용을 분리하여 보여줍니다.
                                const parts = (log.detail || "").split("/").map(p => p.trim());
                                // 작성자 파트는 '제목:' 또는 '내용:'로 시작하지 않는 첫 파트로 간주
                                let authorPart = parts.find(p => !p.startsWith("제목:") && !p.startsWith("내용:")) || "";
                                let titlePart = parts.find(p => p.startsWith("제목:")) || "";
                                let contentPart = parts.find(p => p.startsWith("내용:")) || "";
                                titlePart = titlePart.replace(/^제목:\s*/,"");
                                contentPart = contentPart.replace(/^내용:\s*/,'').replace(/\n/g, "<br>");

                                return `
                <div class="admin_box">
                    <h4>${log.action}</h4>
                    <div class="admin_user_row"><strong>사용자:</strong> ${authorPart}</div>
                    <div class="admin_user_row"><strong>제목:</strong> ${titlePart}</div>
                    <div class="admin_user_row"><strong>내용:</strong> ${contentPart}</div>
                    <div class="admin_user_row"><strong>시간:</strong> ${log.createdAt}</div>
                </div>
            `;
                        }

                        return `
                <div class="admin_box">
                    <h4>${log.action}</h4>
                    <div class="admin_user_row"><strong>처리자:</strong> ${log.actor}</div>
                    <div class="admin_user_row"><strong>내용:</strong> ${log.detail}</div>
                    <div class="admin_user_row"><strong>시간:</strong> ${log.createdAt}</div>
                </div>
            `;
                }).join("")
                : `<div class="admin_box"><h4>기록 없음</h4><div class="admin_user_row">아직 기록이 없습니다.</div></div>`;

    const contactMessages = getContactMessages();
    const contactCards = contactMessages.length
        ? contactMessages.map((entry, index) => `
        <div class="admin_box">
          <h4>문의 #${index + 1}</h4>
          <div class="admin_user_row"><strong>작성자:</strong> ${entry.name}</div>
          <div class="admin_user_row"><strong>이메일:</strong> ${entry.email}</div>
          <div class="admin_user_row"><strong>문의 내용:</strong> ${entry.message.replace(/\n/g, "<br>")}</div>
          <div class="admin_user_row"><strong>접수 시간:</strong> ${entry.createdAt}</div>
        </div>
      `).join("")
        : `<div class="admin_box"><h4>문의 내역 없음</h4><div class="admin_user_row">접수된 문의가 없습니다.</div></div>`;

    adminPanel.innerHTML = `
    <div class="admin_section_title">회원가입된 계정</div>
    ${userCards}

    <div class="admin_section_title">관리자 기록 <button class="small_btn" onclick="clearAllAdminLogs()">기록 전체 삭제</button></div>
    ${logCards}

    <div class="admin_section_title">문의 내역</div>
    ${contactCards}
  `;
}

window.adminEditUser = function (email) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 가능합니다.");
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const target = users.find((u) => u.email === email);

    if (!target) {
        alert("계정을 찾을 수 없습니다.");
        return;
    }

    // ✅ 이름 수정 추가
    const newName = prompt("새 이름을 입력하세요.", target.name);
    if (newName === null) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
        alert("이름을 입력해주세요.");
        return;
    }

    const newEmail = prompt("새 이메일(아이디)을 입력하세요.", target.email);
    if (newEmail === null) return;

    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) {
        alert("이메일을 입력해주세요.");
        return;
    }

    const duplicated = users.find((u) => u.email === trimmedEmail && u.email !== target.email);
    if (duplicated) {
        alert("이미 존재하는 이메일입니다.");
        return;
    }

    const newPassword = prompt("새 비밀번호를 입력하세요.", target.password);
    if (newPassword === null) return;

    const trimmedPassword = newPassword.trim();
    if (!trimmedPassword) {
        alert("비밀번호를 입력해주세요.");
        return;
    }

    const oldEmail = target.email;

    // ✅ 적용
    target.name = trimmedName;
    target.email = trimmedEmail;
    target.password = trimmedPassword;

    localStorage.setItem(DB_USERS, JSON.stringify(users));

    // ✅ 현재 로그인 유저도 업데이트
    const current = getCurrentUser();
    if (current && current.email === oldEmail) {
        current.name = trimmedName;
        current.email = trimmedEmail;
        current.password = trimmedPassword;

        localStorage.setItem(DB_CURRENT_USER, JSON.stringify(current));
        renderHeaderAuth();
        loadPosts();
    }

    addAdminLog(
        "계정 수정",
        `${currentUser.name} / ${oldEmail} → ${trimmedEmail} (이름: ${trimmedName})`
    );

    loadAdminPanel();
    alert("계정 정보가 수정되었습니다.");
};

window.adminDeleteUser = function (email) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 가능합니다.");
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const target = users.find((u) => u.email === email);

    if (!target) {
        alert("계정을 찾을 수 없습니다.");
        return;
    }

    if ((target.role || "user") === "admin") {
        alert("관리자 계정은 삭제할 수 없습니다.");
        return;
    }

    const ok = confirm(`${target.email} 계정을 삭제하시겠습니까?`);
    if (!ok) return;

    const filteredUsers = users.filter((u) => u.email !== email);
    localStorage.setItem(DB_USERS, JSON.stringify(filteredUsers));

    addAdminLog("계정 삭제", `${currentUser.name} / 삭제된 계정: ${email}`);
    loadAdminPanel();
    alert("계정이 삭제되었습니다.");
};

window.adminMakeAdmin = function (email) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 가능합니다.");
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const target = users.find((u) => u.email === email);

    if (!target) {
        alert("계정을 찾을 수 없습니다.");
        return;
    }

    if ((target.role || "user") === "admin") {
        alert("이미 관리자 계정입니다.");
        return;
    }

    const ok = confirm(`${target.email} 계정을 관리자로 지정하시겠습니까?`);
    if (!ok) return;

    target.role = "admin";
    localStorage.setItem(DB_USERS, JSON.stringify(users));

    addAdminLog("관리자 지정", `${currentUser.name} / ${target.email} 계정을 관리자로 승격`);
    loadAdminPanel();
    loadPosts();
    alert("관리자 권한이 부여되었습니다.");
};

window.adminRemoveAdmin = function (email) {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 가능합니다.");
        return;
    }

    const users = JSON.parse(localStorage.getItem(DB_USERS)) || [];
    const target = users.find((u) => u.email === email);

    if (!target) {
        alert("계정을 찾을 수 없습니다.");
        return;
    }

    if ((target.role || "user") !== "admin") {
        alert("관리자 계정이 아닙니다.");
        return;
    }

    // 자기 자신은 관리자 해제 못 하게 막기
    if (target.email === currentUser.email) {
        alert("현재 로그인한 본인 계정은 관리자 해제할 수 없습니다.");
        return;
    }

    const ok = confirm(`${target.email} 계정의 관리자 권한을 해제하시겠습니까?`);
    if (!ok) return;

    target.role = "user";
    localStorage.setItem(DB_USERS, JSON.stringify(users));

    addAdminLog("관리자 해제", `${currentUser.name} / ${target.email} 계정을 일반 사용자로 변경`);
    loadAdminPanel();
    loadPosts();
    alert("관리자 권한이 해제되었습니다.");
};

window.clearAllAdminLogs = function () {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
        alert("관리자만 가능합니다.");
        return;
    }

    const ok = confirm("관리자 기록을 모두 삭제하시겠습니까? 복구할 수 없습니다.");
    if (!ok) return;

    saveAdminLogs([]);
    loadAdminPanel();
    alert("모든 관리자 기록이 삭제되었습니다.");
};

loadPosts();

// Certificates: 초기에는 <p>를 제거하고, 호버/포커스 시 동적으로 삽입하여 표시합니다
document.addEventListener("DOMContentLoaded", function () {
    const certItems = document.querySelectorAll(".cert_item");

    certItems.forEach((item) => {
        const descP = item.querySelector("div > p");
        if (descP) {
            const txt = descP.textContent.trim();
            item.dataset.desc = txt;
            descP.remove();
        }

        // 키보드 포커스 가능하도록 tabindex 추가
        if (!item.hasAttribute("tabindex")) item.setAttribute("tabindex", "0");

        const getInner = () => item.querySelector("div");

        const showDesc = () => {
            const inner = getInner();
            if (!inner) return;
            if (inner.querySelector("p")) return;
            const el = document.createElement("p");
            el.textContent = item.dataset.desc || "";
            inner.appendChild(el);
        };

        const hideDesc = () => {
            const inner = getInner();
            if (!inner) return;
            const el = inner.querySelector("p");
            if (el) el.remove();
        };

        item.addEventListener("mouseenter", showDesc);
        item.addEventListener("mouseleave", hideDesc);
        item.addEventListener("focus", showDesc);
        item.addEventListener("blur", hideDesc);

        // 모바일: 클릭으로 토글
        item.addEventListener("click", function (e) {
            if (window.innerWidth <= 768) {
                const el = item.querySelector("p");
                if (el) hideDesc();
                else showDesc();
            }
        });
    });
});
loadAdminPanel();


const openWriteBtn = document.getElementById("openWriteBtn");
const closeWriteBtn = document.getElementById("closeWriteBtn");
const boardWriteWrap = document.getElementById("boardWriteWrap");

openWriteBtn?.addEventListener("click", () => {
    resetPostForm();
    boardWriteWrap.classList.remove("hidden");
    fillAuthorName();
});

closeWriteBtn?.addEventListener("click", () => {
    resetPostForm();
    boardWriteWrap.classList.add("hidden");
});

// 익명 체크박스 처리
const isAnonymousCheckbox = document.getElementById("isAnonymous");
const authorInput = document.getElementById("author");
const contentInput = document.getElementById("content");

contentInput?.addEventListener("input", updateMarkdownPreview);
updateMarkdownPreview();

document.querySelectorAll(".password_toggle").forEach((button) => {
    button.addEventListener("click", function () {
        const input = document.getElementById(button.dataset.target);
        if (!input) return;

        const shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        button.textContent = shouldShow ? "🙈" : "👁️";
        button.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
    });
});

isAnonymousCheckbox?.addEventListener("change", function() {
    if (this.checked) {
        authorInput.disabled = true;
        authorInput.value = "";
    } else {
        authorInput.disabled = false;
        authorInput.value = "";
    }
});


